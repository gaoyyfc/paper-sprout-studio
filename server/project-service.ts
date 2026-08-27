import {mkdir, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {nanoid} from 'nanoid';
import type {VideoProject} from '../src/types.js';
import {buildStoryboard} from './storyboard.js';
import {normalizeCharacterVoiceAssignments} from './voice-service.js';

export type ProjectSummary = {
  id: string;
  title: string;
  theme: string;
  sceneCount: number;
  updatedAt: string;
  folder: string;
};

export const safeProjectId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '-');

export const ensureProjectFolders = async (publicDir: string, id: string) => {
  const projectRoot = path.join(publicDir, 'projects', safeProjectId(id));
  await Promise.all(['images', 'audio', 'renders'].map((folder) => mkdir(path.join(projectRoot, folder), {recursive: true})));
  return projectRoot;
};

export const saveProjectFile = async (projectsDir: string, publicDir: string, project: VideoProject) => {
  const id = safeProjectId(project.id);
  await ensureProjectFolders(publicDir, id);
  const characters = normalizeCharacterVoiceAssignments(project.characters);
  await writeFile(path.join(projectsDir, `${id}.json`), JSON.stringify({...project, id, characters}, null, 2), 'utf8');
};

export const listProjects = async (projectsDir: string): Promise<ProjectSummary[]> => {
  const entries = await readdir(projectsDir, {withFileTypes: true});
  const projects = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map(async (entry) => {
    try {
      const project = JSON.parse(await readFile(path.join(projectsDir, entry.name), 'utf8')) as VideoProject;
      return {
        id: project.id,
        title: project.title,
        theme: project.theme,
        sceneCount: project.scenes.length,
        updatedAt: project.updatedAt,
        folder: `projects/${project.id}`,
      };
    } catch {
      return null;
    }
  }));
  return projects.filter((item): item is ProjectSummary => item !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const readProjectFile = async (projectsDir: string, id: string) => {
  const project = JSON.parse(await readFile(path.join(projectsDir, `${safeProjectId(id)}.json`), 'utf8')) as VideoProject;
  const characters = normalizeCharacterVoiceAssignments(
    project.characters.filter((character) => !character.imageUrl.toLowerCase().endsWith('.svg')),
  );
  const selectedCharacterId = characters.some((character) => character.id === project.selectedCharacterId)
    ? project.selectedCharacterId
    : characters[0]?.id || '';
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
  const existingVoiceSegments = project.voiceSegments || [];
  const voiceMatchesSelectedCharacter = !existingVoiceSegments.length
    || !selectedCharacter?.voiceProfileId
    || project.voiceProfileId === selectedCharacter.voiceProfileId;
  return {
    ...project,
    audioUrl: voiceMatchesSelectedCharacter ? project.audioUrl : '',
    backgroundMusicUrl: project.backgroundMusicUrl || '/audio/paper-sprout-playful.wav',
    backgroundMusicVolume: project.backgroundMusicVolume ?? 0.12,
    voiceVolume: project.voiceVolume ?? 1,
    voiceProfileId: selectedCharacter?.voiceProfileId || project.voiceProfileId,
    voiceProfileName: selectedCharacter?.voiceProfileName || project.voiceProfileName || project.voiceSegments?.[0]?.profileName,
    voiceSelectionReason: selectedCharacter
      ? `固定使用 IP“${selectedCharacter.name}”的专属音色，重新生成文案或视频也不会更换`
      : project.voiceSelectionReason,
    textModel: project.textModel || process.env.ARK_TEXT_MODEL || 'doubao-seed-2-0-mini-260428',
    imageModel: project.imageModel || process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128',
    voiceModel: project.voiceModel || process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0',
    transitionSeconds: project.transitionSeconds ?? 1,
    selectedCharacterId,
    characters,
    voiceSegments: (voiceMatchesSelectedCharacter ? existingVoiceSegments : []).map((segment) => ({...segment, audioUrl: segment.audioUrl.replace(/^\/?public\//, '/')})),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      characterId: selectedCharacterId,
      backgroundUrl: scene.backgroundUrl.toLowerCase().endsWith('.svg') ? '' : scene.backgroundUrl.replace(/^\/?public\//, '/'),
      characterUrl: scene.useCharacter ? selectedCharacter?.imageUrl || '' : '',
    })),
  };
};

export const createProjectFile = async (projectsDir: string, publicDir: string, title: string, theme: string): Promise<VideoProject> => {
  const id = `video-${Date.now()}-${nanoid(5).toLowerCase()}`;
  const storyboard = buildStoryboard(theme, '', '');
  const project: VideoProject = {
    id,
    title,
    theme,
    lyrics: storyboard.lyrics,
    platform: 'Douyin',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 30,
    style: '儿童剪纸绘本',
    selectedCharacterId: '',
    audioUrl: '',
    backgroundMusicUrl: '/audio/paper-sprout-playful.wav',
    backgroundMusicVolume: 0.12,
    voiceVolume: 1,
    textModel: process.env.ARK_TEXT_MODEL || 'doubao-seed-2-0-mini-260428',
    imageModel: process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128',
    voiceModel: process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0',
    transitionSeconds: 1,
    characters: [],
    scenes: storyboard.scenes.map((scene) => ({...scene, characterId: '', backgroundUrl: '', characterUrl: ''})),
    updatedAt: new Date().toISOString(),
  };
  await saveProjectFile(projectsDir, publicDir, project);
  return project;
};

export const deleteProjectFile = async (projectsDir: string, publicDir: string, id: string) => {
  const safeId = safeProjectId(id);
  await rm(path.join(projectsDir, `${safeId}.json`), {force: true});
  await rm(path.join(publicDir, 'projects', safeId), {recursive: true, force: true});
};

export const listProjectFiles = async (publicDir: string, id: string) => {
  const root = await ensureProjectFolders(publicDir, id);
  const result: Array<{path: string; size: number; kind: 'file' | 'folder'}> = [];
  const walk = async (dir: string, prefix = '') => {
    const entries = await readdir(dir, {withFileTypes: true});
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        result.push({path: `${relative}/`, size: 0, kind: 'folder'});
        await walk(path.join(dir, entry.name), `${relative}/`);
      } else {
        const info = await stat(path.join(dir, entry.name));
        result.push({path: relative, size: info.size, kind: 'file'});
      }
    }
  };
  await walk(root);
  return result;
};
