import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const {project} = await (await fetch('http://127.0.0.1:8787/api/projects/demo-stranger-call')).json();
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
const generationRequests = [];
let storyRequests = 0;
let sceneRequests = 0;
let notifyStory;
let notifyScene;
const storyStarted = new Promise((resolve) => {notifyStory = resolve;});
const sceneStarted = new Promise((resolve) => {notifyScene = resolve;});
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});
page.on('request', (request) => {
  if (/\/api\/(storyboard\/generate|scenes\/generate|voice\/generate-scenes|render)/.test(request.url())) generationRequests.push(request.url());
});
await page.route('**/api/projects/save', (route) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}));
await page.route('**/api/storyboard/generate', async (route) => {
  storyRequests += 1;
  if (storyRequests === 1) {
    notifyStory();
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({title: project.title, lyrics: project.lyrics, scenes: project.scenes, model: project.textModel || 'qa-text-model'})}).catch(() => undefined);
});
await page.route('**/api/scenes/generate', async (route) => {
  sceneRequests += 1;
  if (sceneRequests === 1) notifyScene();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const scene = project.scenes[Math.min(sceneRequests - 1, project.scenes.length - 1)];
  await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({background: {imageUrl: scene.backgroundUrl, prompt: scene.backgroundPrompt, model: project.imageModel || 'qa-image-model'}})}).catch(() => undefined);
});

const waitForText = async (locator, text) => page.waitForFunction(([element, expected]) => element?.textContent?.includes(expected), [await locator.elementHandle(), text], {timeout: 8000});

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  const button = page.locator('.react-flow__node-theme .node-button');
  await button.evaluate((element) => element.click());
  await storyStarted;
  await waitForText(button, '暂停完整生成');
  await button.evaluate((element) => element.click());
  await waitForText(button, '继续完整生成');
  const pausedAtStory = await button.innerText();

  await button.evaluate((element) => element.click());
  await sceneStarted;
  await waitForText(button, '暂停完整生成');
  await button.evaluate((element) => element.click());
  await waitForText(button, '继续完整生成');
  await page.waitForTimeout(1400);
  const pausedAtImage = await button.innerText();
  const runningEdges = await page.locator('.workflow-edge--running').count();
  const voiceRequests = generationRequests.filter((url) => url.includes('/voice/')).length;
  const renderRequests = generationRequests.filter((url) => /\/api\/render(?:\/|$)/.test(new URL(url).pathname)).length;
  console.log(JSON.stringify({pausedAtStory, pausedAtImage, storyRequests, sceneRequests, voiceRequests, renderRequests, runningEdges, errors}, null, 2));
  if (storyRequests !== 2 || sceneRequests !== 1 || voiceRequests !== 0 || renderRequests !== 0 || runningEdges !== 0 || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
