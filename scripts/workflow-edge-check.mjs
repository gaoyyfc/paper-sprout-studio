import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

await mkdir('quality', {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 980}});
const errors = [];
const originalProject = await fetch('http://127.0.0.1:8787/api/projects/demo-stranger-call').then((response) => response.json()).then((payload) => payload.project);
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  const sceneNodes = page.locator('.react-flow__node-scene');
  const storyNode = page.locator('.react-flow__node-story');
  const firstFanEdge = page.locator('.react-flow__edge-path').nth(2);
  const beforePath = await firstFanEdge.getAttribute('d');
  await page.screenshot({path: 'quality/workflow-restored-layout.png', fullPage: true});
  const beforeBox = await storyNode.boundingBox();
  if (!beforeBox) throw new Error('未找到文案节点');
  await page.mouse.move(beforeBox.x + 40, beforeBox.y + 22);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + 95, beforeBox.y + 57, {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterPath = await firstFanEdge.getAttribute('d');
  const runningEdges = await page.locator('.workflow-edge--running').count();
  const readyAnimation = await page.locator('.workflow-edge--ready').first().evaluate((element) => getComputedStyle(element).animationName).catch(() => 'none');
  await page.screenshot({path: 'quality/workflow-curved-layout.png', fullPage: true});
  console.log(JSON.stringify({sceneCount: await sceneNodes.count(), curved: Boolean(afterPath?.includes(' C ')), pathChangedAfterDrag: beforePath !== afterPath, runningEdges, readyAnimation, errors}));
} finally {
  await browser.close();
  await fetch('http://127.0.0.1:8787/api/projects/save', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({project: originalProject})});
}
