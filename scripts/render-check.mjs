import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const renderUrl = process.argv[2];
if (!renderUrl) throw new Error('请传入渲染视频 URL');

await mkdir('quality/render-check', {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 540, height: 960}});
await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#18201d}video{display:block;width:540px;height:960px;object-fit:contain}</style><video muted playsinline src="${renderUrl}"></video>`);
await page.locator('video').evaluate((video) => new Promise((resolve, reject) => {
  if (video.readyState >= 1) return resolve();
  video.addEventListener('loadedmetadata', resolve, {once: true});
  video.addEventListener('error', () => reject(new Error('视频加载失败')), {once: true});
}));

const metadata = await page.locator('video').evaluate(async (video) => {
  video.currentTime = Math.min(0.5, video.duration / 2);
  await new Promise((resolve) => video.addEventListener('seeked', resolve, {once: true}));
  await video.play();
  await new Promise((resolve) => setTimeout(resolve, 350));
  video.pause();
  let hasAudioTrack = null;
  try {
    hasAudioTrack = typeof video.captureStream === 'function' ? video.captureStream().getAudioTracks().length > 0 : null;
  } catch {
    hasAudioTrack = null;
  }
  return {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    hasAudioTrack,
    decodedAudioBytes: video.webkitAudioDecodedByteCount ?? null,
  };
});

const times = [0.6, 4.45, 4.82, 9.05, 14.05, 18.45, Math.max(0.1, metadata.duration - 0.7)]
  .filter((time) => time < metadata.duration);
const frames = [];
for (let index = 0; index < times.length; index += 1) {
  const time = times[index];
  await page.locator('video').evaluate((video, target) => new Promise((resolve) => {
    video.currentTime = target;
    video.addEventListener('seeked', resolve, {once: true});
  }), time);
  const output = path.resolve(`quality/render-check/frame-${index + 1}.png`);
  await page.locator('video').screenshot({path: output});
  frames.push(await sharp(output).resize(270, 480).png().toBuffer());
}

const columns = 4;
const rows = Math.ceil(frames.length / columns);
await sharp({create: {width: columns * 270, height: rows * 480, channels: 4, background: '#18201d'}})
  .composite(frames.map((input, index) => ({input, left: index % columns * 270, top: Math.floor(index / columns) * 480})))
  .png()
  .toFile('quality/render-check/contact-sheet.png');

console.log(JSON.stringify({...metadata, times, contactSheet: path.resolve('quality/render-check/contact-sheet.png')}));
await browser.close();
