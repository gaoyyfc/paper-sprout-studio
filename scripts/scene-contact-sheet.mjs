import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const project = JSON.parse(await readFile('data/projects/demo-stranger-call.json', 'utf8'));
const resolvePublic = (url) => path.join('public', url.replace(/^\/?public\//, '').replace(/^\//, ''));
const cards = [];
for (const scene of project.scenes) {
  const width = 270;
  const height = 480;
  const background = await sharp(resolvePublic(scene.backgroundUrl)).resize(width, height, {fit: 'cover'}).png().toBuffer();
  const characterWidth = Math.round(width * scene.characterLayout.width / 100);
  const character = await sharp(resolvePublic(scene.characterUrl)).resize({width: characterWidth}).png().toBuffer();
  const characterMeta = await sharp(character).metadata();
  const left = Math.max(0, Math.min(width - characterWidth, Math.round(width * scene.characterLayout.x / 100)));
  const top = Math.max(0, Math.min(height - (characterMeta.height || 1), Math.round(height * scene.characterLayout.y / 100 - (characterMeta.height || 1) / 2)));
  const badge = Buffer.from(`<svg width="270" height="480"><rect x="12" y="12" width="48" height="30" rx="15" fill="#fff8e9"/><text x="36" y="33" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#315a53">${scene.order}</text></svg>`);
  cards.push(await sharp(background).composite([{input: character, left, top}, {input: badge, left: 0, top: 0}]).png().toBuffer());
}
await sharp({create: {width: cards.length * 270 + (cards.length - 1) * 12, height: 480, channels: 4, background: '#f3efe4'}})
  .composite(cards.map((input, index) => ({input, left: index * 282, top: 0})))
  .png()
  .toFile('quality/scenes-contact-sheet.png');
