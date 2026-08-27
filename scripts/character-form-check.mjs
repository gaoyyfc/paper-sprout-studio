import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const apiRoot = 'http://127.0.0.1:8787';
const request = async (path, options) => {
  const response = await fetch(`${apiRoot}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
const {project: source} = await request('/api/projects/demo-stranger-call');
const sample = source.characters[0];
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1400, height: 950}});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

try {
  await page.route('**/api/images/generate', (route) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
    imageUrl: sample.imageUrl,
    model: 'qa-image-model',
    processed: true,
    alphaReport: {passed: true, transparentRatio: .42, opaqueRatio: .58, foregroundRatio: .58, edgeTransparentRatio: 1, quality: 'strict', width: 900, height: 1200},
  })}));
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.locator('.topbar-actions button').filter({hasText: 'IP 形象'}).click();
  const form = page.locator('.generator-card');
  const name = form.locator('input');
  const description = form.locator('textarea');
  const initiallyBlank = await name.inputValue() === '' && await description.inputValue() === '';
  await name.fill('QA 星星熊');
  await description.fill('金黄色小熊，蓝色围巾，圆润活泼');
  await form.locator('button').filter({hasText: '生成透明 IP 形象'}).click();
  await form.locator('.generator-success').waitFor();
  const clearedAfterSuccess = await name.inputValue() === '' && await description.inputValue() === '';
  const newCardVisible = await page.locator('.character-card').filter({hasText: 'QA 星星熊'}).isVisible();
  console.log(JSON.stringify({initiallyBlank, clearedAfterSuccess, newCardVisible, errors}));
} finally {
  await browser.close();
  await request('/api/projects/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({project: source})});
}
