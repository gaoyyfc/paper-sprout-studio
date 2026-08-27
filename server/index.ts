import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import {nanoid} from 'nanoid';
import {makeCancelSignal} from '@remotion/renderer';
import {z} from 'zod';
import {generateImage} from './image-service.js';
import {
  createProjectFile,
  deleteProjectFile,
  ensureProjectFolders,
  listProjectFiles,
  listProjects,
  readProjectFile,
  safeProjectId,
  saveProjectFile,
} from './project-service.js';
import {renderProjectVideo} from './render.js';
import {generateStoryboardWithArk} from './text-service.js';
import {generateVoice, getVoiceProfile, selectBestVoiceProfile, selectUniqueCharacterVoiceProfile} from './voice-service.js';
import {getModelCatalog} from './model-catalog.js';
import type {VideoProject} from '../src/types.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(serverDir, '..');
dotenv.config({path: path.resolve(appDir, '..', '.env')});
dotenv.config({path: path.resolve(appDir, '.env.local'), override: true});

const publicDir = path.join(appDir, 'public');
const generatedDir = path.join(publicDir, 'generated');
const rendersDir = path.join(publicDir, 'renders');
const publicProjectsDir = path.join(publicDir, 'projects');
const projectsDir = path.join(appDir, 'data', 'projects');
await Promise.all([generatedDir, rendersDir, publicProjectsDir, projectsDir].map((dir) => mkdir(dir, {recursive: true})));

type RenderJob = {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'error';
  progress: number;
  stage: string;
  url?: string;
  filename?: string;
  error?: string;
};
const renderJobs = new Map<string, RenderJob>();
const renderCancels = new Map<string, () => void>();

const app = express();
app.use(express.json({limit: '40mb'}));
app.use('/generated', express.static(generatedDir));
app.use('/renders', express.static(rendersDir));
app.use('/projects', express.static(publicProjectsDir));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    imageModel: process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128',
    textModel: process.env.ARK_TEXT_MODEL || 'doubao-seed-2-0-mini-260428',
    credentialsReady: Boolean(process.env.ARK_API_KEY),
    voiceReady: Boolean(process.env.VOLC_TTS_ACCESS_TOKEN),
  });
});

app.get('/api/models', async (_request, response) => {
  response.json(await getModelCatalog());
});

app.get('/api/projects', async (_request, response) => {
  try {
    response.json({projects: await listProjects(projectsDir)});
  } catch (error) {
    response.status(500).json({error: error instanceof Error ? error.message : '项目列表读取失败'});
  }
});

app.post('/api/projects', async (request, response) => {
  try {
    const input = z.object({title: z.string().min(1).max(80), theme: z.string().min(1).max(300)}).parse(request.body);
    response.json({project: await createProjectFile(projectsDir, publicDir, input.title, input.theme)});
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '项目创建失败'});
  }
});

app.get('/api/projects/:id', async (request, response) => {
  try {
    response.json({project: await readProjectFile(projectsDir, request.params.id)});
  } catch (error) {
    response.status(404).json({error: error instanceof Error ? error.message : '项目不存在'});
  }
});

app.get('/api/projects/:id/files', async (request, response) => {
  try {
    response.json({files: await listProjectFiles(publicDir, request.params.id)});
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '项目文件读取失败'});
  }
});

app.delete('/api/projects/:id', async (request, response) => {
  try {
    await deleteProjectFile(projectsDir, publicDir, request.params.id);
    response.json({ok: true});
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '项目删除失败'});
  }
});

app.post('/api/projects/save', async (request, response) => {
  try {
    const project = z.object({id: z.string().min(1)}).passthrough().parse(request.body.project) as unknown as VideoProject;
    await saveProjectFile(projectsDir, publicDir, project);
    response.json({ok: true});
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '保存失败'});
  }
});

app.post('/api/storyboard/generate', async (request, response) => {
  try {
    const input = z.object({
      theme: z.string().min(2),
      lyrics: z.string().default(''),
      characterId: z.string().default(''),
      sceneCount: z.number().int().min(1).max(12).default(5),
      purpose: z.enum(['storyboard', 'copy']).default('storyboard'),
      modelId: z.string().min(2).max(160).optional(),
    }).parse(request.body);
    response.json(await generateStoryboardWithArk(input));
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '儿童文案生成失败'});
  }
});

app.post('/api/voice/generate', async (request, response) => {
  try {
    const input = z.object({text: z.string().min(2).max(1500), projectId: z.string().min(1), profileId: z.string().optional(), modelId: z.string().min(2).max(160).optional()}).parse(request.body);
    await ensureProjectFolders(publicDir, input.projectId);
    const selected = input.profileId ? getVoiceProfile(input.profileId) : selectBestVoiceProfile(input.text);
    response.json({...await generateVoice(input.text, publicDir, safeProjectId(input.projectId), {profileId: selected.id, resourceId: input.modelId}), profileId: selected.id});
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '配音生成失败'});
  }
});

app.post('/api/voice/generate-scenes', async (request, response) => {
  try {
    const input = z.object({
      projectId: z.string().min(1),
      scriptText: z.string().max(6000).optional(),
      modelId: z.string().min(2).max(160).optional(),
      scenes: z.array(z.object({id: z.string(), narration: z.string().min(1), characterId: z.string()})).min(1).max(12),
      characters: z.array(z.object({id: z.string(), name: z.string().optional(), description: z.string().optional(), voiceProfileId: z.string().optional()})),
    }).parse(request.body);
    await ensureProjectFolders(publicDir, input.projectId);
    const characterId = input.scenes.find((scene) => scene.characterId)?.characterId || '';
    const character = input.characters.find((item) => item.id === characterId);
    const selectedProfile = character?.voiceProfileId
      ? getVoiceProfile(character.voiceProfileId)
      : character
        ? selectUniqueCharacterVoiceProfile(`${character.id}:${character.name || ''}:${character.description || ''}`, input.characters.map((item) => item.voiceProfileId || '').filter(Boolean))
        : selectBestVoiceProfile(input.scriptText || input.scenes.map((scene) => scene.narration).join('\n'));
    const segments = [];
    for (const scene of input.scenes) {
      const result = await generateVoice(scene.narration, publicDir, safeProjectId(input.projectId), {
        profileId: selectedProfile.id,
        resourceId: input.modelId,
        filenamePrefix: `scene-${scene.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      });
      segments.push({sceneId: scene.id, characterId: scene.characterId, ...result});
    }
    response.json({
      segments,
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      selectionReason: character
        ? `固定使用 IP“${character.name || '当前角色'}”的专属音色；修改文案或重新生成视频都不会更换`
        : '当前分镜未绑定 IP，临时依据整篇文案选择统一音色',
    });
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '分镜配音生成失败'});
  }
});

const imageBody = z.object({
  projectId: z.string().min(1),
  kind: z.enum(['background', 'character']),
  prompt: z.string().min(2).max(1200),
  name: z.string().max(80).optional(),
  referenceImage: z.string().optional(),
  modelId: z.string().min(2).max(160).optional(),
  usedVoiceProfileIds: z.array(z.string().min(1).max(80)).max(50).optional(),
});

app.post('/api/images/generate', async (request, response) => {
  try {
    const input = imageBody.parse(request.body);
    const root = await ensureProjectFolders(publicDir, input.projectId);
    const image = await generateImage({
      ...input,
      publicDir,
      outputDir: path.join(root, 'images'),
      publicPrefix: `/projects/${safeProjectId(input.projectId)}/images`,
    });
    if (input.kind === 'character') {
      const voiceProfile = selectUniqueCharacterVoiceProfile(`${input.name || ''}:${input.prompt}`, input.usedVoiceProfileIds || []);
      response.json({...image, voiceProfileId: voiceProfile.id, voiceProfileName: voiceProfile.name, voiceDescription: voiceProfile.description});
    } else {
      response.json(image);
    }
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '图片生成失败'});
  }
});

app.post('/api/scenes/generate', async (request, response) => {
  try {
    const input = z.object({
      projectId: z.string().min(1),
      scene: z.record(z.string(), z.unknown()),
      referenceImage: z.string().optional(),
      modelId: z.string().min(2).max(160).optional(),
    }).parse(request.body);
    const scene = input.scene as unknown as VideoProject['scenes'][number];
      const root = await ensureProjectFolders(publicDir, input.projectId);
      const outputDir = path.join(root, 'images');
      const publicPrefix = `/projects/${safeProjectId(input.projectId)}/images`;
      const background = await generateImage({kind: 'background', prompt: scene.backgroundPrompt, publicDir, outputDir, publicPrefix, modelId: input.modelId});
      response.json({background});
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '分镜生成失败'});
  }
});

app.post('/api/render', (request, response) => {
  try {
    const project = request.body.project as VideoProject;
    if (!project?.id || !Array.isArray(project.scenes) || project.scenes.length === 0) throw new Error('项目数据不完整');
    const jobId = `render-${Date.now()}-${nanoid(5)}`;
    const job: RenderJob = {id: jobId, projectId: project.id, status: 'queued', progress: 0, stage: '等待渲染'};
    const {cancelSignal, cancel} = makeCancelSignal();
    renderJobs.set(jobId, job);
    renderCancels.set(jobId, cancel);
    response.status(202).json({jobId});
    void (async () => {
      try {
        job.status = 'running';
        const projectRoot = await ensureProjectFolders(publicDir, project.id);
        const filename = `${safeProjectId(project.id)}-${Date.now()}.mp4`;
        await renderProjectVideo(project, path.join(projectRoot, 'renders', filename), (progress, stage) => {
          job.progress = Math.max(job.progress, Math.min(1, progress));
          job.stage = stage;
        }, cancelSignal);
        if ((job as RenderJob).status === 'paused') return;
        job.status = 'done';
        job.progress = 1;
        job.stage = 'MP4 已完成';
        job.filename = filename;
        job.url = `/projects/${safeProjectId(project.id)}/renders/${filename}`;
      } catch (error) {
        if ((job as RenderJob).status === 'paused') {
          job.status = 'paused';
          job.stage = '渲染已暂停，可点击继续重新开始';
          return;
        }
        job.status = 'error';
        job.stage = '渲染失败';
        job.error = error instanceof Error ? error.message : '视频渲染失败';
      } finally {renderCancels.delete(jobId);}
    })();
  } catch (error) {
    response.status(400).json({error: error instanceof Error ? error.message : '无法开始渲染'});
  }
});

app.get('/api/render/:jobId', (request, response) => {
  const job = renderJobs.get(request.params.jobId);
  if (!job) return response.status(404).json({error: '渲染任务不存在或服务已重启'});
  response.json(job);
});

app.post('/api/render/:jobId/pause', (request, response) => {
  const job = renderJobs.get(request.params.jobId);
  if (!job) return response.status(404).json({error: '渲染任务不存在或服务已重启'});
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'paused';
    job.stage = '渲染已暂停，可点击继续重新开始';
    renderCancels.get(job.id)?.();
  }
  response.json(job);
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Paper Sprout API: http://${host}:${port}`);
});
