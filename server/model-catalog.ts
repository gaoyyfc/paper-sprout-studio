export type ModelKind = 'text' | 'image' | 'voice';

export type ModelCatalogItem = {
  id: string;
  name: string;
  kind: ModelKind;
  provider: string;
  priceLabel: string;
  configured?: boolean;
};

type ArkModel = {id?: string; owned_by?: string};
let cachedCatalog: {expiresAt: number; value: ReturnType<typeof fallbackCatalog>} | undefined;

const friendlyName = (id: string) => {
  if (/doubao-seed-2-0-mini/i.test(id)) return 'Doubao Seed 2.0 Mini';
  if (/doubao-seed-2-0-lite/i.test(id)) return 'Doubao Seed 2.0 Lite';
  if (/doubao-seed-2-0-pro/i.test(id)) return 'Doubao Seed 2.0 Pro';
  if (/doubao-seedream-5-0-lite/i.test(id)) return 'Doubao Seedream 5.0 Lite';
  if (/doubao-seedream-5-0/i.test(id)) return 'Doubao Seedream 5.0';
  if (/doubao-seedream-4-5/i.test(id)) return 'Doubao Seedream 4.5';
  if (/doubao-seedream-4-0/i.test(id)) return 'Doubao Seedream 4.0';
  if (id === 'seed-tts-2.0') return 'Doubao Seed-TTS 2.0';
  if (id === 'seed-tts-1.0') return 'Doubao Seed-TTS 1.0';
  return id;
};

const priceFor = (id: string, kind: ModelKind) => {
  if (/doubao-seed-2-0-mini/i.test(id)) return '¥0.0002 输入 / ¥0.002 输出（千Tokens）';
  if (/doubao-seed-2-0-lite/i.test(id)) return '¥0.0006 输入 / ¥0.0036 输出（千Tokens）';
  if (/doubao-seed-2-0-pro/i.test(id)) return '¥0.0032 输入 / ¥0.016 输出（千Tokens）';
  if (/doubao-seedream-5-0/i.test(id)) return '活动包折算约 ¥0.22/张';
  if (kind === 'voice' && id === 'seed-tts-2.0') return '官网按量参考 ¥8/万字符';
  return '价格以服务商控制台为准';
};

const item = (id: string, kind: ModelKind, configured = false): ModelCatalogItem => ({
  id,
  name: friendlyName(id),
  kind,
  provider: kind === 'voice' ? '豆包语音' : '火山方舟',
  priceLabel: priceFor(id, kind),
  configured,
});

const unique = (items: ModelCatalogItem[]) => [...items.reduce((models, model) => {
  if (!models.has(model.id)) models.set(model.id, model);
  return models;
}, new Map<string, ModelCatalogItem>()).values()];
const latestFirst = (configuredId: string) => (first: ModelCatalogItem, second: ModelCatalogItem) => {
  if (first.id === configuredId) return -1;
  if (second.id === configuredId) return 1;
  return second.id.localeCompare(first.id);
};

const fallbackCatalog = () => {
  const textModel = process.env.ARK_TEXT_MODEL || 'doubao-seed-2-0-mini-260428';
  const imageModel = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128';
  const voiceModel = process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0';
  return {
    text: [item(textModel, 'text', true)],
    image: [item(imageModel, 'image', true)],
    voice: [item(voiceModel, 'voice', true)],
    sourceHost: new URL(process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').host,
    pricingNote: '价格为官网公开参考价；实际费用以账户地域、活动与控制台账单为准。',
  };
};

export const getModelCatalog = async () => {
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.value;
  const fallback = fallbackCatalog();
  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) return fallback;
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {Authorization: `Bearer ${apiKey}`},
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return fallback;
    const payload = await response.json() as {data?: ArkModel[]};
    const ids = (payload.data || []).map((model) => model.id || '').filter(Boolean);
    const imageIds = ids.filter((id) => /seedream|seededit|t2i|i2i/i.test(id) && !/seedance|video/i.test(id));
    const textIds = ids.filter((id) => !/embedding|seedream|seededit|seedance|t2i|i2i|t2v|i2v|flf2v|3d|character|browsing|functioncall|translation|audio|speech|tts/i.test(id));
    const value = {
      ...fallback,
      text: unique([item(fallback.text[0].id, 'text', true), ...textIds.map((id) => item(id, 'text'))]).sort(latestFirst(fallback.text[0].id)).slice(0, 60),
      image: unique([item(fallback.image[0].id, 'image', true), ...imageIds.map((id) => item(id, 'image'))]).sort(latestFirst(fallback.image[0].id)).slice(0, 30),
    };
    cachedCatalog = {expiresAt: Date.now() + 5 * 60_000, value};
    return value;
  } catch {
    return fallback;
  }
};
