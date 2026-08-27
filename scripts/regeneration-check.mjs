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
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({title: 'QA 文案排版保护', theme: '爱护花草'}),
});
const positions = {
  theme: {x: 24, y: 84},
  character: {x: 38, y: 404},
  story: {x: 356, y: 246},
  compose: {x: 1280, y: 55},
  voice: {x: 1280, y: 275},
  output: {x: 1280, y: 495},
  ...Object.fromEntries(created.scenes.map((scene, index) => [scene.id, {x: 670 + index % 2 * 300, y: 44 + Math.floor(index / 2) * 224}])),
};
const project = {
  ...created,
  characters: source.characters,
  selectedCharacterId: source.selectedCharacterId,
  nodePositions: positions,
  scenes: created.scenes.map((scene, index) => ({
    ...scene,
    characterId: source.selectedCharacterId,
    backgroundUrl: source.scenes[index]?.backgroundUrl || '',
    characterUrl: source.scenes[index]?.characterUrl || '',
    characterLayout: source.scenes[index]?.characterLayout || scene.characterLayout,
    status: source.scenes[index]?.status || 'draft',
  })),
  updatedAt: new Date().toISOString(),
};
await request('/api/projects/save', {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({project}),
});

const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
const capturedRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

try {
  await page.route('**/api/storyboard/generate', async (route) => {
    const body = route.request().postDataJSON();
    capturedRequests.push(body);
    const scenes = Array.from({length: body.sceneCount}, (_, index) => ({
      id: `model-new-id-${index + 1}`,
      order: index + 1,
      title: `模型标题 ${index + 1}`,
      beat: '模型节拍',
      duration: 6,
      narration: body.purpose === 'copy' ? `AI新文案第${index + 1}句` : `${body.theme}第${index + 1}句`,
      subtitle: body.purpose === 'copy' ? `AI新文案第${index + 1}句` : `${body.theme}第${index + 1}句`,
      backgroundPrompt: `模型背景提示词 ${index + 1}`,
      actionPrompt: `模型动作提示词 ${index + 1}`,
      backgroundUrl: '', characterUrl: '', useCharacter: true,
      characterId: body.characterId, status: 'draft',
      characterLayout: {x: 1, y: 1, width: 10, opacity: .2, entrance: 'left'},
    }));
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
      title: '模型不应覆盖项目标题', lyrics: scenes.map((scene) => scene.narration).join('\n'), scenes, model: 'qa-large-model',
    })});
  });
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.waitForFunction((id) => document.body.textContent.includes(id), created.id);
  const beforeIds = await page.locator('.react-flow__node-scene').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
  const beforeTransforms = await page.locator('.react-flow__node-scene').evaluateAll((nodes) => nodes.map((node) => node.style.transform));
  const beforeImages = await page.locator('.react-flow__node-scene .scene-thumb img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  const modelState = await page.locator('.react-flow__node-story .model-state').textContent();
  await page.locator('.react-flow__node-story button').filter({hasText: 'AI 重写文案'}).click();
  await page.waitForFunction(() => document.body.textContent.includes('AI新文案第5句'));
  await page.waitForTimeout(1300);
  const afterIds = await page.locator('.react-flow__node-scene').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
  const afterTransforms = await page.locator('.react-flow__node-scene').evaluateAll((nodes) => nodes.map((node) => node.style.transform));
  const afterImages = await page.locator('.react-flow__node-scene .scene-thumb img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  const {project: saved} = await request(`/api/projects/${created.id}`);
  await page.locator('.react-flow__node-theme textarea').fill('认识交通灯');
  await page.locator('.react-flow__node-theme button').filter({hasText: '重新生成内容'}).click();
  await page.waitForFunction(() => document.body.textContent.includes('认识交通灯第5句'));
  await page.waitForTimeout(1300);
  const fullIds = await page.locator('.react-flow__node-scene').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
  const fullTransforms = await page.locator('.react-flow__node-scene').evaluateAll((nodes) => nodes.map((node) => node.style.transform));
  const fullImages = await page.locator('.react-flow__node-scene .scene-thumb img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  const {project: fullSaved} = await request(`/api/projects/${created.id}`);
  console.log(JSON.stringify({
    modelState,
    copyUpdated: saved.lyrics.includes('AI新文案第5句'),
    projectTitlePreserved: saved.title === project.title,
    sceneIdsPreserved: JSON.stringify(beforeIds) === JSON.stringify(afterIds) && JSON.stringify(saved.scenes.map((scene) => scene.id)) === JSON.stringify(project.scenes.map((scene) => scene.id)),
    canvasPositionsPreserved: JSON.stringify(beforeTransforms) === JSON.stringify(afterTransforms) && JSON.stringify(saved.nodePositions) === JSON.stringify(positions),
    imageLayersPreserved: JSON.stringify(beforeImages) === JSON.stringify(afterImages) && saved.scenes.every((scene, index) => scene.backgroundUrl === project.scenes[index].backgroundUrl && scene.characterUrl === project.scenes[index].characterUrl),
    characterLayoutsPreserved: saved.scenes.every((scene, index) => JSON.stringify(scene.characterLayout) === JSON.stringify(project.scenes[index].characterLayout)),
    fullRegenerationPreserved: JSON.stringify(beforeIds) === JSON.stringify(fullIds)
      && JSON.stringify(beforeTransforms) === JSON.stringify(fullTransforms)
      && JSON.stringify(beforeImages) === JSON.stringify(fullImages)
      && JSON.stringify(fullSaved.nodePositions) === JSON.stringify(positions)
      && fullSaved.scenes.every((scene, index) => JSON.stringify(scene.characterLayout) === JSON.stringify(project.scenes[index].characterLayout)),
    newThemeUsedImmediately: capturedRequests.some((request) => request.purpose === 'storyboard' && request.theme === '认识交通灯' && request.lyrics === '')
      && fullSaved.theme === '认识交通灯'
      && fullSaved.lyrics.includes('认识交通灯第5句'),
    errors,
  }));
} finally {
  await browser.close();
  await request(`/api/projects/${created.id}`, {method: 'DELETE'});
}
