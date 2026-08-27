import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {nanoid} from 'nanoid';
import sharp from 'sharp';
import type {AlphaReport} from '../src/types.js';

const STYLE_LOCK = [
  '中国儿童早教剪纸绘本风格',
  '水粉和透明水彩叠色，柔和深棕色手绘轮廓',
  '可见的天然粗纹纸张，奶油黄、珊瑚红、湖水绿与天空蓝的明快低饱和色板',
  '造型圆润、亲切、安全，适合3至7岁儿童',
  '不摄影、不3D、不写实、不扁平矢量、不含文字、数字、Logo或水印',
].join('，');

const normalizeEndpoint = (baseUrl: string) => {
  const clean = baseUrl.replace(/\/+$/, '');
  return clean.endsWith('/images/generations') ? clean : `${clean}/images/generations`;
};

const asReferenceData = async (reference: string | undefined, publicDir: string) => {
  if (!reference) return undefined;
  if (reference.startsWith('data:image/') || reference.startsWith('https://')) return reference;
  if (reference.startsWith('/generated/')) {
    const safeName = path.basename(reference);
    const bytes = await readFile(path.join(publicDir, 'generated', safeName));
    return `data:image/png;base64,${bytes.toString('base64')}`;
  }
  if (reference.startsWith('/projects/')) {
    const resolved = path.resolve(publicDir, reference.slice(1));
    if (!resolved.startsWith(path.resolve(publicDir))) throw new Error('非法的参考图路径');
    const bytes = await readFile(resolved);
    return `data:image/png;base64,${bytes.toString('base64')}`;
  }
  return undefined;
};

export const validateAlphaImage = async (outputPath: string, options: {throwOnFailure?: boolean; fallbackApplied?: boolean} = {}): Promise<AlphaReport> => {
  const {data, info} = await sharp(outputPath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let transparent = 0;
  let opaque = 0;
  let foreground = 0;
  let edgeTransparent = 0;
  let edgeTotal = 0;
  const edgeBand = Math.max(8, Math.round(Math.min(info.width, info.height) * 0.045));
  const pixels = info.width * info.height;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha < 16) transparent += 1;
      if (alpha > 239) opaque += 1;
      if (alpha >= 96) foreground += 1;
      if (x < edgeBand || x >= info.width - edgeBand || y < edgeBand || y >= info.height - edgeBand) {
        edgeTotal += 1;
        if (alpha < 16) edgeTransparent += 1;
      }
    }
  }
  const report: AlphaReport = {
    passed: false,
    transparentRatio: transparent / pixels,
    opaqueRatio: opaque / pixels,
    foregroundRatio: foreground / pixels,
    edgeTransparentRatio: edgeTransparent / edgeTotal,
    quality: 'fallback',
    fallbackApplied: Boolean(options.fallbackApplied),
    width: info.width,
    height: info.height,
  };
  report.passed = report.transparentRatio >= 0.16
    && report.transparentRatio <= 0.94
    && (report.foregroundRatio || 0) >= 0.04
    && report.edgeTransparentRatio >= 0.88
    && info.width >= 240
    && info.height >= 240;
  report.quality = report.passed ? options.fallbackApplied ? 'recovered' : 'strict' : 'fallback';
  if (!report.passed && options.throwOnFailure !== false) {
    throw new Error(`Alpha 校验失败（透明区域 ${Math.round(report.transparentRatio * 100)}%，有效主体 ${Math.round((report.foregroundRatio || 0) * 100)}%，边缘透明 ${Math.round(report.edgeTransparentRatio * 100)}%）`);
  }
  return report;
};

export const removeGreenScreen = async (input: Buffer, outputPath: string, options: {aggressive?: boolean; allowFallback?: boolean} = {}) => {
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const border = Math.max(12, Math.round(Math.min(info.width, info.height) * 0.018));
  let edgeR = 0;
  let edgeG = 0;
  let edgeB = 0;
  let edgeSamples = 0;
  for (let y = 0; y < info.height; y += 3) {
    for (let x = 0; x < info.width; x += 3) {
      if (x > border && x < info.width - border && y > border && y < info.height - border) continue;
      const offset = (y * info.width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      edgeR += r;
      edgeG += g;
      edgeB += b;
      edgeSamples += 1;
    }
  }
  const background = edgeSamples > 0
    ? {r: edgeR / edgeSamples, g: edgeG / edgeSamples, b: edgeB / edgeSamples}
    : {r: 115, g: 220, b: 65};
  const pixels = info.width * info.height;
  const scores = new Uint8Array(pixels);
  const backgroundMask = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const threshold = options.aggressive ? 42 : 66;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const index = pixel * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const dominance = g - Math.max(r, b);
    const backgroundDistance = Math.sqrt(
      (r - background.r) ** 2 + (g - background.g) ** 2 + (b - background.b) ** 2,
    );
    const colorScore = Math.max(0, Math.min(1, (96 - backgroundDistance) / 62));
    const greenStrength = g > r && g > b ? Math.max(0, Math.min(1, (dominance - 1) / 58)) : 0;
    scores[pixel] = Math.round(Math.max(colorScore, greenStrength) * 255);
  }

  let head = 0;
  let tail = 0;
  const enqueue = (pixel: number) => {
    if (backgroundMask[pixel] || scores[pixel] < threshold) return;
    backgroundMask[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < info.width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - info.width);
    if (y + 1 < info.height) enqueue(pixel + info.width);
  }
  if (tail / pixels < 0.08) throw new Error('自动抠图未识别到连续背景区域');

  const labels = new Int32Array(pixels);
  let label = 0;
  let largestLabel = 0;
  let largestSize = 0;
  for (let start = 0; start < pixels; start += 1) {
    if (backgroundMask[start] || labels[start] || data[start * 4 + 3] < 16) continue;
    label += 1;
    head = 0;
    tail = 0;
    labels[start] = label;
    queue[tail++] = start;
    const visit = (next: number) => {
      if (backgroundMask[next] || labels[next] || data[next * 4 + 3] < 16) return;
      labels[next] = label;
      queue[tail++] = next;
    };
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      if (x > 0) visit(pixel - 1);
      if (x + 1 < info.width) visit(pixel + 1);
      if (y > 0) visit(pixel - info.width);
      if (y + 1 < info.height) visit(pixel + info.width);
    }
    if (tail > largestSize) {
      largestSize = tail;
      largestLabel = label;
    }
  }
  if (largestSize / pixels < 0.015) throw new Error('自动抠图未识别到完整角色主体');

  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = y * info.width + x;
      const index = pixel * 4;
      if (labels[pixel] !== largestLabel) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 0;
        continue;
      }
      if (data[index + 3] < 96) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX >= maxX || minY >= maxY) throw new Error('自动抠图未识别到完整角色主体');
  const subjectWidth = maxX - minX + 1;
  const subjectHeight = maxY - minY + 1;
  const padding = Math.max(32, Math.round(Math.max(subjectWidth, subjectHeight) * 0.07));
  await sharp(data, {raw: info})
    .extract({left: minX, top: minY, width: subjectWidth, height: subjectHeight})
    .extend({top: padding, bottom: padding, left: padding, right: padding, background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png()
    .toFile(outputPath);
  const report = await validateAlphaImage(outputPath, {throwOnFailure: !options.allowFallback, fallbackApplied: Boolean(options.aggressive)});
  if (!report.passed && options.allowFallback) {
    report.fallbackApplied = true;
    report.quality = 'fallback';
    report.warning = '严格 Alpha 指标未完全达到，但已输出边缘连通抠图结果，可继续使用或重新生成。';
  }
  return report;
};

export type GenerateImageInput = {
  kind: 'background' | 'character';
  prompt: string;
  name?: string;
  referenceImage?: string;
  publicDir: string;
  outputDir?: string;
  publicPrefix?: string;
  modelId?: string;
};

export const generateImage = async ({kind, prompt, name, referenceImage, publicDir, outputDir, publicPrefix, modelId}: GenerateImageInput) => {
  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = modelId || process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128';
  if (!apiKey) throw new Error('未找到 ARK_API_KEY，请检查项目根目录 .env');

  const reference = await asReferenceData(referenceImage, publicDir);
  const identityLock = reference
    ? '必须严格保持参考图中的同一IP身份、物种、头部特征、主色、服装和配饰，只改变动作与表情；禁止改成其他动物、玩偶或人物'
    : '保持单一角色设定稳定';
  const characterPrompt = `${STYLE_LOCK}。单一角色：${name || '固定IP角色'}，${identityLock}。动作要求：${prompt}。角色全身完整，头、双手、双脚都在画面内，主体居中并占画面高度约60%，四周留出至少15%安全距离；整体有连续、闭合、均匀的白色剪纸描边。背景必须且只能是单一色值 #00FF00 的纯色摄影棚绿幕：完全平坦、颜色均匀、无纸张纹理、无渐变、无阴影、无地面线、无道具、无文字、无其他角色；纸张纹理只能出现在角色内部，绝不能出现在绿色背景。`;
  const backgroundPrompt = `${STYLE_LOCK}。竖屏9:16儿童绘本背景：${prompt}。只生成连续完整的场景底板，画面中不得出现人物、动物角色或角色身体部位；最多两个叙事道具，中央保留自然活动空间。`;
  const body: Record<string, unknown> = {
    model,
    prompt: kind === 'character' ? characterPrompt : backgroundPrompt,
    size: '1440x2560',
    sequential_image_generation: 'disabled',
    stream: false,
    output_format: 'png',
    response_format: 'b64_json',
    watermark: false,
  };
  if (reference) body.image = [reference];

  const targetDir = outputDir || path.join(publicDir, 'generated');
  const urlPrefix = publicPrefix || '/generated';
  const maxAttempts = kind === 'character' ? 3 : 2;
  const characterAttemptDirectives = [
    '严格执行纯色绿幕，不要把绿幕画成绘本背景。',
    '再次强调：角色外部每一个像素都应是完全一致的亮绿色 #00FF00，角色不得接触画面边缘。',
    '兜底构图：减少细碎装饰，保持角色轮廓闭合清晰、完整全身、纯色绿幕，禁止任何背景纹理。',
  ];
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const requestBody = kind === 'character'
        ? {...body, prompt: `${characterPrompt}。${characterAttemptDirectives[attempt - 1]}`}
        : body;
      const response = await fetch(normalizeEndpoint(baseUrl), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(150_000),
      });
      const payload = (await response.json()) as {data?: Array<{b64_json?: string; url?: string}>; error?: {message?: string; code?: string}};
      if (!response.ok || !payload.data?.[0]) throw new Error(payload.error?.message || payload.error?.code || `生图接口返回 ${response.status}`);
      const item = payload.data[0];
      let bytes: Buffer;
      if (item.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
      else if (item.url) {
        const imageResponse = await fetch(item.url, {signal: AbortSignal.timeout(60_000)});
        if (!imageResponse.ok) throw new Error('生成成功，但下载图片失败');
        bytes = Buffer.from(await imageResponse.arrayBuffer());
      } else throw new Error('生图接口未返回图片内容');
      const id = `${kind}-${Date.now()}-${nanoid(6)}`;
      const rawName = `${id}-raw.png`;
      const finalName = `${id}.png`;
      await writeFile(path.join(targetDir, rawName), bytes);
      let alphaReport: AlphaReport | undefined;
      if (kind === 'character') {
        try {
          alphaReport = await removeGreenScreen(bytes, path.join(targetDir, finalName));
        } catch {
          alphaReport = await removeGreenScreen(bytes, path.join(targetDir, finalName), {aggressive: true, allowFallback: true});
        }
      }
      if (kind === 'background') await sharp(bytes).png().toFile(path.join(targetDir, finalName));
      return {imageUrl: `${urlPrefix}/${finalName}`, rawUrl: `${urlPrefix}/${rawName}`, model, processed: kind === 'character', alphaReport};
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('生图失败');
      if (attempt === maxAttempts) break;
    }
  }
  throw new Error(`生图经过 ${maxAttempts} 次尝试仍未通过：${lastError?.message || '未知错误'}`);
};
