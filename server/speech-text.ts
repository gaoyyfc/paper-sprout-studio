const PROTECTED_CHILD_PHRASES = [
  '笑眯眯', '亮晶晶', '红彤彤', '绿油油', '金灿灿', '甜蜜蜜', '胖乎乎', '软绵绵', '毛茸茸',
  '暖洋洋', '香喷喷', '圆滚滚', '水汪汪', '气呼呼', '急匆匆', '兴冲冲', '乐呵呵', '慢悠悠',
  '叮叮当当', '蹦蹦跳跳', '高高兴兴', '开开心心', '快快乐乐', '摇摇摆摆', '整整齐齐',
] as const;

const pausePattern = '[，,、；;：:\\s]*';

const repairProtectedPhrases = (value: string) => PROTECTED_CHILD_PHRASES.reduce((text, phrase) => {
  const flexiblePhrase = phrase.split('').join(pausePattern);
  return text.replace(new RegExp(flexiblePhrase, 'g'), phrase);
}, value);

const protectedBoundaries = (text: string) => {
  const blocked = new Set<number>();
  const protectRange = (start: number, length: number) => {
    for (let offset = 1; offset < length; offset += 1) blocked.add(start + offset);
  };
  for (const phrase of PROTECTED_CHILD_PHRASES) {
    let start = text.indexOf(phrase);
    while (start >= 0) {
      protectRange(start, phrase.length);
      start = text.indexOf(phrase, start + phrase.length);
    }
  }
  for (let index = 0; index <= text.length - 3; index += 1) {
    const [a, b, c, d] = text.slice(index, index + 4);
    if (d && a === c && b === d) protectRange(index, 4); // ABAB
  }
  return blocked;
};

const findNaturalBoundary = (text: string) => {
  const segmenter = new Intl.Segmenter('zh-CN', {granularity: 'word'});
  const blocked = protectedBoundaries(text);
  const target = text.length / 2;
  const boundaries: number[] = [];
  let offset = 0;
  for (const item of segmenter.segment(text)) {
    offset += item.segment.length;
    if (offset >= 4 && offset <= text.length - 4 && !blocked.has(offset)) boundaries.push(offset);
  }
  if (!boundaries.length) {
    for (let index = 4; index <= text.length - 4; index += 1) {
      if (!blocked.has(index)) boundaries.push(index);
    }
  }
  return boundaries.sort((first, second) => {
    const score = (boundary: number) => {
      const left = text.slice(0, boundary);
      const right = text.slice(boundary);
      let value = Math.abs(boundary - target);
      if (/^(?:不|先|再|就|慢慢|轻轻|快快|一起|停下|左右)/.test(right)) value -= 1.2;
      if (/(?:了|啦|呀|吧|呢|线|边|下)$/.test(left)) value -= 0.6;
      if (/^(?:的|了|着|过|吗|呢)/.test(right) || /(?:不|没|无|的|地|得)$/.test(left)) value += 4;
      return value;
    };
    return score(first) - score(second);
  })[0];
};

export const prepareAnimationNarration = (value: string) => {
  const repaired = repairProtectedPhrases(value.trim().replace(/\s+/g, ''))
    .replace(/[,]/g, '，')
    .replace(/[;；]+/g, '；')
    .replace(/[。！？!?]+$/, '');
  if (!repaired) return '';
  if (/[，；：！？…]/.test(repaired)) return `${repaired}。`;
  if (repaired.length < 10) return `${repaired}。`;
  const boundary = findNaturalBoundary(repaired);
  return `${repaired.slice(0, boundary)}，${repaired.slice(boundary)}。`;
};
