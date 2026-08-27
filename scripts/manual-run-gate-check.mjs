import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1500, height: 950}});
const generationRequests = [];
const errors = [];
page.on('request', (request) => {
  if (/\/api\/(storyboard|character\/generate|scene\/generate|voice\/generate-scenes|render)/.test(request.url())) generationRequests.push(request.url());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/projects/save', (route) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}));

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.locator('.side-rail button').filter({hasText: '创作模板'}).click();
  await page.locator('.theme-template-list > button').nth(1).click();
  await page.waitForTimeout(1400);
  const stageText = await page.locator('.auto-stage').innerText();
  const runningEdges = await page.locator('.workflow-edge--running').count();
  const generationButtonText = await page.locator('.react-flow__node-theme .node-button').innerText();
  console.log(JSON.stringify({generationRequests, runningEdges, stageText, generationButtonText, errors}));
} finally {
  await browser.close();
}
