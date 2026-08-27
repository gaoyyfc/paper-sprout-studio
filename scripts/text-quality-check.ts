import {generateStoryboardWithArk} from '../server/text-service.js';

process.env.ARK_API_KEY = 'qa-key';
process.env.ARK_BASE_URL = 'https://qa.invalid/api/v3';

const repeatedLine = '圆圆圆圆转一转，圆圆圆圆转一转。';
const scenes = Array.from({length: 5}, (_, index) => ({
  title: `圆形分镜${index + 1}`,
  beat: index === 0 ? '发现圆形' : '继续认识圆形',
  narration: repeatedLine,
  subtitle: repeatedLine,
  backgroundPrompt: `房间里第${index + 1}个独特圆形道具`,
  actionPrompt: `角色指向第${index + 1}个圆形道具`,
}));
let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  const content = calls === 1
    ? JSON.stringify({title: '圆形转转歌', teachingGoal: '认识圆形', lyrics: scenes.map((item) => item.narration).join('\n'), scenes})
    : JSON.stringify({lines: scenes.map((item) => item.narration)});
  return new Response(JSON.stringify({choices: [{message: {content}}]}), {status: 200, headers: {'Content-Type': 'application/json'}});
};

const result = await generateStoryboardWithArk({theme: '陌生来电安全', lyrics: '', characterId: 'qa-ip', sceneCount: 5});
console.log(JSON.stringify({calls, lyrics: result.lyrics, warningCount: result.qualityWarnings.length, suggestionCount: result.qualitySuggestion?.length || 0, qualityStatus: result.qualityStatus, sceneCount: result.scenes.length}, null, 2));
if (!result.lyrics || result.scenes.length !== 5 || result.qualityStatus !== 'review' || result.qualityWarnings.length === 0 || result.qualitySuggestion?.length !== 5) process.exitCode = 1;
