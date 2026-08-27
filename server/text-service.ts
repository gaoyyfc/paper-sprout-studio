import type {StoryScene} from '../src/types.js';
import {prepareAnimationNarration} from './speech-text.js';

const textEndpoint = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

const lyricFillerExpressions = [
  '笑哈哈',
  '乐呵呵',
  '喜洋洋',
  '美滋滋',
  '甜滋滋',
  '真开心',
  '好开心',
  '开开心心',
  '快乐极了',
  '高兴极了',
];

const normalizeLyricText = (value: string) => value
  .replace(/[\p{P}\p{S}\s]/gu, '')
  .toLowerCase();

export const applyTeachingGuardrails = (lines: string[], theme: string) => {
  if (lines.length < 3) return lines;
  const guarded = [...lines];
  const middle = Math.floor(lines.length / 2);
  const fullText = normalizeLyricText(lines.join(''));
  if (/(过马路|红绿灯)/.test(theme)
    && !(fullText.includes('红灯') && fullText.includes('停') && fullText.includes('绿灯') && /(走|行|通过)/.test(fullText))) {
    guarded[middle] = '红灯亮就停一停，绿灯亮了再向前！';
  }
  if (/(陌生.*(电话|来电)|陌生人)/.test(theme)
    && !(/(不接|别接|不跟|不走)/.test(fullText) && /(爸妈|大人|老师|警察)/.test(fullText))) {
    guarded[middle] = /电话|来电/.test(theme)
      ? '陌生来电我不接，马上告诉爸爸妈妈！'
      : '陌生人叫我不跟，快找熟悉的大人！';
  }
  return guarded;
};

const buildSafetyTeachingFallback = (theme: string, sceneCount: number) => {
  if (sceneCount !== 5) return undefined;
  if (/(过马路|红绿灯)/.test(theme)) return [
    '小伙伴来到马路口，汽车呼呼跑。',
    '它收住小脚，抬头寻找信号灯。',
    '红灯亮就停一停，绿灯亮了再向前！',
    '确认车辆都停好，稳稳走过斑马线。',
    '平平安安到对面啦！',
  ];
  if (/(陌生.*(电话|来电)|陌生人)/.test(theme)) return /电话|来电/.test(theme) ? [
    '电话铃声突然响，是谁找我呀？',
    '屏幕名字不认识，小手先停下。',
    '陌生来电我不接，马上告诉爸爸妈妈！',
    '爸爸过来查一查，陪我把它挂断。',
    '保护自己我会啦！',
  ] : [
    '放学路上有人喊，是谁在叫我？',
    '名字不认识，小脚马上停住。',
    '陌生人叫我不跟，快找熟悉的大人！',
    '老师牵起我的手，一起安全回家。',
    '保护自己我会啦！',
  ];
  return undefined;
};

export const findLyricRepetitionIssues = (lines: string[], theme = '') => {
  const normalizedLines = lines.map(normalizeLyricText);
  const normalizedTheme = normalizeLyricText(theme);
  const issues: string[] = [];

  const lineOwners = new Map<string, number[]>();
  normalizedLines.forEach((line, index) => {
    if (!line) return;
    lineOwners.set(line, [...(lineOwners.get(line) || []), index + 1]);
  });
  lineOwners.forEach((owners, line) => {
    if (owners.length > 1) issues.push(`第${owners.join('、')}句内容完全重复（${line}）`);
  });

  lyricFillerExpressions.forEach((expression) => {
    const owners = normalizedLines
      .map((line, index) => line.includes(expression) ? index + 1 : 0)
      .filter(Boolean);
    if (owners.length > 1) issues.push(`口头填充词“${expression}”在第${owners.join('、')}句重复`);
  });

  const phraseOwners = new Map<string, Set<number>>();
  normalizedLines.forEach((line, index) => {
    const linePhrases = new Set<string>();
    for (let offset = 0; offset <= line.length - 4; offset += 1) {
      const phrase = line.slice(offset, offset + 4);
      if (normalizedTheme.includes(phrase)) continue;
      linePhrases.add(phrase);
    }
    linePhrases.forEach((phrase) => {
      const owners = phraseOwners.get(phrase) || new Set<number>();
      owners.add(index + 1);
      phraseOwners.set(phrase, owners);
    });
  });
  [...phraseOwners.entries()]
    .filter(([, owners]) => owners.size > 1)
    .slice(0, 4)
    .forEach(([phrase, owners]) => {
      issues.push(`短语“${phrase}”在第${[...owners].join('、')}句重复`);
    });

  const openingOwners = new Map<string, number[]>();
  normalizedLines.forEach((line, index) => {
    if (line.length < 4) return;
    const opening = line.slice(0, 4);
    openingOwners.set(opening, [...(openingOwners.get(opening) || []), index + 1]);
  });
  openingOwners.forEach((owners, opening) => {
    if (owners.length > 1 && !issues.some((issue) => issue.includes(`“${opening}”`))) {
      issues.push(`第${owners.join('、')}句使用了相同开头“${opening}”`);
    }
  });

  const cadenceSignatures = lines.map((line) => {
    const clauses = line.split(/[，,、；;。！？!?]+/).map((clause) => normalizeLyricText(clause)).filter(Boolean);
    return {clauseCount: clauses.length, signature: clauses.map((clause) => clause.length).join('-')};
  });
  if (lines.length >= 4 && new Set(cadenceSignatures.map((item) => item.clauseCount)).size < 2) {
    issues.push('全篇使用了相同的分句数量，节奏过于整齐单一');
  }
  const cadenceOwners = new Map<string, number[]>();
  cadenceSignatures.forEach(({signature}, index) => {
    cadenceOwners.set(signature, [...(cadenceOwners.get(signature) || []), index + 1]);
  });
  cadenceOwners.forEach((owners, signature) => {
    if (owners.length >= 3) issues.push(`第${owners.join('、')}句使用了相同的节拍长度（${signature}）`);
  });

  const fullText = normalizedLines.join('');
  ['忙瞅', '踏横道线', '牢记心间', '记心间', '养成习惯'].forEach((phrase) => {
    if (fullText.includes(phrase)) issues.push(`出现了不适合幼儿口语的生硬套话“${phrase}”`);
  });
  if (/(过马路|红绿灯)/.test(theme)
    && !(fullText.includes('红灯') && fullText.includes('停') && fullText.includes('绿灯') && /(走|行|通过)/.test(fullText))) {
    issues.push('红绿灯教学没有同时明确唱出“红灯停”和“绿灯走”的可执行规则');
  }
  if (/(陌生.*(电话|来电)|陌生人)/.test(theme)
    && !(/(不接|别接|不跟|不走)/.test(fullText) && /(爸妈|大人|老师|警察)/.test(fullText))) {
    issues.push('陌生人安全教学没有同时唱出拒绝动作和求助对象');
  }

  return [...new Set(issues)].slice(0, 8);
};

const extractJson = (value: string) => {
  const cleaned = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('文案模型没有返回可解析的 JSON');
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
};

const promptBoilerplate = {
  background: /^(?:竖屏(?:9[:：]16)?|9[:：]16竖屏|儿童剪纸绘本(?:风格)?|剪纸绘本(?:风格)?|剪纸风格|无人物(?:、?无动物)?|无动物|不要出现人物(?:或动物)?|背景中(?:不|无)人物(?:或动物)?|只描述背景)$/i,
  action: /^(?:儿童剪纸绘本(?:风格)?|剪纸绘本(?:风格)?|剪纸风格|IP角色|完整全身(?:动作和表情)?|角色完整全身(?:动作和表情)?|透明PNG(?:叠加)?|透明背景|方便(?:透明PNG)?叠加)$/i,
};

const promptClauses = (value: unknown, kind: keyof typeof promptBoilerplate) => String(value || '')
  .replace(/(?:儿童)?剪纸(?:绘本)?(?:风格)?/gi, '')
  .replace(/(?:9[:：]16)?竖屏(?:居中构图|居中)?/gi, '')
  .replace(/[\r\n]+/g, '，')
  .split(/[，,。；;]+/)
  .map((clause) => clause.trim().replace(/^(?:画面|场景|背景|动作)[:：]\s*/, ''))
  .filter((clause) => clause.length > 1 && !promptBoilerplate[kind].test(clause));

const uniqueScenePrompts = (
  values: unknown[],
  kind: keyof typeof promptBoilerplate,
  fallbacks: string[],
) => {
  const seen = new Set<string>();
  return values.map((value, index) => {
    const clauses = promptClauses(value, kind).filter((clause) => {
      const key = clause.replace(/[\s“”'"（）()]/g, '').toLowerCase();
      if (key.length < 5) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return clauses.join('，') || fallbacks[index];
  });
};

export const generateStoryboardWithArk = async ({
  theme,
  lyrics,
  characterId,
  sceneCount,
  purpose = 'storyboard',
  modelId,
}: {
  theme: string;
  lyrics: string;
  characterId: string;
  sceneCount: number;
  purpose?: 'storyboard' | 'copy';
  modelId?: string;
}) => {
  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const model = modelId || process.env.ARK_TEXT_MODEL || 'doubao-seed-2-0-mini-260428';
  if (!apiKey) throw new Error('未找到 ARK_API_KEY，无法生成儿童文案');
  const taskInstruction = purpose === 'copy'
    ? '本次任务是重新创作儿童文案。必须明显改写原句，让语言更像孩子会唱的儿歌，但保持主题和正确早教含义。'
    : '本次任务是根据当前主题从零生成完整儿童文案与可编辑分镜提示词。当前主题是唯一内容依据，标题、每句歌词、字幕、背景和动作都必须直接服务于该主题，不得混入其他主题。';
  const prompt = `创作一支适合抖音发布的儿童早教儿歌短视频。\n主题：${theme}\n分镜数：${sceneCount}\n总时长：约30秒\n${taskInstruction}\n${lyrics.trim() ? `现有文案（只作为含义参考，不要逐句照抄）：\n${lyrics.trim()}` : '用户未提供草稿，请从零创作。'}\n\n只返回 JSON，不要 markdown。格式：{"title":"片名","teachingGoal":"全片唯一的一句话教学目标","lyrics":"每个分镜一句，用\\n分隔","scenes":[{"title":"短标题","beat":"本镜在连续教学故事中的作用","narration":"一句适合朗读的儿歌歌词","subtitle":"18字内字幕","backgroundPrompt":"只写本镜独有的空间、道具、光线和构图","actionPrompt":"只写本镜独有的角色动作、姿势和表情"}]}。\n\n先在内部完成教学设计，再写儿歌：\n- 只确定一个可验证的教学目标，所有分镜都围绕它，不横向扩展第二个知识点。\n- 把全片写成一件连续发生的小事：第1镜提出情境或目标，第2镜开始行动，第3镜给出最关键的方法，第4镜实践并看到结果，最后一镜回扣目标并自然收尾。后一镜必须承接前一镜已经出现的人物、物品、动作或结果，不能像五条独立标语。\n\n儿歌创作硬性标准：\n1. 面向2-6岁儿童，像孩子边唱边做动作，不写成老师讲道理。\n2. 每句7-20个汉字，一口气能说完；五句必须至少使用三种节奏形态，例如短问句或惊叹句、两个自然短拍、三个递进小拍、稍长的故事句。禁止每句都写成相同长度的“前半句，后半句”。\n3. 标点服从人类说话方式：一行可以不用逗号，也可以有一至两个自然停顿；不要为了排版硬切句，叠词不能拆开。\n4. 使用生动且各不相同的动作词和儿童口语；“呀、啦、哇、咚咚、滴答”等语气词或拟声词可以使用，但同一个词全篇最多出现一次。\n5. 用情节推进、韵脚变化和长短句交替帮助记忆，不要靠复制词语制造记忆点；“笑哈哈、乐呵呵、喜洋洋、美滋滋、真开心、开开心心”等口头填充词全篇各自最多出现一次。\n6. 每句必须使用不同的句式开头、核心动作和收尾，不得在不同句子中复用相同的四字及以上短语；主题关键词除外。\n7. 每句必须语法完整、意思明确；代词指向清楚，后一镜不能突然出现前文没有铺垫的人物、道具或新知识。\n8. 早教知识必须正确、安全；最关键的知识或方法要在第3镜清楚唱出，其余分镜负责铺垫、示范、练习和结果。\n9. 五个分镜必须像同一个故事里的五张连续插画：时间、地点和道具可以自然变化，但因果关系必须连续，不能复制相同画面或动作。\n10. backgroundPrompt 和 actionPrompt 必须准确对应本镜 narration，并承接上一镜的可见状态；不要写“竖屏、9:16、剪纸绘本、无人物、无动物、完整全身、透明PNG”等后台固定规则。\n11. lyrics必须与scenes中每条narration逐句完全一致，严格返回${sceneCount}个分镜。\n输出前在内部检查：五句是否只教一件事、能否按顺序讲成一个小故事、删掉任意一句是否会断链、节奏是否有明显变化、是否存在重复短语；不合格先重写再输出JSON。`;
  const naturalTeachingAddendum = `补充质量红线：第3镜必须直接唱出孩子能照做的核心方法，不能只写“看一看、想一想、记心间”。安全主题必须明确条件与动作，例如红灯停、绿灯行，不能靠画面暗示。只用2-6岁孩子日常会说的自然口语，禁止“忙瞅、踏横道线、牢记心间、养成习惯”等生硬或强行押韵的套话；宁可少押韵，也要通顺、生动、好唱。`;
  const response = await fetch(textEndpoint(baseUrl), {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model,
      temperature: 0.82,
      presence_penalty: 0.55,
      frequency_penalty: 0.5,
      max_tokens: 2600,
      messages: [
        {role: 'system', content: '你是擅长押韵、变化节奏、克制使用拟声词和设计动作游戏的幼儿儿歌作词人，也是儿童分镜导演。作品必须让2-6岁孩子容易开口跟唱，并避免重复词语和套话。输出严格、有效的 JSON。'},
        {role: 'user', content: prompt},
        {role: 'user', content: naturalTeachingAddendum},
      ],
    }),
  });
  const payload = await response.json() as {
    choices?: Array<{message?: {content?: string}}>;
    error?: {message?: string; code?: string};
  };
  if (!response.ok) throw new Error(payload.error?.message || payload.error?.code || `文案接口返回 ${response.status}`);
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error('文案模型未返回内容');
  const data = extractJson(raw);
  const sourceScenes = Array.isArray(data.scenes) ? data.scenes.slice(0, sceneCount) as Array<Record<string, unknown>> : [];
  if (sourceScenes.length !== sceneCount) throw new Error(`文案模型返回了 ${sourceScenes.length} 个分镜，预期 ${sceneCount} 个`);
  const draftLines = sourceScenes.map((item) => String(item.narration || '').replace(/\s+/g, '').trim());
  const teachingGoal = String(data.teachingGoal || `让孩子通过一个连续故事理解“${theme}”`);
  let polishedLines = draftLines;
  try {
    const polishResponse = await fetch(textEndpoint(baseUrl), {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify({
        model,
        temperature: 0.72,
        presence_penalty: 0.5,
        frequency_penalty: 0.45,
        max_tokens: 1000,
        messages: [
          {role: 'system', content: `你是幼儿课程编辑和儿歌出版总编，负责统一教学目标、修复故事断链，并用长短句交替写出自然、容易跟唱的成品。${naturalTeachingAddendum}只输出有效JSON。`},
          {role: 'user', content: `主题：${theme}\n唯一教学目标：${teachingGoal}\n分镜初稿：${JSON.stringify(sourceScenes.map((scene) => ({title: scene.title, beat: scene.beat, narration: scene.narration})))}\n请把这些分镜精修成一条连续教学故事，并只返回：{"lines":["第一句","第二句"]}（实际数组必须有${sceneCount}句）。\n硬性标准：每句7-20个汉字且不含空格；五句只能服务于上述唯一教学目标，依次完成“情境引入→开始行动→关键方法→实践结果→回扣收尾”，每句都要承接上一句的具体内容；保持每镜原有场景含义，不能突然加入未铺垫的新人物、新道具或第二个知识点；至少使用三种不同节奏，短问句或惊叹句、双拍句、三拍递进句和稍长故事句交替出现，禁止每句都用一个逗号切成相同两半；标点按人类说话自然停顿，“笑眯眯、亮晶晶、叮叮当当、蹦蹦跳跳”等叠词绝不拆开；涉及安全或行为规则时，第3句必须明确唱出正确做法，不能只用表情暗示；通过情节推进和变化韵脚形成记忆点，不复制词语；口头填充词各自最多一次；不同句子不得复用相同四字及以上短语，不得使用相同句式开头；拟声词同一个最多一次；不能为押韵牺牲语义。`},
        ],
      }),
    });
    if (polishResponse.ok) {
      const polishPayload = await polishResponse.json() as {choices?: Array<{message?: {content?: string}}>};
      const polishRaw = polishPayload.choices?.[0]?.message?.content;
      if (polishRaw) {
        const polishData = extractJson(polishRaw);
        const candidate = Array.isArray(polishData.lines) ? polishData.lines.map((line) => String(line).replace(/\s+/g, '').trim()) : [];
        if (candidate.length === sceneCount && candidate.every((line) => line.length >= 6 && line.length <= 24)) polishedLines = candidate;
      }
    }
  } catch {
    polishedLines = draftLines;
  }
  polishedLines = applyTeachingGuardrails(polishedLines.map(prepareAnimationNarration), theme);
  let repetitionIssues = findLyricRepetitionIssues(polishedLines, theme);
  for (let attempt = 0; attempt < 2 && repetitionIssues.length > 0; attempt += 1) {
    try {
      const rewriteResponse = await fetch(textEndpoint(baseUrl), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
        body: JSON.stringify({
          model,
          temperature: 0.88,
          presence_penalty: 0.85,
          frequency_penalty: 0.75,
          max_tokens: 1000,
          messages: [
            {role: 'system', content: `你是幼儿儿歌去重编辑。你必须彻底改写重复内容，同时保持儿歌自然、准确、朗朗上口。${naturalTeachingAddendum}只输出有效JSON。`},
            {role: 'user', content: `主题：${theme}\n唯一教学目标：${teachingGoal}\n当前文案：${JSON.stringify(polishedLines)}\n检测到的问题：${repetitionIssues.join('；')}\n请重写问题句，并整体检查后只返回：{"lines":["第一句","第二句"]}，实际必须有${sceneCount}句。每句7-20个汉字；保持“情境→行动→关键方法→结果→回扣”的连续顺序；后一行要承接前一行，不得引入第二个教学点；使用至少三种不同节奏，允许无逗号的短问句或惊叹句、双拍句和三拍句，禁止把每句都切成相同两半；每句使用不同的开头、动作、画面和收尾；除主题关键词外，任意四字及以上短语不得跨句重复；口头填充词以及同一个语气词或拟声词最多一次。不要仅替换标点，必须实质改掉被指出的问题。`},
          ],
        }),
      });
      if (!rewriteResponse.ok) break;
      const rewritePayload = await rewriteResponse.json() as {choices?: Array<{message?: {content?: string}}>};
      const rewriteRaw = rewritePayload.choices?.[0]?.message?.content;
      if (!rewriteRaw) break;
      const rewriteData = extractJson(rewriteRaw);
      const candidate = Array.isArray(rewriteData.lines)
        ? rewriteData.lines.map((line) => prepareAnimationNarration(String(line).replace(/\s+/g, '').trim()))
        : [];
      if (candidate.length !== sceneCount || candidate.some((line) => line.length < 6 || line.length > 24)) break;
      polishedLines = applyTeachingGuardrails(candidate, theme);
      repetitionIssues = findLyricRepetitionIssues(polishedLines, theme);
    } catch {
      break;
    }
  }
  // Quality checks are advisory after the model has produced structurally valid copy.
  // Always return the generated text so the user can decide whether to keep or regenerate it.
  const fallbackCandidate = repetitionIssues.length > 0 ? buildSafetyTeachingFallback(theme, sceneCount)?.map(prepareAnimationNarration) : undefined;
  const qualitySuggestion = fallbackCandidate && findLyricRepetitionIssues(fallbackCandidate, theme).length < repetitionIssues.length
    ? fallbackCandidate
    : undefined;
  const duration = Math.max(3, Math.round(30 / sceneCount * 10) / 10);
  const sceneTitles = sourceScenes.map((item, index) => String(item.title || `分镜 ${index + 1}`));
  const backgroundPrompts = uniqueScenePrompts(
    sourceScenes.map((item) => item.backgroundPrompt),
    'background',
    sceneTitles.map((title) => `${title}对应的独特生活空间，核心道具清楚，前中后景层次分明`),
  );
  const actionPrompts = uniqueScenePrompts(
    sourceScenes.map((item) => item.actionPrompt),
    'action',
    sceneTitles.map((title) => `做出与${title}直接相关的清楚动作，姿势舒展，表情活泼`),
  );
  const scenes: StoryScene[] = sourceScenes.map((item, index) => ({
    id: `scene-${Date.now()}-${index + 1}`,
    order: index + 1,
    title: String(item.title || `分镜 ${index + 1}`),
    beat: String(item.beat || '儿歌节拍'),
    duration,
    narration: polishedLines[index],
    subtitle: polishedLines[index].slice(0, 22),
    backgroundPrompt: backgroundPrompts[index],
    actionPrompt: actionPrompts[index],
    backgroundUrl: '',
    characterUrl: '',
    useCharacter: true,
    characterId,
    status: 'draft',
    characterLayout: {
      x: index % 2 === 0 ? 52 : 10,
      y: 50,
      width: 40,
      opacity: 1,
      entrance: index % 2 === 0 ? 'right' : 'left',
    },
  }));
  if (scenes.some((scene) => !scene.narration || scene.narration.length > 28)) {
    throw new Error('文案模型返回的儿歌句子为空或过长，请重新生成');
  }
  const normalizedLyrics = scenes.map((scene) => scene.narration).join('\n');
  return {
    title: String(data.title || `${theme.slice(0, 10)}儿歌`),
    lyrics: normalizedLyrics,
    scenes,
    model,
    qualityWarnings: repetitionIssues,
    qualityStatus: repetitionIssues.length > 0 ? 'review' as const : 'passed' as const,
    qualitySuggestion,
  };
};
