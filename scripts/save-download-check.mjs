import {readFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1500, height: 950}, acceptDownloads: true});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.waitForFunction(() => {
    const saved = localStorage.getItem('paper-sprout-project:demo-stranger-call');
    if (!saved) return false;
    try {return JSON.parse(saved).characters?.length >= 5;} catch {return false;}
  });
  const beforeSave = await (await fetch('http://127.0.0.1:8787/api/projects/demo-stranger-call')).json();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.topbar-actions .ghost-button').filter({hasText: '保存到本地'}).click(),
  ]);
  const filePath = await download.path();
  const saved = JSON.parse(await readFile(filePath, 'utf8'));
  const toast = await page.locator('.toast').innerText();
  const persisted = await (await fetch(`http://127.0.0.1:8787/api/projects/${encodeURIComponent(saved.id)}`)).json();
  const result = {
    filename: download.suggestedFilename(),
    downloadedProjectId: saved.id,
    serverProjectId: persisted.project?.id,
    toast,
    errors,
    characterCountBefore: beforeSave.project?.characters?.length,
    characterCountAfter: persisted.project?.characters?.length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.filename.endsWith('.json') || result.downloadedProjectId !== result.serverProjectId || result.characterCountBefore !== result.characterCountAfter || !toast.includes('保存成功') || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
