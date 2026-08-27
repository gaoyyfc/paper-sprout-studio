import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type ReactFlowInstance,
} from '@xyflow/react';
import {Check, Cloud, FolderHeart, LayoutTemplate, Play, Plus, Save, Sparkles, Users} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {CharacterLibrary} from './components/CharacterLibrary';
import {AdaptiveEdge, type WorkflowEdge, type WorkflowEdgeData, type WorkflowEdgeStatus} from './components/AdaptiveEdge';
import {PreviewPanel} from './components/PreviewPanel';
import {ProjectDrawer} from './components/ProjectDrawer';
import {SceneEditor} from './components/SceneEditor';
import {ThemeTemplatePanel} from './components/ThemeTemplatePanel';
import {CharacterNode, ComposeNode, OutputNode, SceneNode, StoryNode, ThemeNode, VoiceNode} from './components/nodes';
import {createInitialProject} from './data/sample';
import {api} from './lib/api';
import type {AiModelCatalog, PaperCharacter, ProjectFile, ProjectSummary, RenderJob, StoryScene, VideoProject} from './types';

const nodeTypes = {theme: ThemeNode, character: CharacterNode, story: StoryNode, scene: SceneNode, compose: ComposeNode, voice: VoiceNode, output: OutputNode};
const edgeTypes = {adaptive: AdaptiveEdge};
const edgeStyle = {stroke: '#9aa99d', strokeWidth: 2};
type AutomationPhase = 'idle' | 'character' | 'story' | 'images' | 'voice' | 'render';
type PausableTask = 'auto' | 'character' | 'story' | 'voice' | 'render' | `scene:${string}`;
const isPauseError = (error: unknown) => error instanceof Error && error.name === 'AbortError';

const downloadProjectBackup = (project: VideoProject) => {
  const safeTitle = (project.title || project.id || '儿歌视频项目').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 60);
  const blob = new Blob([JSON.stringify(project, null, 2)], {type: 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeTitle}-${project.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const makeEdges = (project: VideoProject, state: {automationActive: boolean; autoPhase: AutomationPhase; renderError: boolean}): WorkflowEdge[] => {
  const themeReady = project.theme.trim().length >= 2;
  const selectedCharacter = project.characters.find((item) => item.id === project.selectedCharacterId);
  const characterReady = themeReady && Boolean(selectedCharacter?.imageUrl && selectedCharacter.status !== 'error');
  const contentMatchesTheme = project.automationTheme === undefined || project.automationTheme === project.theme.trim();
  const storyReady = characterReady && contentMatchesTheme && Boolean(project.lyrics.trim()) && project.scenes.length > 0 && project.scenes.every((scene) => scene.narration.trim());
  const scenesReady = storyReady && project.scenes.every((scene) => scene.status === 'ready' && scene.backgroundUrl && (!scene.useCharacter || scene.characterUrl));
  const voiceReady = scenesReady && project.scenes.every((scene) => project.voiceSegments?.some((segment) => segment.sceneId === scene.id));
  const data = (status: WorkflowEdgeStatus, label: string, lane = 0): WorkflowEdgeData => ({status, label, lane});
  const sceneStatus = (scene: StoryScene): WorkflowEdgeData => {
    if (scene.status === 'error') return data('error', '需要重试', scene.order);
    if (scene.status === 'generating') return state.automationActive ? data('running', '正在生图', scene.order) : data('ready', '手动生图中', scene.order);
    if (scene.status === 'ready' && scene.backgroundUrl) return data('done', '图片完成', scene.order);
    return storyReady ? data('ready', '可以生图', scene.order) : data('blocked', '等待文案', scene.order);
  };
  const edges: WorkflowEdge[] = [
    {id: 'theme-character', source: 'theme', target: 'character', data: characterReady ? data('done', '主题与IP就绪') : state.automationActive && state.autoPhase === 'character' && themeReady ? data('running', '正在准备IP') : themeReady ? data('ready', '可以选择IP') : data('blocked', '等待主题')},
    {id: 'character-story', source: 'character', target: 'story', data: storyReady ? data('done', '文案已完成') : state.automationActive && state.autoPhase === 'story' && characterReady ? data('running', '正在写儿歌') : characterReady ? data('ready', '可以生成文案') : data('blocked', '等待IP')},
    ...project.scenes.flatMap((scene) => [
      {id: `story-${scene.id}`, source: 'story', target: scene.id, data: sceneStatus(scene)},
      {id: `${scene.id}-compose`, source: scene.id, target: 'compose', data: sceneStatus(scene)},
    ] as WorkflowEdge[]),
    {id: 'compose-voice', source: 'compose', target: 'voice', data: voiceReady ? data('done', '统一配音完成') : state.automationActive && state.autoPhase === 'voice' && scenesReady ? data('running', '正在统一配音') : scenesReady ? data('ready', '可以生成配音') : project.scenes.some((scene) => scene.status === 'error') ? data('error', '先修复分镜') : data('blocked', '等待全部分镜')},
    {id: 'voice-output', source: 'voice', target: 'output', data: state.renderError ? data('error', '渲染失败') : state.automationActive && state.autoPhase === 'render' ? data('running', '正在渲染') : voiceReady ? data('done', '可以预览导出') : data('blocked', '等待配音')},
  ];
  return edges.map((edge) => ({...edge, type: 'adaptive'}));
};

const blankScene = (order: number, characterId: string): StoryScene => ({
  id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, order, title: `新分镜 ${order}`, beat: '自定义分镜', duration: 6,
  narration: '', subtitle: '', backgroundPrompt: '', actionPrompt: '', backgroundUrl: '', characterUrl: '', useCharacter: Boolean(characterId), characterId,
  status: 'draft', characterLayout: {x: order % 2 ? 52 : 10, y: 50, width: 40, opacity: 1, entrance: order % 2 ? 'right' : 'left'},
});

const mergeGeneratedScenes = (current: StoryScene[], generated: StoryScene[], copyOnly: boolean) => generated.map((next, index) => {
  const existing = current[index];
  if (!existing) return next;
  if (copyOnly) {
    return {...existing, narration: next.narration, subtitle: next.subtitle};
  }
  return {
    ...next,
    id: existing.id,
    order: index + 1,
    duration: existing.duration,
    backgroundUrl: existing.backgroundUrl,
    characterUrl: existing.characterUrl,
    useCharacter: existing.useCharacter,
    characterId: existing.characterId,
    status: existing.status,
    error: existing.error,
    characterLayout: existing.characterLayout,
  };
});

const App = () => {
  const [project, setProject] = useState<VideoProject>(createInitialProject);
  const projectRef = useRef(project);
  const manualAutomaticRunRef = useRef(false);
  const taskControllersRef = useRef(new Map<PausableTask, AbortController>());
  const autoResumePhaseRef = useRef<AutomationPhase>('idle');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sceneEditorOpen, setSceneEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [sceneCount, setSceneCount] = useState(5);
  const [storyBusy, setStoryBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoPhase, setAutoPhase] = useState<AutomationPhase>('idle');
  const [autoStage, setAutoStage] = useState('');
  const [renderJob, setRenderJob] = useState<RenderJob>();
  const [renderUrl, setRenderUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [pausedTasks, setPausedTasks] = useState<Partial<Record<PausableTask, boolean>>>({});
  const [toast, setToast] = useState('');
  const [health, setHealth] = useState<{credentialsReady: boolean; voiceReady: boolean; imageModel: string; textModel: string} | null>(null);
  const [modelCatalog, setModelCatalog] = useState<AiModelCatalog>({text: [], image: [], voice: [], sourceHost: '', pricingNote: ''});
  const [projectHydrated, setProjectHydrated] = useState(false);
  const flowInstanceRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = useCallback((message: string) => {setToast(message); window.setTimeout(() => setToast(''), 3200);}, []);
  const beginTask = useCallback((task: PausableTask) => {
    taskControllersRef.current.get(task)?.abort();
    const controller = new AbortController();
    taskControllersRef.current.set(task, controller);
    setPausedTasks((current) => ({...current, [task]: false}));
    return controller;
  }, []);
  const finishTask = useCallback((task: PausableTask, controller: AbortController) => {
    if (taskControllersRef.current.get(task) === controller) taskControllersRef.current.delete(task);
  }, []);
  const pauseTask = useCallback((task: PausableTask, label: string) => {
    taskControllersRef.current.get(task)?.abort();
    setPausedTasks((current) => ({...current, [task]: true}));
    showToast(`${label}已暂停，点击继续可重新接上`);
  }, [showToast]);
  const refreshProjects = useCallback(async () => {const result = await api.listProjects(); setProjects(result.projects);}, []);
  const refreshFiles = useCallback(async () => {try {setProjectFiles((await api.projectFiles(projectRef.current.id)).files);} catch {setProjectFiles([]);}}, []);

  useEffect(() => {projectRef.current = project; localStorage.setItem(`paper-sprout-project:${project.id}`, JSON.stringify(project));}, [project]);
  useEffect(() => {
    void api.health().then(setHealth).catch(() => setHealth(null));
    void api.models().then(setModelCatalog).catch(() => setModelCatalog({text: [], image: [], voice: [], sourceHost: '', pricingNote: ''}));
    void (async () => {
      try {
        let result = await api.listProjects();
        if (result.projects.length === 0) {await api.saveProject(projectRef.current); result = await api.listProjects();}
        setProjects(result.projects);
        const first = result.projects[0];
        if (first) {
          const loaded = (await api.getProject(first.id)).project;
          setProject(loaded); setSceneCount(loaded.scenes.length); setSelectedSceneId(loaded.scenes[0]?.id || '');
        }
      } catch (error) {showToast(error instanceof Error ? error.message : '项目服务未连接');}
      finally {setProjectHydrated(true);}
    })();
  }, [refreshProjects, showToast]);

  useEffect(() => {
    if (!projectHydrated) return;
    const timer = window.setTimeout(() => {void api.saveProject(projectRef.current).then(refreshProjects).catch(() => undefined);}, 900);
    return () => window.clearTimeout(timer);
  }, [project, projectHydrated, refreshProjects]);

  const patchProject = useCallback((patch: Partial<VideoProject>) => {
    const optimistic = {...projectRef.current, ...patch, updatedAt: new Date().toISOString()};
    projectRef.current = optimistic;
    setProject((current) => {
      const next = {...current, ...patch, updatedAt: optimistic.updatedAt};
      projectRef.current = next;
      return next;
    });
  }, []);
  const replaceProject = useCallback((next: VideoProject) => {
    projectRef.current = next;
    setProject(next);
  }, []);
  const updateScene = useCallback((id: string, patch: Partial<StoryScene>) => setProject((current) => {
    const narrationChanged = patch.narration !== undefined && patch.narration !== current.scenes.find((scene) => scene.id === id)?.narration;
    return {
      ...current,
      scenes: current.scenes.map((scene) => scene.id === id ? {...scene, ...patch} : scene),
      duration: current.scenes.reduce((sum, scene) => sum + (scene.id === id && patch.duration !== undefined ? patch.duration : scene.duration), 0),
      ...(narrationChanged ? {audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined} : {}),
      updatedAt: new Date().toISOString(),
    };
  }), []);

  const runTextGeneration = useCallback(async (purpose: 'storyboard' | 'copy') => {
    const current = projectRef.current; const copyOnly = purpose === 'copy'; const controller = beginTask('story'); setStoryBusy(true);
    try {
      const targetCount = copyOnly ? Math.max(1, current.scenes.length) : sceneCount;
      const sourceLyrics = copyOnly ? current.lyrics : '';
      const result = await api.generateStoryboard(current.theme.trim(), sourceLyrics, current.selectedCharacterId, targetCount, purpose, current.textModel, controller.signal);
      const mergedScenes = mergeGeneratedScenes(current.scenes, result.scenes, copyOnly);
      setProject((value) => ({
          ...value,
          title: copyOnly ? value.title : result.title,
          lyrics: result.lyrics,
          copyQualityWarnings: result.qualityWarnings || [],
          copyQualitySuggestion: result.qualitySuggestion || [],
          copyQualityReviewed: !(result.qualityWarnings?.length),
          automationTheme: current.theme.trim(),
          scenes: mergedScenes,
          audioUrl: '',
          voiceSegments: [],
          voiceProfileId: undefined,
          voiceProfileName: undefined,
          voiceSelectionReason: undefined,
          duration: mergedScenes.reduce((sum, scene) => sum + scene.duration, 0),
          updatedAt: new Date().toISOString(),
      }));
      setSceneCount(targetCount);
      setSelectedSceneId((selected) => mergedScenes.some((scene) => scene.id === selected) ? selected : mergedScenes[0]?.id || '');
      showToast(result.qualityWarnings?.length
        ? `文案已生成，并标出 ${result.qualityWarnings.length} 项质量提醒；请自行决定保留或再生成`
        : copyOnly
          ? `已用 ${result.model} 重写儿童文案，画布、图片和角色排版均已保留`
          : `已用 ${result.model} 更新文案与分镜提示词，原有排版和图片均已保留`);
    } catch (error) {if (!isPauseError(error)) showToast(error instanceof Error ? error.message : '文案生成失败');} finally {finishTask('story', controller); setStoryBusy(false);}
  }, [beginTask, finishTask, sceneCount, showToast]);
  const regenerateCopy = useCallback(() => {void runTextGeneration('copy');}, [runTextGeneration]);
  const updateLyrics = useCallback((value: string) => {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    setProject((current) => ({
      ...current,
      lyrics: value,
      copyQualityWarnings: [],
      copyQualitySuggestion: [],
      copyQualityReviewed: true,
      automationTheme: current.theme.trim(),
      scenes: current.scenes.map((scene, index) => lines[index] ? {...scene, narration: lines[index], subtitle: lines[index]} : scene),
      audioUrl: '',
      voiceSegments: [],
      voiceProfileId: undefined,
      voiceProfileName: undefined,
      voiceSelectionReason: undefined,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const useQualitySuggestion = useCallback(() => {
    setProject((current) => {
      const lines = current.copyQualitySuggestion || [];
      if (!lines.length) return current;
      const scenes = current.scenes.map((scene, index) => lines[index] ? {...scene, narration: lines[index], subtitle: lines[index]} : scene);
      return {...current, lyrics: lines.join('\n'), scenes, copyQualityWarnings: [], copyQualitySuggestion: [], copyQualityReviewed: true, audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined, updatedAt: new Date().toISOString()};
    });
    showToast('已采用系统质量优化版，原有节点排版和分镜图片保持不变');
  }, [showToast]);

  const generateScene = useCallback(async (id: string) => {
    const current = projectRef.current; const scene = current.scenes.find((item) => item.id === id);
    const character = current.characters.find((item) => item.id === current.selectedCharacterId);
    if (!scene) return;
    if (!scene.backgroundPrompt.trim()) {showToast('请先填写背景提示词'); setSelectedSceneId(id); setSceneEditorOpen(true); return;}
    if (scene.useCharacter && !character?.imageUrl) {showToast('请先从形象库选择一个 IP'); setCharacterOpen(true); return;}
    const task = `scene:${id}` as const; const controller = beginTask(task); updateScene(id, {status: 'generating', error: ''});
    try {
      const result = await api.generateScene(current.id, scene, character?.imageUrl, current.imageModel, controller.signal);
      updateScene(id, {backgroundUrl: result.background.imageUrl, characterId: current.selectedCharacterId, characterUrl: scene.useCharacter ? character?.imageUrl || '' : '', status: 'ready'});
      showToast(`${scene.title} 已生成背景，并锁定使用“${character?.name || '已选 IP'}”`); void refreshFiles();
    } catch (error) {updateScene(id, isPauseError(error) ? {status: 'draft', error: ''} : {status: 'error', error: error instanceof Error ? error.message : '生成失败'});} finally {finishTask(task, controller);}
  }, [beginTask, finishTask, refreshFiles, showToast, updateScene]);

  const generateCharacter = useCallback(async (name: string, description: string) => {
    const current = projectRef.current;
    const controller = beginTask('character');
    try {
      const result = await api.generateCharacter(current.id, name, description, current.imageModel, current.characters.map((item) => item.voiceProfileId || '').filter(Boolean), controller.signal);
      const character: PaperCharacter = {id: `ip-${Date.now()}`, name, description, imageUrl: result.imageUrl, status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: result.voiceProfileId, voiceProfileName: result.voiceProfileName, voiceDescription: result.voiceDescription, alphaReport: result.alphaReport};
      setProject((value) => ({...value, selectedCharacterId: character.id, characters: [...value.characters, character], scenes: value.scenes.map((scene) => ({...scene, characterId: character.id, characterUrl: scene.useCharacter ? character.imageUrl : '', status: scene.backgroundUrl ? 'ready' : 'draft'})), audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined, updatedAt: new Date().toISOString()}));
      showToast(result.alphaReport?.quality === 'fallback' ? `${name} 已用兜底抠图加入形象库，并绑定“${result.voiceProfileName || '专属音色'}”` : `${name} 已生成、完成抠图并绑定“${result.voiceProfileName || '专属音色'}”`); void refreshFiles();
    } finally {finishTask('character', controller);}
  }, [beginTask, finishTask, refreshFiles, showToast]);

  const previewCharacterVoice = useCallback(async (character: PaperCharacter) => {
    if (!character.voiceProfileId) throw new Error('这个 IP 还没有绑定专属音色');
    const currentCharacter = projectRef.current.characters.find((item) => item.id === character.id) || character;
    let audioUrl = currentCharacter.voicePreviewUrl;
    if (!audioUrl) {
      const previewText = `小朋友，你好啊，我是你的好朋友${character.name}。`;
      const result = await api.generateVoice(projectRef.current.id, previewText, character.voiceProfileId, projectRef.current.voiceModel);
      audioUrl = result.audioUrl;
      const nextProject = {
        ...projectRef.current,
        characters: projectRef.current.characters.map((item) => item.id === character.id
          ? {...item, voicePreviewUrl: audioUrl, voiceProfileName: item.voiceProfileName || result.profileName}
          : item),
        updatedAt: new Date().toISOString(),
      };
      projectRef.current = nextProject;
      setProject(nextProject);
      await api.saveProject(nextProject);
      void refreshFiles();
    }
    voicePreviewAudioRef.current?.pause();
    const audio = new Audio(audioUrl);
    voicePreviewAudioRef.current = audio;
    await audio.play();
    showToast(`正在试听“${character.name}”的专属声音`);
  }, [refreshFiles, showToast]);

  const selectCharacter = useCallback((id: string) => setProject((current) => {const character = current.characters.find((item) => item.id === id); return {...current, selectedCharacterId: id, scenes: current.scenes.map((scene) => ({...scene, characterId: id, characterUrl: scene.useCharacter ? character?.imageUrl || '' : '', status: scene.backgroundUrl ? 'ready' : 'draft'})), audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined, updatedAt: new Date().toISOString()};}), []);
  const deleteCharacter = useCallback((id: string) => {
    if (!window.confirm('确定从当前项目删除这个形象吗？已生成的文件仍保留在项目文件夹中。')) return;
    setProject((current) => {
      const characters = current.characters.filter((item) => item.id !== id); const nextId = current.selectedCharacterId === id ? characters[0]?.id || '' : current.selectedCharacterId;
      const nextCharacter = characters.find((item) => item.id === nextId);
      return {...current, characters, selectedCharacterId: nextId, scenes: current.scenes.map((scene) => ({...scene, characterId: nextId, characterUrl: scene.useCharacter ? nextCharacter?.imageUrl || '' : '', status: scene.backgroundUrl ? 'ready' : 'draft'})), audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined, updatedAt: new Date().toISOString()};
    });
  }, []);

  const addScene = useCallback(() => {
    const current = projectRef.current; const scene = blankScene(current.scenes.length + 1, current.selectedCharacterId);
    setProject((value) => ({...value, scenes: [...value.scenes, scene], duration: value.duration + scene.duration, audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined, updatedAt: new Date().toISOString()}));
    setSceneCount(current.scenes.length + 1); setSelectedSceneId(scene.id); setSceneEditorOpen(true);
  }, []);
  const deleteScene = useCallback((id: string) => {
    if (!window.confirm('确定删除这个分镜吗？')) return;
    setProject((current) => {const scenes = current.scenes.filter((scene) => scene.id !== id).map((scene, index) => ({...scene, order: index + 1})); return {...current, scenes, duration: scenes.reduce((sum, scene) => sum + scene.duration, 0), audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined, updatedAt: new Date().toISOString()};});
    setSceneCount((current) => Math.max(1, current - 1));
    setSceneEditorOpen(false);
  }, []);
  const moveScene = useCallback((id: string, direction: -1 | 1) => setProject((current) => {
    const scenes = [...current.scenes]; const index = scenes.findIndex((scene) => scene.id === id); const target = index + direction;
    if (index < 0 || target < 0 || target >= scenes.length) return current;
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    return {...current, scenes: scenes.map((scene, order) => ({...scene, order: order + 1})), updatedAt: new Date().toISOString()};
  }), []);

  const saveProject = useCallback(async () => {
    setSaving(true);
    try {
      const current = projectRef.current;
      await api.saveProject(current);
      await refreshProjects();
      downloadProjectBackup(current);
      showToast(`保存成功：项目已写入 data/projects/${current.id}.json，并下载 JSON 备份`);
    } catch (error) {showToast(error instanceof Error ? error.message : '保存失败');}
    finally {setSaving(false);}
  }, [refreshProjects, showToast]);
    const generateProjectVoice = useCallback(async () => {
      const current = projectRef.current;
      const scenesReady = current.scenes.length > 0 && current.scenes.every((scene) => scene.status === 'ready' && scene.backgroundUrl && scene.narration.trim());
      if (!scenesReady) {showToast('请先完成全部分镜图片和文案，再生成配音'); return;}
      const controller = beginTask('voice'); setVoiceBusy(true);
      try {const result = await api.generateSceneVoices(current.id, current.scenes.filter((scene) => scene.narration.trim()), current.characters, `${current.theme}\n${current.lyrics}`, current.voiceModel, controller.signal); const durations = new Map(result.segments.map((segment) => [segment.sceneId, segment.durationSeconds])); const scenes = current.scenes.map((scene) => {const voiceDuration = durations.get(scene.id); return voiceDuration ? {...scene, duration: Math.ceil((voiceDuration + 1) * 10) / 10} : scene;}); const profileName = result.profileName || result.segments[0]?.profileName; patchProject({audioUrl: '', voiceSegments: result.segments, scenes, duration: scenes.reduce((sum, scene) => sum + scene.duration, 0), voiceProfileId: result.profileId, voiceProfileName: profileName, voiceSelectionReason: result.selectionReason}); showToast(`已使用当前 IP 的专属音色“${profileName || '儿童动画女声'}”，${result.segments.length} 段配音完成`); void refreshFiles();}
    catch (error) {if (!isPauseError(error)) showToast(error instanceof Error ? error.message : '配音生成失败');} finally {finishTask('voice', controller); setVoiceBusy(false);}
  }, [beginTask, finishTask, patchProject, refreshFiles, showToast]);

  const runAutomaticCreation = useCallback(async () => {
    if (!manualAutomaticRunRef.current) return;
    manualAutomaticRunRef.current = false;
    if (autoBusy) return;
    let working = projectRef.current;
    const normalizedTheme = working.theme.trim();
    if (normalizedTheme.length < 2) {showToast('请先输入至少两个字的创作主题'); return;}
    const controller = beginTask('auto');
    const resumePhase = autoResumePhaseRef.current;
    const hasIncompleteScenes = working.scenes.some((scene) => scene.status !== 'ready' || !scene.backgroundUrl || (scene.useCharacter && !scene.characterUrl));
    const legacyInterruptedRun = working.automationTheme === undefined && working.scenes.some((scene) => scene.status === 'generating');
    const canResume = working.scenes.length === sceneCount
      && Boolean(working.lyrics.trim())
      && hasIncompleteScenes
      && (working.automationTheme === normalizedTheme || legacyInterruptedRun);
    const reuseExistingStoryboard = ['images', 'voice', 'render'].includes(resumePhase)
      && Boolean(working.lyrics.trim())
      && working.scenes.length > 0
      && working.automationTheme === normalizedTheme;
    setAutoBusy(true); setAutoPhase('idle'); setRenderUrl(''); setRenderJob(undefined);
    try {
      let character = working.characters.find((item) => item.id === working.selectedCharacterId) || working.characters[0];
      if (!character) {
        autoResumePhaseRef.current = 'character';
        setAutoPhase('character');
        setAutoStage('1/5 · 自动创建并校验主角 IP');
        const generated = await api.generateCharacter(working.id, '芽芽', `围绕“${normalizedTheme}”创作的可爱儿童剪纸绘本主角，2-6岁儿童喜欢，圆润友好，完整全身，服装简洁鲜明`, working.imageModel, working.characters.map((item) => item.voiceProfileId || '').filter(Boolean), controller.signal);
        character = {
          id: `ip-${Date.now()}`,
          name: '芽芽',
          description: `围绕“${normalizedTheme}”自动生成的儿童主角`,
          imageUrl: generated.imageUrl,
          status: 'ready',
          createdAt: new Date().toISOString(),
          voiceProfileId: generated.voiceProfileId,
          voiceProfileName: generated.voiceProfileName,
          voiceDescription: generated.voiceDescription,
          alphaReport: generated.alphaReport,
        };
        working = {...working, characters: [character], selectedCharacterId: character.id, updatedAt: new Date().toISOString()};
        replaceProject(working);
      } else if (working.selectedCharacterId !== character.id) {
        working = {...working, selectedCharacterId: character.id, updatedAt: new Date().toISOString()};
        replaceProject(working);
      }

      if (!canResume && !reuseExistingStoryboard) {
        autoResumePhaseRef.current = 'story';
        setAutoPhase('story');
        setAutoStage('1/5 · 创作活泼押韵的儿歌与分镜');
        const storyboard = await api.generateStoryboard(normalizedTheme, '', character.id, sceneCount, 'storyboard', working.textModel, controller.signal);
        const scenes = mergeGeneratedScenes(working.scenes, storyboard.scenes, false).map((scene) => ({
          ...scene,
          characterId: character.id,
          backgroundUrl: '',
          characterUrl: scene.useCharacter ? character.imageUrl : '',
          status: 'draft' as const,
          error: '',
        }));
        working = {
          ...working,
          title: storyboard.title,
          lyrics: storyboard.lyrics,
          copyQualityWarnings: storyboard.qualityWarnings || [],
          copyQualitySuggestion: storyboard.qualitySuggestion || [],
          copyQualityReviewed: !(storyboard.qualityWarnings?.length),
          scenes,
          automationTheme: normalizedTheme,
          duration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
          audioUrl: '', voiceSegments: [],
          updatedAt: new Date().toISOString(),
        };
        replaceProject(working); setSceneCount(scenes.length); setSelectedSceneId(scenes[0]?.id || '');
      } else {
        setAutoStage('检测到上次中断 · 从未完成的分镜继续');
        working = {...working, automationTheme: normalizedTheme, scenes: working.scenes.map((scene) => scene.status === 'generating' ? {...scene, status: 'draft', error: ''} : scene), updatedAt: new Date().toISOString()};
        replaceProject(working);
      }

      autoResumePhaseRef.current = 'images'; setAutoPhase('images');
      const pendingScenes = working.scenes.filter((scene) => scene.status !== 'ready' || !scene.backgroundUrl || (scene.useCharacter && !scene.characterUrl));
      for (let index = 0; index < pendingScenes.length; index += 1) {
        const scene = working.scenes.find((item) => item.id === pendingScenes[index].id) || pendingScenes[index];
        setAutoStage(`2/5 · 生成剩余分镜 ${index + 1}/${pendingScenes.length}（背景与角色并行）`);
        working = {...working, scenes: working.scenes.map((item) => item.id === scene.id ? {...item, status: 'generating', error: ''} : item), updatedAt: new Date().toISOString()};
        replaceProject(working);
        try {
          const result = await api.generateScene(working.id, scene, character.imageUrl, working.imageModel, controller.signal);
          working = {...working, scenes: working.scenes.map((item) => item.id === scene.id ? {...item, backgroundUrl: result.background.imageUrl, characterId: character.id, characterUrl: item.useCharacter ? character.imageUrl : '', status: 'ready', error: ''} : item), updatedAt: new Date().toISOString()};
          replaceProject(working);
        } catch (error) {
          if (isPauseError(error)) {
            working = {...working, scenes: working.scenes.map((item) => item.id === scene.id ? {...item, status: 'draft', error: ''} : item), updatedAt: new Date().toISOString()};
            replaceProject(working);
            throw error;
          }
          const message = error instanceof Error ? error.message : '生图失败';
          working = {...working, scenes: working.scenes.map((item) => item.id === scene.id ? {...item, status: 'error', error: message} : item), updatedAt: new Date().toISOString()};
          replaceProject(working);
          throw new Error(`${scene.title} 生图失败：${message}`);
        }
      }

      if (resumePhase !== 'render' || !working.voiceSegments?.length) {
        autoResumePhaseRef.current = 'voice'; setAutoPhase('voice'); setAutoStage('3/5 · 分析整篇文案并选择统一音色');
        const voice = await api.generateSceneVoices(working.id, working.scenes, working.characters, `${working.theme}\n${working.lyrics}`, working.voiceModel, controller.signal);
        const voiceDurations = new Map(voice.segments.map((segment) => [segment.sceneId, segment.durationSeconds]));
        const timedScenes = working.scenes.map((scene) => {const voiceDuration = voiceDurations.get(scene.id); return voiceDuration ? {...scene, duration: Math.ceil((voiceDuration + 1) * 10) / 10} : scene;});
        working = {...working, scenes: timedScenes, duration: timedScenes.reduce((sum, scene) => sum + scene.duration, 0), audioUrl: '', voiceSegments: voice.segments, voiceProfileId: voice.profileId, voiceProfileName: voice.profileName || voice.segments[0]?.profileName, voiceSelectionReason: voice.selectionReason, updatedAt: new Date().toISOString()};
        replaceProject(working);
      }

      setAutoPhase('idle'); setAutoStage('4/5 · 保存项目并准备 Remotion');
      await api.saveProject(working);
      await refreshProjects();

      autoResumePhaseRef.current = 'render'; setAutoPhase('render'); setAutoStage('5/5 · 自动渲染 MP4'); setPreviewOpen(true);
      const {jobId} = await api.startRender(working);
      let job = await api.renderJob(jobId); setRenderJob(job);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (controller.signal.aborted) {await api.pauseRender(jobId).catch(() => undefined); throw new DOMException('生成已暂停', 'AbortError');}
        job = await api.renderJob(jobId); setRenderJob(job);
      }
      if (job.status === 'paused') throw new DOMException('生成已暂停', 'AbortError');
      if (job.status === 'error') throw new Error(job.error || 'MP4 渲染失败');
      setRenderUrl(job.url || ''); setAutoStage('全部完成 · MP4 可以预览和下载');
      autoResumePhaseRef.current = 'idle';
      showToast('文案、分镜、配音和 MP4 已全部自动完成');
      void refreshFiles();
    } catch (error) {
      setAutoPhase('idle');
      const paused = isPauseError(error);
      const message = paused ? '已在当前节点暂停，点击继续将从这里接上' : error instanceof Error ? error.message : '自动创作失败';
      setPausedTasks((current) => ({...current, auto: true}));
      setAutoStage(`自动流程已暂停 · ${message}`);
      showToast(message);
      await api.saveProject(projectRef.current).catch(() => undefined);
    } finally {
      finishTask('auto', controller);
      setAutoBusy(false); setAutoPhase('idle');
    }
  }, [autoBusy, beginTask, finishTask, refreshFiles, refreshProjects, replaceProject, sceneCount, showToast]);

  const startAutomaticCreationFromButton = useCallback(() => {
    autoResumePhaseRef.current = 'idle';
    manualAutomaticRunRef.current = true;
    void runAutomaticCreation();
  }, [runAutomaticCreation]);

  const continueAutomaticCreation = useCallback(() => {
    manualAutomaticRunRef.current = true;
    void runAutomaticCreation();
  }, [runAutomaticCreation]);

  const pauseAutomaticCreation = useCallback(() => {
    pauseTask('auto', '完整视频流程');
    const activeRender = renderJob;
    if (activeRender && (activeRender.status === 'queued' || activeRender.status === 'running')) {
      void api.pauseRender(activeRender.id).then(setRenderJob).catch(() => undefined);
    }
  }, [pauseTask, renderJob]);

  const useThemeTemplate = useCallback((theme: string) => {
    if (autoBusy) return;
    setTemplateOpen(false);
    setRenderUrl(''); setRenderJob(undefined);
    patchProject({theme, automationTheme: ''});
    setAutoStage(`已填入“${theme}” · 点击一键生成后才会开始`);
    showToast('主题已填入画布，流程尚未启动');
  }, [autoBusy, patchProject, showToast]);

  const renderProject = useCallback(async () => {
    if (renderJob?.status === 'running' || renderJob?.status === 'queued') return;
    const controller = beginTask('render');
    setRenderUrl(''); setPreviewOpen(true);
    try {
      await api.saveProject(projectRef.current); const {jobId} = await api.startRender(projectRef.current);
      let job = await api.renderJob(jobId); setRenderJob(job);
      while (job.status === 'queued' || job.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (controller.signal.aborted) {await api.pauseRender(jobId).catch(() => undefined); throw new DOMException('生成已暂停', 'AbortError');}
        job = await api.renderJob(jobId); setRenderJob(job);
      }
      if (job.status === 'paused') throw new DOMException('生成已暂停', 'AbortError');
      if (job.status === 'error') throw new Error(job.error || '渲染失败');
      setRenderUrl(job.url || ''); showToast('MP4 渲染完成，可以下载'); void refreshFiles();
    } catch (error) {if (!isPauseError(error)) showToast(error instanceof Error ? error.message : '渲染失败');}
    finally {finishTask('render', controller);}
  }, [beginTask, finishTask, refreshFiles, renderJob?.status, showToast]);

  const pauseManualRender = useCallback(() => {
    pauseTask('render', 'MP4 渲染');
    const activeRender = renderJob;
    if (activeRender && (activeRender.status === 'queued' || activeRender.status === 'running')) {
      void api.pauseRender(activeRender.id).then(setRenderJob).catch((error) => showToast(error instanceof Error ? error.message : '暂停渲染失败'));
    }
  }, [pauseTask, renderJob, showToast]);

  const openProjectById = useCallback(async (id: string) => {try {const next = (await api.getProject(id)).project; setProject(next); setSceneCount(next.scenes.length); setSelectedSceneId(next.scenes[0]?.id || ''); setProjectFiles((await api.projectFiles(id)).files); setRenderJob(undefined); setRenderUrl(''); setProjectOpen(false);} catch (error) {showToast(error instanceof Error ? error.message : '项目打开失败');}}, [showToast]);
  const createProject = useCallback(async (title: string, theme: string) => {const next = (await api.createProject(title, theme)).project; setProject(next); setSceneCount(next.scenes.length); setSelectedSceneId(next.scenes[0]?.id || ''); await refreshProjects(); setProjectFiles([]); showToast('已创建独立视频项目');}, [refreshProjects, showToast]);
  const deleteProject = useCallback(async (id: string) => {if (!window.confirm('确定删除整个项目及其图片、音频和渲染文件吗？此操作不可恢复。')) return; await api.deleteProject(id); const result = await api.listProjects(); setProjects(result.projects); if (id === projectRef.current.id) {if (result.projects[0]) await openProjectById(result.projects[0].id); else await createProject('新的儿歌视频', '认识颜色');}}, [createProject, openProjectById]);

  const openScene = useCallback((id: string) => {setSelectedSceneId(id); setSceneEditorOpen(true);}, []);
  const openProjectDrawer = useCallback(() => {setTemplateOpen(false); setCharacterOpen(false); setPreviewOpen(false); setSceneEditorOpen(false); setProjectOpen(true); void refreshFiles();}, [refreshFiles]);
  const focusCreationCanvas = useCallback(() => {
    setTemplateOpen(false); setProjectOpen(false); setCharacterOpen(false); setPreviewOpen(false); setSceneEditorOpen(false);
    window.requestAnimationFrame(() => {void flowInstanceRef.current?.fitView({padding: 0.12, duration: 420});});
    showToast('已返回创作画布并整理节点视图');
  }, [showToast]);
  const rendering = autoPhase === 'render' || renderJob?.status === 'queued' || renderJob?.status === 'running';
  const finalPreviewReady = project.scenes.length > 0
    && project.scenes.every((scene) => scene.status === 'ready' && scene.backgroundUrl)
    && project.scenes.every((scene) => project.voiceSegments?.some((segment) => segment.sceneId === scene.id));
  const buildNodes = useCallback((current: VideoProject): Node[] => {
    const selectedCharacter = current.characters.find((item) => item.id === current.selectedCharacterId);
    const themeReady = current.theme.trim().length >= 2;
    const characterReady = themeReady && Boolean(selectedCharacter?.imageUrl && selectedCharacter.status !== 'error');
    const contentMatchesTheme = current.automationTheme === undefined || current.automationTheme === current.theme.trim();
    const storyReady = characterReady && contentMatchesTheme && Boolean(current.lyrics.trim()) && current.scenes.length > 0 && current.scenes.every((scene) => scene.narration.trim());
    const scenesReady = storyReady && current.scenes.every((scene) => scene.status === 'ready' && scene.backgroundUrl && (!scene.useCharacter || scene.characterUrl));
    const voiceReady = scenesReady && current.scenes.every((scene) => current.voiceSegments?.some((segment) => segment.sceneId === scene.id));
    const sceneStartX = 930; const sceneHeightGap = 285;
    const mainFlowY = 35 + Math.max(0, current.scenes.length - 1) * sceneHeightGap / 2;
    const composeX = sceneStartX + 330;
    const textModel = current.textModel || health?.textModel || modelCatalog.text[0]?.id || '';
    const imageModel = current.imageModel || health?.imageModel || modelCatalog.image[0]?.id || '';
    const voiceModel = current.voiceModel || modelCatalog.voice[0]?.id || '';
    const automaticPaused = Boolean(pausedTasks.auto);
    const pausedAutoPhase = autoResumePhaseRef.current;
    const firstPendingSceneId = current.scenes.find((scene) => scene.status !== 'ready' || !scene.backgroundUrl || (scene.useCharacter && !scene.characterUrl))?.id;
    return [
      {id: 'theme', type: 'theme', position: {x: 0, y: mainFlowY}, data: {theme: current.theme, sceneCount, onTheme: (value: string) => patchProject({theme: value, automationTheme: ''}), onSceneCount: setSceneCount, onGenerate: startAutomaticCreationFromButton, onPause: pauseAutomaticCreation, onContinue: continueAutomaticCreation, busy: autoBusy, paused: automaticPaused, stage: autoStage, generated: Boolean(current.lyrics), pendingScenes: current.scenes.filter((scene) => scene.status !== 'ready' || !scene.backgroundUrl || (scene.useCharacter && !scene.characterUrl)).length, connected: Boolean(health?.credentialsReady)}},
      {id: 'character', type: 'character', position: {x: 310, y: mainFlowY}, data: {name: selectedCharacter?.name || '', imageUrl: selectedCharacter?.imageUrl || '', onManage: () => setCharacterOpen(true), onPause: pauseAutomaticCreation, onContinue: continueAutomaticCreation, busy: autoPhase === 'character', paused: automaticPaused && pausedAutoPhase === 'character', model: imageModel, modelOptions: modelCatalog.image, onModel: (value: string) => patchProject({imageModel: value}), locked: !themeReady, lockReason: '请先填写创作主题'}},
      {id: 'story', type: 'story', position: {x: 620, y: mainFlowY}, data: {lyrics: current.lyrics, qualityWarnings: current.copyQualityWarnings || [], hasQualitySuggestion: Boolean(current.copyQualitySuggestion?.length), onUseQualitySuggestion: useQualitySuggestion, onAcceptQuality: () => {patchProject({copyQualityWarnings: [], copyQualitySuggestion: [], copyQualityReviewed: true}); showToast('已保留当前文案版本');}, onLyrics: updateLyrics, onRegenerate: regenerateCopy, onPause: autoPhase === 'story' ? pauseAutomaticCreation : () => pauseTask('story', '文案生成'), onContinue: automaticPaused && pausedAutoPhase === 'story' ? continueAutomaticCreation : regenerateCopy, busy: storyBusy || autoPhase === 'story', paused: Boolean(pausedTasks.story) || (automaticPaused && pausedAutoPhase === 'story'), model: textModel, modelOptions: modelCatalog.text, onModel: (value: string) => patchProject({textModel: value}), connected: Boolean(health?.credentialsReady), locked: !characterReady, lockReason: '请先完成并绑定 IP 形象'}},
      ...current.scenes.map((scene, index) => {
        const automaticScenePaused = automaticPaused && pausedAutoPhase === 'images' && scene.id === firstPendingSceneId;
        return {id: scene.id, type: 'scene', position: {x: sceneStartX, y: 35 + index * sceneHeightGap}, data: {scene, onOpen: () => openScene(scene.id), onGenerate: () => generateScene(scene.id), onPause: autoPhase === 'images' ? pauseAutomaticCreation : () => pauseTask(`scene:${scene.id}`, '分镜图片生成'), onContinue: automaticScenePaused ? continueAutomaticCreation : () => generateScene(scene.id), paused: automaticScenePaused || Boolean(pausedTasks[`scene:${scene.id}`]), onDelete: () => deleteScene(scene.id), model: imageModel, modelOptions: modelCatalog.image, onModel: (value: string) => patchProject({imageModel: value}), locked: !storyReady, lockReason: '请先完成儿童儿歌文案'}};
      }),
      {id: 'compose', type: 'compose', position: {x: composeX, y: mainFlowY}, data: {ready: current.scenes.filter((scene) => scene.status === 'ready').length, total: current.scenes.length, onOpen: () => setPreviewOpen(true), locked: !scenesReady, lockReason: '请先完成所有分镜图片'}},
      {id: 'voice', type: 'voice', position: {x: composeX + 310, y: mainFlowY}, data: {audioReady: voiceReady || Boolean(current.audioUrl), voiceCount: current.voiceSegments?.length || 0, busy: voiceBusy || autoPhase === 'voice', paused: Boolean(pausedTasks.voice) || (automaticPaused && pausedAutoPhase === 'voice'), onGenerate: generateProjectVoice, onPause: autoPhase === 'voice' ? pauseAutomaticCreation : () => pauseTask('voice', '配音生成'), onContinue: automaticPaused && pausedAutoPhase === 'voice' ? continueAutomaticCreation : generateProjectVoice, voiceName: current.voiceProfileName || selectedCharacter?.voiceProfileName, selectionReason: current.voiceSelectionReason || (selectedCharacter ? `固定使用“${selectedCharacter.name}”的专属音色` : undefined), model: voiceModel, modelOptions: modelCatalog.voice, onModel: (value: string) => patchProject({voiceModel: value, audioUrl: '', voiceSegments: [], voiceProfileId: undefined, voiceProfileName: undefined, voiceSelectionReason: undefined}), backgroundMusicVolume: current.backgroundMusicVolume ?? 0.12, voiceVolume: current.voiceVolume ?? 1, onBackgroundMusicVolume: (value: number) => patchProject({backgroundMusicVolume: value}), onVoiceVolume: (value: number) => patchProject({voiceVolume: value}), locked: !scenesReady, lockReason: '请先完成所有分镜图片'}},
      {id: 'output', type: 'output', position: {x: composeX + 620, y: mainFlowY}, data: {onPreview: () => setPreviewOpen(true), onRender: renderProject, onPause: autoPhase === 'render' ? pauseAutomaticCreation : pauseManualRender, onContinue: automaticPaused && pausedAutoPhase === 'render' ? continueAutomaticCreation : renderProject, rendering, paused: Boolean(pausedTasks.render) || (automaticPaused && pausedAutoPhase === 'render'), progress: renderJob?.progress || 0, locked: !voiceReady, lockReason: '请先生成整支视频的统一配音'}},
    ];
  }, [autoBusy, autoPhase, autoStage, continueAutomaticCreation, deleteScene, generateProjectVoice, generateScene, health?.credentialsReady, health?.imageModel, health?.textModel, modelCatalog.image, modelCatalog.text, modelCatalog.voice, openScene, patchProject, pauseAutomaticCreation, pauseManualRender, pauseTask, pausedTasks, regenerateCopy, renderJob?.progress, renderProject, rendering, sceneCount, startAutomaticCreationFromButton, storyBusy, updateLyrics, useQualitySuggestion, voiceBusy]);

  useEffect(() => {
    setNodes((previous) => buildNodes(project).map((node) => ({...node, position: project.nodePositions?.[node.id] || previous.find((item) => item.id === node.id)?.position || node.position})));
    setEdges(makeEdges(project, {automationActive: autoBusy, autoPhase, renderError: renderJob?.status === 'error'}));
  }, [autoPhase, buildNodes, project, renderJob?.status, rendering, storyBusy, voiceBusy]);
  useEffect(() => {
    if (!nodes.length) return;
    const timer = window.setTimeout(() => {
      const positions = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
      const saved = projectRef.current.nodePositions || {};
      const unchanged = Object.keys(positions).length === Object.keys(saved).length
        && Object.entries(positions).every(([id, position]) => saved[id]?.x === position.x && saved[id]?.y === position.y);
      if (!unchanged) {
        setProject((current) => ({...current, nodePositions: positions, updatedAt: new Date().toISOString()}));
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [nodes]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const settledPositions = changes.filter((change) => change.type === 'position' && change.position && change.dragging === false);
    if (settledPositions.length) {
      setProject((current) => ({
        ...current,
        nodePositions: settledPositions.reduce((positions, change) => change.type === 'position' && change.position ? {...positions, [change.id]: change.position} : positions, current.nodePositions || {}),
        updatedAt: new Date().toISOString(),
      }));
    }
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)), []);
  const onConnect = useCallback((connection: Connection) => setEdges((current) => addEdge({...connection, type: 'adaptive', data: {status: 'ready', label: '自定义连接'}}, current)), []);
  const selectedScene = useMemo(() => project.scenes.find((scene) => scene.id === selectedSceneId), [project.scenes, selectedSceneId]);

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Sparkles size={20} /></span><div><strong>纸芽</strong><small>儿歌 AI 视频工坊</small></div></div>
      <button className="project-title" onClick={openProjectDrawer}><FolderHeart size={16} /><span>{project.title}</span><small>{project.id}</small></button>
      <div className="topbar-actions"><div className={`api-badge ${health?.credentialsReady ? 'is-ready' : ''}`}><Cloud size={14} />{health?.credentialsReady ? `文案 + 生图${health.voiceReady ? ' + 语音' : ''} 已连接` : 'AI 服务未连接'}</div><button className="ghost-button" onClick={saveProject} disabled={saving} title={`写入 data/projects/${project.id}.json，同时下载一份可备份的项目 JSON`}><Save size={16} /> {saving ? '保存中' : '保存到本地'}</button><button className="primary-button top-preview" onClick={() => setPreviewOpen(true)} disabled={!finalPreviewReady} title={finalPreviewReady ? '打开最终成片预览' : '请先完成全部分镜和统一配音'}><Play size={16} /> 预览成片</button></div>
    </header>
    <section className="workspace"><nav className="side-rail"><button className={!templateOpen && !projectOpen && !characterOpen && !previewOpen && !sceneEditorOpen ? 'is-active' : ''} onClick={focusCreationCanvas} title="关闭侧面板并自动整理全部节点"><Sparkles size={18} /><span>创作画布</span></button><button className={templateOpen ? 'is-active' : ''} onClick={() => {setProjectOpen(false); setCharacterOpen(false); setPreviewOpen(false); setSceneEditorOpen(false); setTemplateOpen((value) => !value);}}><LayoutTemplate size={18} /><span>创作模板</span></button><button className={projectOpen ? 'is-active' : ''} onClick={openProjectDrawer}><FolderHeart size={18} /><span>项目管理</span></button><button className={characterOpen ? 'is-active' : ''} onClick={() => {setTemplateOpen(false); setProjectOpen(false); setPreviewOpen(false); setSceneEditorOpen(false); setCharacterOpen(true);}}><Users size={18} /><span>IP 形象</span></button><button className={previewOpen ? 'is-active' : ''} onClick={() => {setTemplateOpen(false); setProjectOpen(false); setCharacterOpen(false); setSceneEditorOpen(false); setPreviewOpen(true);}} disabled={!finalPreviewReady} title={finalPreviewReady ? '打开最终成片预览' : '请先完成全部分镜和统一配音'}><Play size={18} /><span>成片预览</span></button></nav>
      <ThemeTemplatePanel open={templateOpen} currentTheme={project.theme} busy={autoBusy} connected={Boolean(health?.credentialsReady)} onClose={() => setTemplateOpen(false)} onSelect={useThemeTemplate} />
      <div className="canvas-wrap"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={(instance) => {flowInstanceRef.current = instance;}} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => node.type === 'scene' && !node.data.locked && openScene(node.id)} fitView fitViewOptions={{padding: 0.1}} minZoom={0.28} maxZoom={1.5} defaultEdgeOptions={{type: 'adaptive'}} connectionLineStyle={edgeStyle} proOptions={{hideAttribution: true}}>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#c8cec3" /><Controls position="bottom-left" showInteractive={false} /><MiniMap position="bottom-right" nodeColor={(node) => node.type === 'scene' ? '#7ca99e' : node.type === 'output' ? '#315a53' : '#d7c9ad'} maskColor="rgba(247,243,232,.72)" />
        <Panel position="top-left" className="canvas-panel"><span>输入主题即可自动完成</span><small>文案 → 分镜图片 → 配音 → MP4；仍可点开任意节点局部修改</small>{modelCatalog.sourceHost ? <small className="canvas-panel__models">模型来自 {modelCatalog.sourceHost} · {modelCatalog.pricingNote}</small> : null}</Panel>
        <Panel position="top-right"><button className="add-scene-button" onClick={addScene}><Plus size={15} /> 添加空白分镜</button></Panel>
        <Panel position="bottom-center" className="save-state"><Check size={13} /> 自动保存到项目 JSON</Panel>
      </ReactFlow></div>
    </section>
    <CharacterLibrary characters={project.characters} selectedId={project.selectedCharacterId} open={characterOpen} paused={Boolean(pausedTasks.character)} onPause={() => pauseTask('character', 'IP 形象生成')} onClose={() => setCharacterOpen(false)} onSelect={selectCharacter} onGenerate={generateCharacter} onPreviewVoice={previewCharacterVoice} onDelete={deleteCharacter} />
    <ProjectDrawer open={projectOpen} projects={projects} project={project} files={projectFiles} onClose={() => setProjectOpen(false)} onOpen={openProjectById} onCreate={createProject} onDelete={deleteProject} onRefreshFiles={refreshFiles} />
    <SceneEditor scene={selectedScene} open={sceneEditorOpen} onClose={() => setSceneEditorOpen(false)} onChange={(patch) => selectedScene && updateScene(selectedScene.id, patch)} onGenerate={() => selectedScene && generateScene(selectedScene.id)} onDelete={() => selectedScene && deleteScene(selectedScene.id)} onMove={(direction) => selectedScene && moveScene(selectedScene.id, direction)} />
    <PreviewPanel project={project} open={previewOpen} rendering={Boolean(rendering)} renderUrl={renderUrl} renderJob={renderJob} onClose={() => setPreviewOpen(false)} onRender={renderProject} onPause={autoPhase === 'render' ? pauseAutomaticCreation : pauseManualRender} onContinue={pausedTasks.auto && autoResumePhaseRef.current === 'render' ? continueAutomaticCreation : renderProject} />
    {toast ? <div className="toast"><Check size={16} /> {toast}</div> : null}
  </main>;
};

export default App;
