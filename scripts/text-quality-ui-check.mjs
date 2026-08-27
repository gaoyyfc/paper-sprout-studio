import {chromium} from 'file:///C:/Users/GY/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const {project} = await (await fetch('http://127.0.0.1:8787/api/projects/demo-stranger-call')).json();
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {if (message.type() === 'error') errors.push(message.text());});
await page.route('**/api/projects/save', (route) => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true})}));
await page.route('**/api/storyboard/generate', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    title: project.title,
    lyrics: project.lyrics,
    scenes: project.scenes,
    model: project.textModel || 'qa-text-model',
    qualityStatus: 'review',
    qualityWarnings: ['第1、2句内容完全重复', '全篇节奏过于一致'],
    qualitySuggestion: project.scenes.map((scene, index) => `质量优化后的第${index + 1}句${scene.title}`),
  }),
}));

try {
  await page.goto('http://127.0.0.1:5173', {waitUntil: 'networkidle'});
  await page.locator('.react-flow__node-story .node-secondary').click({force: true});
  await page.locator('.copy-quality-review').waitFor();
  const warningText = await page.locator('.copy-quality-review').innerText();
  const restoredRewriteText = await page.locator('.react-flow__node-story .node-secondary').innerText();
  const lyricsVisible = (await page.locator('.react-flow__node-story textarea').inputValue()).trim().length > 0;
  await page.locator('.copy-quality-review button').filter({hasText: '使用质量优化版'}).click({force: true});
  await page.locator('.copy-quality-review').waitFor({state: 'detached'});
  const optimizedLyrics = await page.locator('.react-flow__node-story textarea').inputValue();
  console.log(JSON.stringify({warningText, restoredRewriteText, optimizedLyrics, lyricsVisible, errors}, null, 2));
  if (!warningText.includes('使用质量优化版') || !restoredRewriteText.includes('AI 重写文案') || !optimizedLyrics.includes('质量优化后的第1句') || !lyricsVisible || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
