import type {StoryScene} from '../src/types.js';

const defaultLines = (theme: string) => [
  `${theme}，先停一停`,
  '小耳朵认真听，先把事情问清楚',
  '名字地址和秘密，不能随便告诉你',
  '遇到事情不慌张，快去寻找大人帮',
  '安全办法记心上，开开心心长大啦',
];

const titles = ['先停一停', '认真看一看', '规则记清楚', '找到大人帮', '一起唱着记'];
const beats = ['3秒安全钩子', '建立具体情境', '讲清核心规则', '演示正确动作', '节奏重复强化'];
const settings = ['明亮温暖的儿童房', '色彩柔和的家庭客厅', '有安全盾牌装饰的绘本空间', '通向家长身边的温馨走廊', '阳光、云朵与彩旗组成的剪纸舞台'];
const actions = ['举起一只手做停一停动作，神情友好认真', '歪头仔细倾听，一只手放在耳边', '双手轻轻交叉并摇头，表达不能泄露秘密', '小跑着去找信任的大人，一只手向前指', '开心地竖起大拇指，做唱完儿歌的收尾姿势'];

export const buildStoryboard = (theme: string, lyrics: string, characterId: string): {title: string; lyrics: string; scenes: StoryScene[]} => {
  const sourceLines = lyrics.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = sourceLines.length >= 5 ? sourceLines.slice(0, 5) : defaultLines(theme);
  const normalizedLyrics = lines.join('\n');
  const scenes = lines.map((line, index): StoryScene => ({
    id: `scene-${index + 1}`,
    order: index + 1,
    title: titles[index],
    beat: beats[index],
    duration: 6,
    narration: line,
    subtitle: line.length > 18 ? `${line.slice(0, 17)}…` : line,
    backgroundPrompt: `${settings[index]}，围绕“${theme}”展开，只有两个清楚的儿童生活道具，构图与前后分镜明显不同`,
    actionPrompt: actions[index],
    backgroundUrl: `/placeholders/scene-${index + 1}.svg`,
    characterUrl: '',
    useCharacter: true,
    characterId,
    status: 'draft',
    characterLayout: {
      x: index % 2 === 0 ? 53 : 11,
      y: index === 2 ? 46 : 51,
      width: 38,
      opacity: 0.96,
      entrance: index % 2 === 0 ? 'right' : 'left',
    },
  }));
  return {title: `${theme.replace(/[，。！？\s]/g, '').slice(0, 10)}儿歌`, lyrics: normalizedLyrics, scenes};
};
