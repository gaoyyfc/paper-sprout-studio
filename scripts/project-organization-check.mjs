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
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  const themeInput = page.locator('.react-flow__node-theme textarea');
  await themeInput.fill('QA 会实时变化的项目主题');
  await page.getByRole('button', {name: '项目管理'}).click();
  const drawer = page.locator('.project-drawer--organized');
  await drawer.waitFor();
  const themeSynced = await drawer.locator('.current-project-theme strong').innerText() === 'QA 会实时变化的项目主题';
  const groupCount = await drawer.locator('.asset-group').count();
  const backupCollapsed = await drawer.locator('.asset-group').filter({hasText: '原始生成备份'}).locator('.asset-group__items').count() === 0;
  const friendlyAssets = !(await drawer.innerText()).includes('-raw.png') && !(await drawer.innerText()).includes('1787');
  await page.screenshot({path: 'quality/organized-project-manager.png', fullPage: true});
  await page.getByRole('button', {name: '创作画布'}).click();
  const canvasReturned = await drawer.count() === 0 && await page.locator('.toast').filter({hasText: '整理节点视图'}).isVisible();
  console.log(JSON.stringify({themeSynced, groupCount, backupCollapsed, friendlyAssets, canvasReturned, errors}));
} finally {
  await browser.close();
  await request('/api/projects/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({project: source})});
}
