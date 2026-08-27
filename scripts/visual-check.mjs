import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

await mkdir('quality', {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1});
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
const themeInput = page.locator('.react-flow__node-theme textarea').first();
const originalTheme = await themeInput.inputValue();
await themeInput.evaluate((element) => {
  const input = element;
  input.focus();
  input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
  input.value = '中文输入法测试：认识春天';
  input.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertCompositionText', data: '中文输入法测试：认识春天', isComposing: true}));
  input.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '中文输入法测试：认识春天'}));
});
await page.waitForTimeout(150);
const themeEditable = await themeInput.inputValue() === '中文输入法测试：认识春天';
await themeInput.fill(originalTheme);
await page.screenshot({path: 'quality/ui-canvas.png', fullPage: true});
await page.locator('.scene-node .scene-thumb').first().evaluate((element) => element.click());
await page.waitForTimeout(300);
await page.screenshot({path: 'quality/ui-scene-editor.png', fullPage: true});
const sceneEditorVisible = await page.locator('.scene-editor').isVisible();
await page.locator('.scene-editor .icon-button').click();
await page.locator('.topbar-actions button').filter({hasText: '项目'}).click();
await page.waitForTimeout(1200);
await page.screenshot({path: 'quality/ui-projects.png', fullPage: true});
const projectFolders = await page.locator('.file-tree .folder').count();
await page.locator('.project-drawer .icon-button').click();
const initialScenes = await page.locator('.scene-node').count();
await page.locator('.add-scene-button').click();
await page.waitForTimeout(250);
const scenesAfterAdd = await page.locator('.scene-node').count();
page.once('dialog', (dialog) => dialog.accept());
await page.locator('.scene-editor .editor-order .danger').click();
await page.waitForTimeout(250);
const scenesAfterDelete = await page.locator('.scene-node').count();
await page.locator('.topbar-actions button').filter({hasText: 'IP 形象'}).click();
await page.waitForTimeout(300);
const characterDeleteButtons = await page.locator('.character-delete').count();
await page.screenshot({path: 'quality/ui-characters.png', fullPage: true});
await page.locator('.character-drawer .icon-button').click();
await page.locator('.topbar-actions button').filter({hasText: '预览成片'}).click();
await page.waitForTimeout(1200);
await page.screenshot({path: 'quality/ui-preview.png', fullPage: true});
const result = {
  title: await page.title(),
  flowNodes: await page.locator('.flow-node').count(),
  previewVisible: await page.locator('.preview-panel').isVisible(),
  sceneEditorVisible,
  projectFolders,
  characterDeleteButtons,
  themeEditable,
  sceneCrud: {initialScenes, scenesAfterAdd, scenesAfterDelete},
  errors,
};
console.log(JSON.stringify(result));
await browser.close();
