import {Composition} from 'remotion';
import {createInitialProject} from '../data/sample';
import {getVideoDurationInFrames} from '../lib/video-timing';
import type {VideoProject} from '../types';
import {PaperVideo} from './PaperVideo';

export const RemotionRoot = () => {
  const fallback = createInitialProject();
  return (
    <Composition
      id="PaperSproutVideo"
      component={PaperVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={{project: fallback}}
      calculateMetadata={({props}) => {
        const project = props.project as VideoProject;
        return {
          width: project.width,
          height: project.height,
          fps: project.fps,
          durationInFrames: getVideoDurationInFrames(project),
        };
      }}
    />
  );
};
