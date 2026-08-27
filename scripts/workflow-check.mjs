import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const apiRoot = 'http://127.0.0.1:8787';
const request = async (path, options) => {
  const response = await fetch(`${apiRoot}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};

await mkdir('quality', {recursive: true});
const {project: source} = await request('/api/projects/demo-stranger-call');
const modelCatalog = await request('/api/models');
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1800, height: 1100}});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

let temporaryProjectId = '';
try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__edge .workflow-edge').length > 4);
  const edgeCount = await page.locator('.react-flow__edge .workflow-edge').count();
  const edgeStatuses = await page.locator('.react-flow__edge .workflow-edge').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('class') || ''));
  const edgeTextLabelsRemoved = await page.locator('.workflow-edge-label').count() === 0;
  const modelSelects = page.locator('.model-picker select');
  const modelSelectCount = await modelSelects.count();
  const modelOptionsHavePrices = await modelSelects.evaluateAll((selects) => selects.every((select) => [...select.options].every((option) => option.text.includes('¥') || option.text.includes('价格'))));
  const voiceNode = page.locator('.react-flow__node-voice');
  const sliders = voiceNode.locator('input[type="range"]');
  const volumeControls = await sliders.count();
  const originalBgm = Number(await sliders.nth(0).inputValue());
  const originalVoice = Number(await sliders.nth(1).inputValue());
  const fitView = page.locator('.react-flow__controls-fitview');
  if (await fitView.count()) await fitView.click();
  await page.waitForTimeout(300);
  await page.screenshot({path: 'quality/model-workflow-overview.png', fullPage: true});

  const draggedNode = page.locator('.react-flow__node-scene').nth(2);
  const draggedNodeId = await draggedNode.getAttribute('data-id');
  const targetEdge = page.locator(`.react-flow__edge[data-id="${draggedNodeId}-compose"] path`).first();
  const pathBefore = await targetEdge.getAttribute('d');
  const box = await draggedNode.boundingBox();
  if (!box) throw new Error('未找到可拖动的分镜节点');
  await page.mouse.move(box.x + box.width / 2, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y - 90, {steps: 12});
  await page.mouse.up();
  await page.waitForTimeout(350);
  const pathAfter = await targetEdge.getAttribute('d');

  await sliders.nth(0).evaluate((input) => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.18'); input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true}));});
  await sliders.nth(1).evaluate((input) => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.82'); input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true}));});
  await page.waitForTimeout(1300);
  const {project: volumeSaved} = await request(`/api/projects/${source.id}`);
  const zoomOut = page.locator('.react-flow__controls-zoomout');
  if (await zoomOut.count()) {await zoomOut.click(); await zoomOut.click();}
  await page.waitForTimeout(250);
  await page.screenshot({path: 'quality/workflow-adaptive-edges.png', fullPage: true});

  await sliders.nth(0).evaluate((input, value) => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value)); input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true}));}, originalBgm);
  await sliders.nth(1).evaluate((input, value) => {Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value)); input.dispatchEvent(new Event('input', {bubbles: true})); input.dispatchEvent(new Event('change', {bubbles: true}));}, originalVoice);
  await page.waitForTimeout(1100);

  const {project: temporary} = await request('/api/projects', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({title: 'QA 流程门禁', theme: '认识颜色'}),
  });
  temporaryProjectId = temporary.id;
  await page.reload({waitUntil: 'networkidle'});
  await page.waitForFunction((id) => document.body.textContent.includes(id), temporary.id);
  const blockedEdges = await page.locator('.workflow-edge--blocked').count();
  const lockedNodes = await page.locator('.flow-node.is-locked').count();
  const voiceButtonDisabled = await page.locator('.react-flow__node-voice .node-button').isDisabled();
  const outputButtonsDisabled = await page.locator('.react-flow__node-output button').evaluateAll((buttons) => buttons.every((button) => button.disabled));

  console.log(JSON.stringify({
    edgeCount,
    edgeStatusesStyled: edgeStatuses.every((name) => name.includes('workflow-edge--')),
    edgeTextLabelsRemoved,
    adaptivePathChanged: Boolean(pathBefore && pathAfter && pathBefore !== pathAfter),
    validPaths: !String(pathAfter).includes('NaN'),
    modelCatalog: {text: modelCatalog.text.length, image: modelCatalog.image.length, voice: modelCatalog.voice.length, sourceHost: modelCatalog.sourceHost},
    modelSelectCount,
    modelOptionsHavePrices,
    volumeControls,
    volumesPersisted: volumeSaved.backgroundMusicVolume === 0.18 && volumeSaved.voiceVolume === 0.82,
    blockedEdges,
    lockedNodes,
    voiceButtonDisabled,
    outputButtonsDisabled,
    errors,
  }));
} finally {
  await browser.close();
  if (temporaryProjectId) await request(`/api/projects/${temporaryProjectId}`, {method: 'DELETE'});
  await request('/api/projects/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({project: source})});
}
