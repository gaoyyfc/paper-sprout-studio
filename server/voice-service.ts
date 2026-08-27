import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {prepareAnimationNarration} from './speech-text.js';

export {prepareAnimationNarration} from './speech-text.js';

type SsePayload = {code?: number; message?: string; data?: string};

export const CHILD_ANIMATION_VOICE_STYLE = {
  name: '儿童动画女声',
  description: '年轻甜美、活泼亲切、明亮柔和，带自然角色表演感；0.9 倍速，咬字清晰，停顿明显',
  speechRate: -10,
} as const;

export const VOICE_PROFILES = [
  {id: 'elephant-boy', name: '泡泡·阳光男童声', description: '明亮温暖、圆润亲切，带儿童动画伙伴感，适合小象角色', speaker: 'zh_male_dayi_saturn_bigtts', speechRate: -11, pitchRate: 5},
  {id: 'lion-boy', name: '乐乐·勇敢男童声', description: '清爽自信、活泼勇敢，带稚气和角色表演感，适合小狮子角色', speaker: 'zh_male_ruyayichen_saturn_bigtts', speechRate: -8, pitchRate: 4},
  {id: 'penguin-boy', name: '点点·开朗小男孩声', description: '开朗灵动、清脆有朝气，带调皮弟弟的角色感，适合小企鹅', speaker: 'zh_male_livelybro_mars_bigtts', speechRate: -9, pitchRate: 5, resourceId: 'seed-tts-1.0'},
  {id: 'rabbit-girl', name: '乖乖·甜甜小女孩声', description: '甜美柔亮、俏皮亲切，带自然的小女孩角色感，适合小兔子', speaker: 'zh_female_mizai_saturn_bigtts', speechRate: -13, pitchRate: 4},
  {id: 'picturebook', name: '雪芽·温柔绘本声', description: '柔和从容，适合安静、温暖的角色', speaker: 'zh_female_xueayi_saturn_bigtts', speechRate: -12, pitchRate: 1},
  {id: 'cute-girl', name: '糖糖·甜亮动画声', description: '甜美明亮，适合亲切活泼的角色', speaker: 'zh_female_santongyongns_saturn_bigtts', speechRate: -9, pitchRate: 2},
  {id: 'playful', name: '暖暖·故事表演声', description: '自然亲切，适合会讲故事的角色', speaker: 'zh_female_jitangnv_saturn_bigtts', speechRate: -11, pitchRate: 1},
  {id: 'vivi', name: '薇薇·灵动跳跳声', description: '清亮有弹性，适合动作感强的角色', speaker: 'zh_female_vv_uranus_bigtts', speechRate: -8, pitchRate: 3},
  {id: 'mizi', name: '咪仔·童真俏皮声', description: '轻巧可爱，带鲜明的儿童角色感', speaker: 'zh_female_mizai_saturn_bigtts', speechRate: -10, pitchRate: 4},
  {id: 'sunny-boy', name: '晴晴·鼓励探索声', description: '清爽有朝气，适合勇敢探索型角色', speaker: 'zh_female_meilinvyou_saturn_bigtts', speechRate: -7, pitchRate: 2},
  {id: 'sprout-soft', name: '芽芽·软萌慢拍声', description: '软萌轻缓，适合害羞细腻的角色', speaker: 'zh_female_xueayi_saturn_bigtts', speechRate: -16, pitchRate: 4},
  {id: 'candy-pop', name: '果果·糖果弹跳声', description: '节奏轻快，适合元气十足的角色', speaker: 'zh_female_santongyongns_saturn_bigtts', speechRate: -4, pitchRate: 5},
  {id: 'story-warm', name: '绵绵·暖心陪伴声', description: '温暖稳重，适合可靠陪伴型角色', speaker: 'zh_female_jitangnv_saturn_bigtts', speechRate: -16, pitchRate: 0},
  {id: 'vivi-spark', name: '星星·闪亮快拍声', description: '明快灵动，适合机灵好奇的角色', speaker: 'zh_female_vv_uranus_bigtts', speechRate: -3, pitchRate: 5},
  {id: 'mizi-gentle', name: '花花·轻甜呢喃声', description: '轻甜柔软，适合温柔可爱的角色', speaker: 'zh_female_mizai_saturn_bigtts', speechRate: -15, pitchRate: 1},
  {id: 'explorer-bright', name: '亮亮·冒险领队声', description: '明亮坚定，适合自信勇敢的角色', speaker: 'zh_female_meilinvyou_saturn_bigtts', speechRate: -5, pitchRate: 4},
] as const;

const resolveVoiceProfile = (id?: string) => {
  const direct = VOICE_PROFILES.find((item) => item.id === id);
  if (direct) return direct;
  const custom = id?.match(/^persona:([^:]+):(-?\d+):(-?\d+)$/);
  if (!custom) return undefined;
  const base = VOICE_PROFILES.find((item) => item.id === custom[1]);
  if (!base) return undefined;
  const speechRate = Number(custom[2]);
  const pitchRate = Number(custom[3]);
  if (speechRate < -18 || speechRate > -2 || pitchRate < 0 || pitchRate > 6) return undefined;
  return {
    ...base,
    id: id as string,
    name: `${base.name}·专属变奏`,
    description: `${base.description}；专属语速 ${speechRate}、音高 ${pitchRate}`,
    speechRate,
    pitchRate,
  };
};

export const getVoiceProfile = (id?: string) => resolveVoiceProfile(id) || VOICE_PROFILES[0];

const stableHash = (value: string) => [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);

export const selectUniqueCharacterVoiceProfile = (identity: string, usedProfileIds: string[] = []) => {
  const used = new Set(usedProfileIds.filter((id) => resolveVoiceProfile(id)));
  const hash = stableHash(identity);
  const preferredProfileId = /泡泡象|大象|小象|elephant/i.test(identity)
    ? 'elephant-boy'
    : /乐乐|狮子|小狮|lion/i.test(identity)
      ? 'lion-boy'
      : /点点|企鹅|penguin/i.test(identity)
        ? 'penguin-boy'
        : /乖乖兔|兔子|小兔|rabbit/i.test(identity)
          ? 'rabbit-girl'
      : undefined;
  if (preferredProfileId) {
    const preferred = getVoiceProfile(preferredProfileId);
    if (!used.has(preferred.id)) return preferred;
    for (let offset = 0; offset < 119; offset += 1) {
      const speechRate = -18 + ((hash + offset * 7) % 17);
      const pitchRate = 2 + ((hash + offset * 5) % 5);
      const id = `persona:${preferred.id}:${speechRate}:${pitchRate}`;
      if (!used.has(id)) return getVoiceProfile(id);
    }
  }
  const available = VOICE_PROFILES.filter((profile) => !used.has(profile.id));
  if (available.length) return available[hash % available.length];
  for (let offset = 0; offset < 714; offset += 1) {
    const base = VOICE_PROFILES[(hash + offset) % VOICE_PROFILES.length];
    const speechRate = -18 + ((hash + offset * 7) % 17);
    const pitchRate = (hash + offset * 5) % 7;
    const id = `persona:${base.id}:${speechRate}:${pitchRate}`;
    if (!used.has(id)) return getVoiceProfile(id);
  }
  return VOICE_PROFILES[hash % VOICE_PROFILES.length];
};

export const normalizeCharacterVoiceAssignments = <T extends {id: string; name: string; description?: string; voiceProfileId?: string; voiceProfileName?: string; voiceDescription?: string}>(characters: T[]) => {
  const used: string[] = [];
  return characters.map((character) => {
    const existing = !used.includes(character.voiceProfileId || '') ? resolveVoiceProfile(character.voiceProfileId) : undefined;
    const profile = existing || selectUniqueCharacterVoiceProfile(`${character.id}:${character.name}:${character.description || ''}`, used);
    used.push(profile.id);
    return {...character, voiceProfileId: profile.id, voiceProfileName: profile.name, voiceDescription: profile.description};
  });
};

const countKeywordHits = (text: string, keywords: readonly string[]) =>
  keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);

export const selectBestVoiceProfile = (script: string) => {
  const text = script.replace(/\s+/g, '');
  const candidates = [
    {
      profile: getVoiceProfile('vivi'),
      score: countKeywordHits(text, ['跳', '跑', '拍', '刷', '舞', '运动', '加油', '快快', '哈哈', '蹦', '摇']),
      reason: '文案动作感和节奏感较强，适合明亮、有弹性的动画女声',
    },
    {
      profile: getVoiceProfile('mizi'),
      score: countKeywordHits(text, ['小猫', '小狗', '动物', '森林', '花', '草', '虫', '鸟', '叮', '咚', '呀', '啦']),
      reason: '文案包含童真角色或拟声表达，适合轻巧可爱的童真女声',
    },
    {
      profile: getVoiceProfile('playful'),
      score: countKeywordHits(text, ['安全', '规则', '不能', '不要', '停', '小心', '陌生', '马路', '红灯', '绿灯']),
      reason: '文案以规则和安全引导为主，适合亲切、可信赖的故事女声',
    },
    {
      profile: getVoiceProfile('cute-girl'),
      score: countKeywordHits(text, ['洗手', '刷牙', '吃饭', '礼貌', '谢谢', '早安', '晚安', '朋友', '分享', '整齐']),
      reason: '文案贴近日常习惯和社交启蒙，适合甜美亲切的动画女声',
    },
    {
      profile: getVoiceProfile('picturebook'),
      score: countKeywordHits(text, ['月亮', '星星', '睡觉', '故事', '梦想', '安静', '轻轻', '慢慢', '夜晚', '温柔']) + 0.5,
      reason: '文案叙事较柔和，适合温暖、舒缓的绘本女声',
    },
    {
      profile: getVoiceProfile('sunny-boy'),
      score: countKeywordHits(text, ['勇敢', '探索', '发现', '出发', '太阳', '成长', '成功', '坚持']),
      reason: '文案包含探索和成长情绪，适合清亮、有鼓励感的动画女声',
    },
  ];
  const selected = candidates.sort((first, second) => second.score - first.score)[0];
  return {...selected.profile, reason: selected.reason};
};

export const generateVoice = async (
  text: string,
  publicDir: string,
  projectId?: string,
  options?: {profileId?: string; filenamePrefix?: string; resourceId?: string},
) => {
  const apiKey = process.env.VOLC_TTS_ACCESS_TOKEN;
  const profile = options?.profileId ? getVoiceProfile(options.profileId) : undefined;
  const profileResourceId = profile && 'resourceId' in profile ? profile.resourceId : undefined;
  const resourceId = profileResourceId || options?.resourceId || process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0';
  const voice = profile?.speaker || process.env.VOLC_TTS_VOICE_TYPE || 'zh_female_vv_uranus_bigtts';
  if (!apiKey) throw new Error('未找到 VOLC_TTS_ACCESS_TOKEN');
  const response = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': randomUUID(),
    },
    body: JSON.stringify({
      user: {uid: 'paper_sprout_studio'},
      req_params: {
        text: prepareAnimationNarration(text),
        speaker: voice,
        sample_rate: 24000,
        audio_params: {format: 'mp3', speech_rate: profile?.speechRate ?? CHILD_ANIMATION_VOICE_STYLE.speechRate, pitch_rate: profile?.pitchRate ?? 2, loudness_rate: 1, bit_rate: 64000},
        additions: JSON.stringify({disable_markdown_filter: true}),
      },
    }),
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(`语音接口返回 ${response.status}`);
  const chunks: Buffer[] = [];
  for (const rawLine of payload.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    try {
      const item = JSON.parse(line.slice(5).trim()) as SsePayload;
      if (item.code !== undefined && ![0, 20000000].includes(item.code)) {
        throw new Error(item.message || `Seed-TTS 错误码 ${item.code}`);
      }
      if (item.data) chunks.push(Buffer.from(item.data, 'base64'));
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  if (chunks.length === 0) throw new Error('Seed-TTS 未返回音频数据，请确认 API Key 与音色权限');
  const audioBuffer = Buffer.concat(chunks);
  const durationSeconds = Math.max(0.1, Math.round(audioBuffer.length * 8 / 64000 * 100) / 100);
  const filename = `${options?.filenamePrefix || 'voice'}-${Date.now()}-${randomUUID().slice(0, 6)}.mp3`;
  const safeProjectId = projectId?.replace(/[^a-zA-Z0-9_-]/g, '-');
  const outputDir = safeProjectId ? path.join(publicDir, 'projects', safeProjectId, 'audio') : path.join(publicDir, 'generated');
  await writeFile(path.join(outputDir, filename), audioBuffer);
  return {audioUrl: safeProjectId ? `/projects/${safeProjectId}/audio/${filename}` : `/generated/${filename}`, voice, resourceId, profileName: profile?.name || CHILD_ANIMATION_VOICE_STYLE.name, durationSeconds};
};
