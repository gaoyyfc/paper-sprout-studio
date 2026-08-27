import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {VideoProject} from '../src/types.js';
import {renderProjectVideo} from './render.js';

const projectPath = process.argv[2] || path.resolve('data/projects/demo-stranger-call.json');
const outputPath = process.argv[3] || path.resolve('public/renders/demo-stranger-call.mp4');
const project = JSON.parse(await readFile(projectPath, 'utf8')) as VideoProject;
await renderProjectVideo(project, outputPath);
console.log(outputPath);
