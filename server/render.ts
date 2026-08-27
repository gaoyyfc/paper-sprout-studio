import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition, type CancelSignal} from '@remotion/renderer';
import type {VideoProject} from '../src/types.js';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(serverDir, '..');
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE
  || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const browserOptions = browserExecutable ? {browserExecutable} : {};
let bundlePromise: Promise<string> | null = null;

const getBundle = () => {
  bundlePromise ??= bundle({
    entryPoint: path.join(appDir, 'src', 'remotion', 'index.ts'),
    publicDir: path.join(appDir, 'public'),
    webpackOverride: (config) => config,
  });
  return bundlePromise;
};

export const renderProjectVideo = async (
  project: VideoProject,
  outputLocation: string,
  onProgress?: (progress: number, stage: string) => void,
  cancelSignal?: CancelSignal,
) => {
  onProgress?.(0.04, '正在打包 Remotion 工程');
  const serveUrl = await getBundle();
  onProgress?.(0.12, '正在读取视频配置');
  const inputProps = {project};
  const composition = await selectComposition({serveUrl, id: 'PaperSproutVideo', inputProps, ...browserOptions});
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation,
    inputProps,
    imageFormat: 'jpeg',
    jpegQuality: 90,
    ...browserOptions,
    cancelSignal,
    onProgress: ({progress}) => onProgress?.(0.14 + progress * 0.84, `正在渲染画面 ${Math.round(progress * 100)}%`),
  });
  onProgress?.(1, 'MP4 已完成');
};
