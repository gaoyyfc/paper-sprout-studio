import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const apiRoot = 'http://127.0.0.1:8787';
const request = async (path, options) => {
  const response = await fetch(`${apiRoot}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};

const {project: source} = await request('/api/projects/demo-stranger-call');
const {project: created} = await request('/api/projects', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({title: 'QA 一键自动创作', theme: '快乐洗手歌'}),
});
const sourceScene = source.scenes.find((scene) => scene.backgroundUrl && scene.characterUrl) || source.scenes[0];
const sourceCharacter = source.characters[0];
const rogueCharacterUrl = source.characters.find((character) => character.id !== sourceCharacter.id)?.imageUrl || '/generated/unlisted-character.png';
const sourceAudio = source.voiceSegments?.[0]?.audioUrl || '/projects/demo-stranger-call/audio/qa.mp3';
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const calls = {character: 0, storyboard: 0, scenes: 0, voice: 0, render: 0};
let storyboardTheme = '';
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('502 (Bad Gateway)')) errors.push(message.text());
});

try {
  await page.route('**/api/images/generate', async (route) => {
    calls.character += 1;
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
      imageUrl: sourceCharacter.imageUrl, model: 'qa-image', processed: true,
      alphaReport: {passed: true, transparentRatio: .4, opaqueRatio: .5, edgeTransparentRatio: .95, width: 800, height: 1200},
    })});
  });
  await page.route('**/api/storyboard/generate', async (route) => {
    calls.storyboard += 1;
    const body = route.request().postDataJSON();
    storyboardTheme = body.theme;
    const scenes = Array.from({length: body.sceneCount}, (_, index) => ({
      id: `auto-scene-${index + 1}`, order: index + 1, title: `洗手动作 ${index + 1}`, beat: '快乐节拍', duration: 6,
      narration: `小手搓搓，泡泡跳呀${index + 1}`, subtitle: `小手搓搓，泡泡跳呀${index + 1}`,
      backgroundPrompt: `明亮洗手台背景 ${index + 1}，无人物无动物`, actionPrompt: `主角开心搓手动作 ${index + 1}，完整全身`,
      backgroundUrl: '', characterUrl: '', useCharacter: true, characterId: body.characterId, status: 'draft',
      characterLayout: {x: 50, y: 50, width: 40, opacity: 1, entrance: 'right'},
    }));
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({title: '快乐洗手歌', lyrics: scenes.map((scene) => scene.narration).join('\n'), scenes, model: 'qa-text'})});
  });
  await page.route('**/api/scenes/generate', async (route) => {
    calls.scenes += 1;
    if (calls.scenes === 1) {
      await route.fulfill({status: 502, contentType: 'text/plain', body: ''});
      return;
    }
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
      background: {imageUrl: sourceScene.backgroundUrl, model: 'qa-image', processed: false},
      character: {imageUrl: rogueCharacterUrl, model: 'qa-image', processed: true},
    })});
  });
  await page.route('**/api/voice/generate-scenes', async (route) => {
    calls.voice += 1;
    const body = route.request().postDataJSON();
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({segments: body.scenes.map((scene) => ({sceneId: scene.id, characterId: scene.characterId, audioUrl: sourceAudio, voice: 'qa', profileName: '童声'}))})});
  });
  await page.route('**/api/render', async (route) => {
    calls.render += 1;
    await route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify({jobId: 'qa-auto-render'})});
  });
  await page.route('**/api/render/qa-auto-render', async (route) => {
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({id: 'qa-auto-render', projectId: created.id, status: 'done', progress: 1, stage: 'MP4 已完成', url: '/projects/demo-stranger-call/renders/demo-stranger-call-1787246300979.mp4'})});
  });

  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.waitForFunction((id) => document.body.textContent.includes(id), created.id);
  await page.getByRole('button', {name: '创作模板'}).click();
  await page.locator('.theme-template-list > button').filter({hasText: '洗手泡泡操'}).click();
  await page.locator('.react-flow__edge[data-id="theme-character"] .workflow-edge--running').waitFor();
  const earlyPhaseIsolation = await page.locator('.react-flow__edge[data-id="compose-voice"] .workflow-edge--blocked').count() === 1
    && await page.locator('.react-flow__edge[data-id="voice-output"] .workflow-edge--blocked').count() === 1
    && !(await page.locator('.react-flow__node-output').innerText()).includes('正在渲染');
  await page.waitForFunction(() => document.body.textContent.includes('全部完成 · MP4 可以预览和下载'));
  const {project: saved} = await request(`/api/projects/${created.id}`);
  console.log(JSON.stringify({
    calls,
    templateThemeReachedCanvas: saved.theme === '饭前便后认真洗手，把小手洗干净' && storyboardTheme === saved.theme,
    onlyThemeInputNeeded: calls.character === 1 && calls.storyboard === 1 && calls.scenes === 6 && calls.voice === 1 && calls.render === 1,
    recoveredFromEmptyImageResponse: calls.scenes === 6,
    earlyPhaseIsolation,
    allScenesReady: saved.scenes.length === 5 && saved.scenes.every((scene) => scene.status === 'ready' && scene.backgroundUrl && scene.characterUrl),
    selectedIpLocked: saved.scenes.every((scene) => !scene.useCharacter || scene.characterId === saved.selectedCharacterId && scene.characterUrl === saved.characters.find((character) => character.id === saved.selectedCharacterId)?.imageUrl),
    lyricsMatchScenes: saved.lyrics === saved.scenes.map((scene) => scene.narration).join('\n'),
    voicesReady: saved.voiceSegments?.length === 5,
    downloadReady: await page.locator('.download-link').isVisible(),
    errors,
  }));
} finally {
  await browser.close();
  await request(`/api/projects/${created.id}`, {method: 'DELETE'});
}
