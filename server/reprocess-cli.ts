import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {removeGreenScreen} from './image-service.js';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('用法：tsx server/reprocess-cli.ts <raw.png> <output.png>');
await removeGreenScreen(await readFile(path.resolve(input)), path.resolve(output));
console.log(path.resolve(output));
