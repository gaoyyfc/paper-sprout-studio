import type {PaperCharacter, StoryScene, VideoProject} from '../types';

export const sampleCharacters: PaperCharacter[] = [
  {
    id: 'pao-pao',
    name: '泡泡象',
    description: '浅蓝色小象，橙色小帽子，真实 Ark 生图并自动去绿',
    imageUrl: '/generated/character-1787227815936-Jyc4GJ.png',
    status: 'ready',
    createdAt: new Date().toISOString(),
    voiceProfileId: 'elephant-boy',
  },
  {id: 'guoguo-fox', name: '果果狐', description: '橙色小狐狸，湖蓝背带裤，勇敢又好奇', imageUrl: '/projects/demo-stranger-call/images/ip-guoguo.png', status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: 'candy-pop'},
  {id: 'xiaoya-dino', name: '小芽龙', description: '薄荷绿小恐龙，蓝围巾，温柔勇敢', imageUrl: '/projects/demo-stranger-call/images/ip-xiaoya.png', status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: 'playful'},
  {id: 'mianmian-lamb', name: '绵绵', description: '奶油白小羊，珊瑚背带裤，温暖细心', imageUrl: '/projects/demo-stranger-call/images/ip-mianmian.png', status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: 'story-warm'},
  {id: 'diandian-penguin', name: '点点', description: '深蓝小企鹅，橙色帽子，活泼爱分享', imageUrl: '/projects/demo-stranger-call/images/ip-diandian.png', status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: 'penguin-boy', voicePreviewUrl: '/projects/demo-stranger-call/audio/voice-1787365563953-95668d.mp3'},
  {id: 'lele-lion', name: '乐乐', description: '金色小狮子，砖红马甲，自信又友善', imageUrl: '/projects/demo-stranger-call/images/ip-lele.png', status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: 'lion-boy'},
  {id: 'guaiguai-rabbit', name: '乖乖兔', description: '浅粉色小兔，白色贝雷帽，抱着胡萝卜，甜美又亲切', imageUrl: '/projects/demo-stranger-call/images/character-1787325634966-xH04ZY.png', status: 'ready', createdAt: new Date().toISOString(), voiceProfileId: 'rabbit-girl', voicePreviewUrl: '/projects/demo-stranger-call/audio/voice-1787365564850-9f9bed.mp3'},
];

const makeScene = (
  order: number,
  title: string,
  beat: string,
  subtitle: string,
  narration: string,
  backgroundPrompt: string,
  actionPrompt: string,
): StoryScene => ({
  id: `scene-${order}`,
  order,
  title,
  beat,
  duration: 6,
  narration,
  subtitle,
  backgroundPrompt,
  actionPrompt,
  backgroundUrl: '',
  characterUrl: '',
  useCharacter: true,
  characterId: 'pao-pao',
  status: 'draft',
  characterLayout: {
    x: order % 2 ? 54 : 12,
    y: order === 3 ? 46 : 51,
    width: 38,
    opacity: 0.96,
    entrance: order % 2 ? 'right' : 'left',
  },
});

export const sampleScenes: StoryScene[] = [
  makeScene(1, '先停一停', '3秒安全钩子', '陌生电话，先别急着接', '小电话叮铃铃，陌生号码停一停。', '明亮温暖的儿童房，木桌上有一部玩具电话，窗外清晨阳光，画面中央留出自然活动空间，无人物无文字', '妙妙兔听见铃声，举起一只手做“停一停”的动作，身体微微前倾，完整全身'),
  makeScene(2, '问问是谁', '建立规则', '先问清楚，你是谁？', '小耳朵认真听，先问一句你是谁。', '奶油色客厅，圆形地毯与矮书架，玩具电话在小桌上，连续自然的墙面作为负空间，无人物无文字', '妙妙兔站在电话旁，歪头认真倾听，一只手放在耳边，完整全身，面向左侧'),
  makeScene(3, '秘密不说', '核心知识点', '名字地址，不告诉陌生人', '名字地址和学校，陌生人问也不说。', '儿童绘本风安全小屋，墙上是没有文字的盾牌形装饰，地面有积木，背景干净，无人物无文字', '妙妙兔双手交叉在胸前，轻轻摇头，表情坚定友好，完整全身，正面'),
  makeScene(4, '找到大人', '可执行动作', '快去找爸爸妈妈', '放下电话快快跑，爸爸妈妈来帮忙。', '温馨家庭走廊通向明亮厨房，门边有低矮鞋柜，画面有清晰行进方向，无人物无文字', '妙妙兔小跑着去找家长，一只手向前指，背带裤轻轻摆动，完整全身，朝右'),
  makeScene(5, '一起记牢', '重复强化', '不慌张，不泄露，找大人', '陌生电话别慌张，不说秘密找家长。', '彩色剪纸舞台，柔和太阳、云朵和安全盾牌装饰，中央有完整自然地面，无人物无文字', '妙妙兔开心地竖起大拇指，另一只手拿着玩具电话，双脚完整，正面收尾动作'),
];

export const createInitialProject = (): VideoProject => ({
  id: 'demo-stranger-call',
  title: '陌生电话安全歌',
  theme: '不要接陌生人电话',
  lyrics: '小电话叮铃铃，陌生号码停一停。\n小耳朵认真听，先问一句你是谁。\n名字地址和学校，陌生人问也不说。\n放下电话快快跑，爸爸妈妈来帮忙。\n陌生电话别慌张，不说秘密找家长。',
  platform: 'Douyin',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 30,
  style: '儿童剪纸绘本',
  selectedCharacterId: 'pao-pao',
  audioUrl: '',
  backgroundMusicUrl: '/audio/paper-sprout-playful.wav',
  backgroundMusicVolume: 0.12,
  voiceVolume: 1,
  textModel: 'doubao-seed-2-0-mini-260428',
  imageModel: 'doubao-seedream-5-0-260128',
  voiceModel: 'seed-tts-2.0',
  transitionSeconds: 1,
  characters: sampleCharacters,
  scenes: sampleScenes,
  updatedAt: new Date().toISOString(),
});
