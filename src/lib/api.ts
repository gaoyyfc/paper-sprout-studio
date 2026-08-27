import type {AiModelCatalog, ImageGenerationResult, PaperCharacter, ProjectFile, ProjectSummary, RenderJob, StoryScene, VideoProject, VoiceSegment} from '../types';

const jsonRequest = async <T>(url: string, body?: unknown, method?: string, retries = 0, signal?: AbortSignal): Promise<T> => {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: method || (body ? 'POST' : 'GET'),
        headers: {'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
      const raw = await response.text();
      let data: {error?: string} & Record<string, unknown>;
      try {
        data = raw ? JSON.parse(raw) as {error?: string} & Record<string, unknown> : {};
      } catch {
        throw new Error('AI 服务返回了不完整的数据');
      }
      if (!response.ok) {
        const error = new Error(data.error || (response.status >= 500 ? 'AI 服务暂时不可用' : `请求失败（${response.status}）`));
        if (attempt < retries && (response.status >= 500 || response.status === 429 || !raw)) {
          lastError = error;
          await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
          continue;
        }
        error.name = 'NonRetryableError';
        throw error;
      }
      if (!raw) throw new Error('AI 服务连接刚刚中断，没有返回生成结果');
      return data as T;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        const paused = new Error('生成已暂停');
        paused.name = 'AbortError';
        throw paused;
      }
      lastError = error instanceof Error ? error : new Error('网络连接中断');
      if (lastError.name === 'NonRetryableError') break;
      if (attempt >= retries) break;
      await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  if (lastError?.name === 'NonRetryableError') throw lastError;
  throw new Error(`${lastError?.message || '请求失败'}，自动重试后仍未恢复`);
};

export const api = {
  health: () => jsonRequest<{ok: boolean; imageModel: string; textModel: string; credentialsReady: boolean; voiceReady: boolean}>('/api/health'),
  models: () => jsonRequest<AiModelCatalog>('/api/models'),
  listProjects: () => jsonRequest<{projects: ProjectSummary[]}>('/api/projects'),
  createProject: (title: string, theme: string) => jsonRequest<{project: VideoProject}>('/api/projects', {title, theme}),
  getProject: (id: string) => jsonRequest<{project: VideoProject}>(`/api/projects/${encodeURIComponent(id)}`),
  deleteProject: (id: string) => jsonRequest<{ok: true}>(`/api/projects/${encodeURIComponent(id)}`, undefined, 'DELETE'),
  projectFiles: (id: string) => jsonRequest<{files: ProjectFile[]}>(`/api/projects/${encodeURIComponent(id)}/files`),
  generateCharacter: (projectId: string, name: string, prompt: string, modelId?: string, usedVoiceProfileIds: string[] = [], signal?: AbortSignal) =>
    jsonRequest<ImageGenerationResult>('/api/images/generate', {projectId, kind: 'character', name, prompt, modelId, usedVoiceProfileIds}, undefined, 2, signal),
  generateScene: (projectId: string, scene: StoryScene, referenceImage?: string, modelId?: string, signal?: AbortSignal) =>
    jsonRequest<{background: ImageGenerationResult; character?: ImageGenerationResult}>(
      '/api/scenes/generate',
      {projectId, scene, referenceImage, modelId},
      undefined,
      2,
      signal,
    ),
  generateStoryboard: (theme: string, lyrics: string, characterId: string, sceneCount: number, purpose: 'storyboard' | 'copy' = 'storyboard', modelId?: string, signal?: AbortSignal) =>
    jsonRequest<{title: string; lyrics: string; scenes: StoryScene[]; model: string; qualityWarnings?: string[]; qualitySuggestion?: string[]; qualityStatus?: 'passed' | 'review'}>('/api/storyboard/generate', {
      theme,
      lyrics,
      characterId,
      sceneCount,
      purpose,
      modelId,
    }, undefined, 1, signal),
  saveProject: (project: VideoProject) => jsonRequest<{ok: true}>('/api/projects/save', {project}),
  generateVoice: (projectId: string, text: string, profileId?: string, modelId?: string, signal?: AbortSignal) =>
    jsonRequest<{audioUrl: string; voice: string; resourceId: string; profileId: string; profileName: string}>('/api/voice/generate', {projectId, text, profileId, modelId}, undefined, 0, signal),
  generateSceneVoices: (projectId: string, scenes: StoryScene[], characters: PaperCharacter[], scriptText?: string, modelId?: string, signal?: AbortSignal) =>
    jsonRequest<{segments: VoiceSegment[]; profileId?: string; profileName?: string; selectionReason?: string}>('/api/voice/generate-scenes', {
      projectId,
      scriptText: scriptText || scenes.map((scene) => scene.narration).join('\n'),
      modelId,
      scenes: scenes.map(({id, narration, characterId}) => ({id, narration, characterId})),
      characters: characters.map(({id, name, description, voiceProfileId}) => ({id, name, description, voiceProfileId})),
    }, undefined, 1, signal),
  startRender: (project: VideoProject) => jsonRequest<{jobId: string}>('/api/render', {project}),
  renderJob: (jobId: string) => jsonRequest<RenderJob>(`/api/render/${encodeURIComponent(jobId)}`),
  pauseRender: (jobId: string) => jsonRequest<RenderJob>(`/api/render/${encodeURIComponent(jobId)}/pause`, {}),
};
