import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const sourceResponse = await fetch('http://127.0.0.1:8787/api/projects/demo-stranger-call');
const {project} = await sourceResponse.json();
const errors = [];
const generationRequests = [];
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});
page.on('request', (request) => {
  if (/\/api\/(storyboard\/generate|scenes\/generate|voice\/generate-scenes|render)/.test(request.url())) generationRequests.push(request.url());
});
await page.route('**/api/projects/save', (route) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}));

const delayedRoute = async (pattern, responseBody, action) => {
  let requestCount = 0;
  let announceFirst;
  const firstStarted = new Promise((resolve) => {announceFirst = resolve;});
  await page.route(pattern, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      announceFirst();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(responseBody)}).catch(() => undefined);
      return;
    }
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(responseBody)});
  });
  const result = await action({firstStarted, release: () => undefined, getRequestCount: () => requestCount});
  await page.unroute(pattern);
  return result;
};

const waitForText = async (locator, expected) => {
  await locator.waitFor({state: 'visible'});
  await page.waitForFunction(([element, text]) => element?.textContent?.includes(text), [await locator.elementHandle(), expected], {timeout: 5000});
};

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  console.log('loaded');

  const referenceCharacter = project.characters.find((item) => item.id === project.selectedCharacterId) || project.characters[0];
  const characterResult = await delayedRoute('**/api/images/generate', {
    imageUrl: referenceCharacter.imageUrl,
    model: project.imageModel || 'qa-image-model',
    prompt: 'QA transparent character',
    voiceProfileId: 'qa-new-character-voice',
    voiceProfileName: 'QA 新角色童声',
    voiceDescription: '暂停继续测试音色',
    alphaReport: {passed: true, quality: 'strict', transparentRatio: 0.55, edgeTransparentRatio: 1, width: 1024, height: 1024},
  }, async ({firstStarted, release, getRequestCount}) => {
    await page.locator('.side-rail button').filter({hasText: 'IP 形象'}).click();
    await page.locator('.generator-card input').fill('QA 暂停角色');
    await page.locator('.generator-card textarea').fill('圆润可爱的儿童剪纸测试形象');
    const button = page.locator('.generator-card .primary-button');
    await button.click();
    await firstStarted;
    await waitForText(button, '暂停形象生成');
    await button.click();
    release();
    await waitForText(button, '继续生成透明 IP');
    const pausedText = await button.innerText();
    await button.click();
    await waitForText(button, '生成透明 IP 形象');
    await page.locator('.character-drawer .icon-button').click();
    return {pausedText, requestCount: getRequestCount()};
  });

  const storyResult = await delayedRoute('**/api/storyboard/generate', {
    title: project.title,
    lyrics: project.lyrics,
    scenes: project.scenes,
    model: project.textModel || 'qa-text-model',
  }, async ({firstStarted, release, getRequestCount}) => {
    const button = page.locator('.react-flow__node-story .node-secondary');
    await button.click({force: true});
    await firstStarted;
    console.log('story-started');
    await waitForText(button, '暂停文案生成');
    await button.click({force: true});
    release();
    await waitForText(button, '继续文案生成');
    console.log('story-paused');
    const pausedText = await button.innerText();
    await button.click({force: true});
    await waitForText(button, 'AI 重写文案');
    console.log('story-continued');
    return {pausedText, requestCount: getRequestCount()};
  });

  const scene = project.scenes[0];
  console.log('story-finished');
  const sceneResult = await delayedRoute('**/api/scenes/generate', {
    background: {imageUrl: scene.backgroundUrl, prompt: scene.backgroundPrompt, model: project.imageModel || 'qa-image-model'},
  }, async ({firstStarted, release, getRequestCount}) => {
    const button = page.locator(`.react-flow__node[data-id="${scene.id}"] .scene-node__actions button`).nth(1);
    await button.evaluate((element) => element.click());
    await Promise.race([firstStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('scene request did not start')), 5000))]);
    console.log('scene-started');
    await waitForText(button, '暂停');
    await button.evaluate((element) => element.click());
    release();
    await waitForText(button, '继续');
    console.log('scene-paused');
    const pausedText = await button.innerText();
    await button.evaluate((element) => element.click());
    await waitForText(button, '重生成');
    console.log('scene-continued');
    return {pausedText, requestCount: getRequestCount()};
  });

  const voiceResult = await delayedRoute('**/api/voice/generate-scenes', {
    segments: project.scenes.map((item) => ({sceneId: item.id, characterId: item.characterId, audioUrl: `/qa/${item.id}.mp3`, voice: 'qa-voice', profileName: 'QA 儿童音色', durationSeconds: 4.2})),
    profileId: 'qa-child-voice',
    profileName: 'QA 儿童音色',
    selectionReason: '暂停继续测试固定音色',
  }, async ({firstStarted, release, getRequestCount}) => {
    const button = page.locator('.react-flow__node-voice .node-button');
    await button.evaluate((element) => element.click());
    await Promise.race([firstStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('voice request did not start')), 5000))]);
    await waitForText(button, '暂停配音生成');
    await button.evaluate((element) => element.click());
    release();
    await waitForText(button, '继续配音生成');
    const pausedText = await button.innerText();
    await button.evaluate((element) => element.click());
    await waitForText(button, '重新智能匹配并配音');
    return {pausedText, requestCount: getRequestCount()};
  });

  let renderStarts = 0;
  let renderPauses = 0;
  const handleRenderRoute = async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/render' && route.request().method() === 'POST') {
      renderStarts += 1;
      await route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify({jobId: `qa-render-${renderStarts}`})});
      return;
    }
    if (url.pathname.endsWith('/pause')) {
      renderPauses += 1;
      await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id: 'qa-render-1', projectId: project.id, status: 'paused', progress: 0.35, stage: '渲染已暂停，可点击继续重新开始'})});
      return;
    }
    const done = url.pathname.endsWith('qa-render-2');
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id: done ? 'qa-render-2' : 'qa-render-1', projectId: project.id, status: done ? 'done' : 'running', progress: done ? 1 : 0.35, stage: done ? 'MP4 已完成' : '正在渲染画面 35%', url: done ? '/qa/video.mp4' : undefined})});
  };
  await page.route('**/api/render', handleRenderRoute);
  await page.route('**/api/render/**', handleRenderRoute);
  const outputButton = page.locator('.react-flow__node-output .node-secondary');
  await outputButton.evaluate((element) => element.click());
  await waitForText(outputButton, '暂停渲染');
  await outputButton.evaluate((element) => element.click());
  await waitForText(outputButton, '继续渲染');
  const renderPausedText = await outputButton.innerText();
  await outputButton.evaluate((element) => element.click());
  await waitForText(outputButton, '后台渲染 MP4');
  const renderResult = {pausedText: renderPausedText, starts: renderStarts, pauses: renderPauses};
  await page.unroute('**/api/render');
  await page.unroute('**/api/render/**');

  const controls = {
    theme: await page.locator('.react-flow__node-theme .node-button').innerText(),
    story: await page.locator('.react-flow__node-story .node-secondary').innerText(),
    scene: await page.locator(`.react-flow__node[data-id="${project.scenes[0].id}"] .scene-node__actions button`).nth(1).innerText(),
    voice: await page.locator('.react-flow__node-voice .node-button').innerText(),
    output: await page.locator('.react-flow__node-output .node-secondary').innerText(),
  };
  const runningEdges = await page.locator('.workflow-edge--running').count();
  console.log(JSON.stringify({characterResult, storyResult, sceneResult, voiceResult, renderResult, controls, runningEdges, generationRequests, errors}, null, 2));
  if (characterResult.requestCount !== 2 || storyResult.requestCount !== 2 || sceneResult.requestCount !== 2 || voiceResult.requestCount !== 2 || renderResult.starts !== 2 || renderResult.pauses < 1 || runningEdges !== 0 || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
