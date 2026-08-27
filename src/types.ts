export type SceneStatus = 'draft' | 'generating' | 'ready' | 'error';

export type PaperCharacter = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  status: 'sample' | 'generating' | 'ready' | 'error';
  createdAt: string;
  voiceProfileId?: string;
  voiceProfileName?: string;
  voiceDescription?: string;
  voicePreviewUrl?: string;
  alphaReport?: AlphaReport;
};

export type AlphaReport = {
  passed: boolean;
  transparentRatio: number;
  opaqueRatio: number;
  edgeTransparentRatio: number;
  foregroundRatio?: number;
  quality?: 'strict' | 'recovered' | 'fallback';
  fallbackApplied?: boolean;
  warning?: string;
  width: number;
  height: number;
};

export type VoiceSegment = {
  sceneId: string;
  characterId: string;
  audioUrl: string;
  voice: string;
  profileName: string;
  durationSeconds?: number;
};

export type StoryScene = {
  id: string;
  order: number;
  title: string;
  beat: string;
  duration: number;
  narration: string;
  subtitle: string;
  backgroundPrompt: string;
  actionPrompt: string;
  backgroundUrl: string;
  characterUrl: string;
  useCharacter: boolean;
  characterId: string;
  status: SceneStatus;
  error?: string;
  characterLayout: {
    x: number;
    y: number;
    width: number;
    opacity: number;
    entrance: 'left' | 'right' | 'bottom';
  };
};

export type VideoProject = {
  id: string;
  title: string;
  theme: string;
  lyrics: string;
  platform: 'Douyin';
  width: 1080;
  height: 1920;
  fps: 30;
  duration: number;
  style: '儿童剪纸绘本';
  selectedCharacterId: string;
  audioUrl: string;
  backgroundMusicUrl?: string;
  backgroundMusicVolume?: number;
  voiceVolume?: number;
  voiceProfileId?: string;
  voiceProfileName?: string;
  voiceSelectionReason?: string;
  textModel?: string;
  imageModel?: string;
  voiceModel?: string;
  transitionSeconds?: number;
  voiceSegments?: VoiceSegment[];
  nodePositions?: Record<string, {x: number; y: number}>;
  automationTheme?: string;
  copyQualityWarnings?: string[];
  copyQualitySuggestion?: string[];
  copyQualityReviewed?: boolean;
  characters: PaperCharacter[];
  scenes: StoryScene[];
  updatedAt: string;
};

export type AiModelOption = {
  id: string;
  name: string;
  kind: 'text' | 'image' | 'voice';
  provider: string;
  priceLabel: string;
  configured?: boolean;
};

export type AiModelCatalog = {
  text: AiModelOption[];
  image: AiModelOption[];
  voice: AiModelOption[];
  sourceHost: string;
  pricingNote: string;
};

export type ImageGenerationResult = {
  imageUrl: string;
  rawUrl?: string;
  model: string;
  processed: boolean;
  alphaReport?: AlphaReport;
  voiceProfileId?: string;
  voiceProfileName?: string;
  voiceDescription?: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  theme: string;
  sceneCount: number;
  updatedAt: string;
  folder: string;
};

export type ProjectFile = {
  path: string;
  size: number;
  kind: 'file' | 'folder';
};

export type RenderJob = {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'paused' | 'done' | 'error';
  progress: number;
  stage: string;
  url?: string;
  filename?: string;
  error?: string;
};
