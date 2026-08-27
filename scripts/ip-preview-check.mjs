import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

await mkdir('quality', {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = [];
await page.addInitScript(() => {
  window.__ipVoicePreviewPlays = [];
  const NativeAudio = window.Audio;
  window.Audio = function AudioPreview(src) {
    const audio = new NativeAudio(src);
    audio.play = () => {
      window.__ipVoicePreviewPlays.push(src);
      return Promise.resolve();
    };
    return audio;
  };
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.locator('.side-rail button').filter({hasText: 'IP 形象'}).click();
  await page.locator('.character-drawer').waitFor();
  const cardCount = await page.locator('.character-card').count();
  const topActionTexts = await page.locator('.topbar-actions button').allTextContents();
  const pointVoiceLabel = await page.locator('.character-card').filter({hasText: '点点'}).locator('.character-voice-badge').innerText();
  const rabbitVoiceLabel = await page.locator('.character-card').filter({hasText: '乖乖兔'}).locator('.character-voice-badge').innerText();
  const voiceBadge = page.locator('.character-voice-badge').first();
  const voiceBadgeVisible = await voiceBadge.isVisible();
  await voiceBadge.click();
  await page.waitForFunction(() => window.__ipVoicePreviewPlays.length === 1);
  const cardVoiceUrl = await page.evaluate(() => window.__ipVoicePreviewPlays[0]);
  await page.locator('.character-card__preview').first().click();
  const dialog = page.locator('.character-preview');
  await dialog.waitFor();
  const imageLoaded = await dialog.locator('.character-preview__stage img').evaluate((image) => image.complete && image.naturalWidth > 0);
  const imageLayout = await dialog.locator('.character-preview__stage img').evaluate((image) => {
    const style = getComputedStyle(image);
    return {naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, clientWidth: image.clientWidth, clientHeight: image.clientHeight, objectFit: style.objectFit, padding: style.padding};
  });
  const selectActionVisible = await dialog.locator('.character-preview__actions').isVisible();
  const dialogVoiceButton = dialog.locator('.character-preview__voice');
  const dialogVoiceVisible = await dialogVoiceButton.isVisible();
  await dialogVoiceButton.click();
  await page.waitForFunction(() => window.__ipVoicePreviewPlays.length === 2);
  const dialogVoiceUrl = await page.evaluate(() => window.__ipVoicePreviewPlays[1]);
  await page.screenshot({path: 'quality/ip-character-preview.png', fullPage: true});
  await page.keyboard.press('Escape');
  const closedByEscape = await dialog.count() === 0;
  console.log(JSON.stringify({cardCount, topActionTexts, pointVoiceLabel, rabbitVoiceLabel, imageLoaded, imageLayout, voiceBadgeVisible, dialogVoiceVisible, cardVoiceUrl, dialogVoiceUrl, sameCachedVoice: cardVoiceUrl === dialogVoiceUrl, selectActionVisible, closedByEscape, errors}));
} finally {
  await browser.close();
}
