import type {VideoProject} from '../types';

export const DEFAULT_TRANSITION_SECONDS = 1;

export const getTransitionFrames = (project: VideoProject) => {
  if (project.scenes.length < 2) return 0;
  const requested = Math.round((project.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS) * project.fps);
  const shortestScene = Math.min(...project.scenes.map((scene) => Math.round(scene.duration * project.fps)));
  return Math.max(0, Math.min(requested, shortestScene - 1));
};

export const getSceneTimeline = (project: VideoProject) => {
  const transitionFrames = getTransitionFrames(project);
  let cursor = 0;
  return project.scenes.map((scene, index) => {
    const durationInFrames = Math.max(1, Math.round(scene.duration * project.fps));
    const from = index === 0 ? 0 : Math.max(0, cursor - transitionFrames);
    const to = from + durationInFrames;
    cursor = to;
    return {scene, from, to, durationInFrames};
  });
};

export const getVideoDurationInFrames = (project: VideoProject) => {
  const timeline = getSceneTimeline(project);
  return Math.max(1, timeline.at(-1)?.to ?? 1);
};

export const getVideoDurationSeconds = (project: VideoProject) =>
  getVideoDurationInFrames(project) / project.fps;
