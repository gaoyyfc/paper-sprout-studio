import type {CSSProperties} from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {getSceneTimeline, getTransitionFrames, getVideoDurationInFrames} from '../lib/video-timing';
import type {StoryScene, VideoProject} from '../types';

const paperShadow = '0 18px 28px rgba(62, 55, 42, 0.22), 0 0 0 7px rgba(255,255,255,0.9)';
const resolveAsset = (src: string) => {
  const normalized = src.replace(/^\/?public\//, '/').replace(/^public\//, '/');
  if (/^\/(projects|generated|renders)\//.test(normalized)) {
    return `http://127.0.0.1:8787${normalized}`;
  }
  return normalized.startsWith('/') ? staticFile(normalized.slice(1)) : normalized;
};

const transitionMask = (progress: number, sceneIndex: number) => {
  if (sceneIndex === 0) return 'none';
  if (sceneIndex % 3 === 1) return `inset(0 ${(1 - progress) * 100}% 0 0 round 34px)`;
  if (sceneIndex % 3 === 2) return `circle(${progress * 78}% at 50% 50%)`;
  return `inset(${(1 - progress) * 50}% 0 ${(1 - progress) * 50}% 0 round 34px)`;
};

const SceneLayer = ({scene, project, sceneIndex, sceneCount}: {
  scene: StoryScene;
  project: VideoProject;
  sceneIndex: number;
  sceneCount: number;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const durationInFrames = Math.max(1, Math.round(scene.duration * fps));
  const transitionFrames = getTransitionFrames(project);
  const selectedCharacter = project.characters.find((item) => item.id === project.selectedCharacterId);
  const characterSrc = selectedCharacter?.imageUrl || scene.characterUrl;

  const incoming = sceneIndex === 0 || transitionFrames === 0
    ? 1
    : interpolate(frame, [0, transitionFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const outgoing = sceneIndex === sceneCount - 1 || transitionFrames === 0
    ? 1
    : interpolate(frame, [durationInFrames - transitionFrames, durationInFrames], [1, 0.5], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const enter = spring({frame: frame - 4, fps, config: {damping: 13, stiffness: 105, mass: 0.78}});
  const subtitleEnter = spring({frame: frame - 10, fps, config: {damping: 16, stiffness: 125}});
  const titleEnter = spring({frame: frame - 2, fps, config: {damping: 14, stiffness: 115}});

  const direction = scene.characterLayout.entrance;
  const travelX = direction === 'left' ? -280 : direction === 'right' ? 280 : 0;
  const travelY = direction === 'bottom' ? 310 : 0;
  const progress = frame / Math.max(1, durationInFrames - 1);
  const backgroundScale = interpolate(progress, [0, 0.36, 0.72, 1], [1.035, 1.075, 1.052, 1.085]);
  const panDirection = sceneIndex % 2 === 0 ? 1 : -1;
  const backgroundX = interpolate(progress, [0, 0.5, 1], [-10 * panDirection, 8 * panDirection, -4 * panDirection]);
  const backgroundY = interpolate(progress, [0, 0.55, 1], [5, -8, 3]);
  const emphasis = interpolate(
    frame,
    [durationInFrames * 0.34, durationInFrames * 0.43, durationInFrames * 0.52],
    [1, 1.075, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const float = Math.sin(frame / 10 + sceneIndex) * 6;
  const sway = Math.sin(frame / 14 + sceneIndex * 0.8) * (sceneIndex % 2 === 0 ? 1.7 : -1.7);
  const exit = transitionFrames === 0
    ? 0
    : interpolate(frame, [durationInFrames - transitionFrames, durationInFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const sceneShift = sceneIndex % 3 === 1 ? (1 - incoming) * 75 : sceneIndex % 3 === 2 ? (1 - incoming) * 42 : 0;

  const characterStyle: CSSProperties = {
    position: 'absolute',
    left: `${scene.characterLayout.x}%`,
    top: `${scene.characterLayout.y}%`,
    width: `${scene.characterLayout.width}%`,
    opacity: scene.characterLayout.opacity * incoming,
    transform: `translate(${travelX * (1 - enter) + exit * 28 * panDirection}px, ${travelY * (1 - enter) + float - exit * 18}px) rotate(${sway}deg) scale(${(0.91 + enter * 0.09) * emphasis * (1 - exit * 0.035)})`,
    transformOrigin: 'bottom center',
    filter: `drop-shadow(${paperShadow})`,
  };

  return (
    <AbsoluteFill style={{
      backgroundColor: '#f4e7c8',
      overflow: 'hidden',
      opacity: incoming * outgoing,
      clipPath: transitionMask(incoming, sceneIndex),
      transform: `translateX(${sceneShift}px) scale(${0.985 + incoming * 0.015})`,
    }}>
      {scene.backgroundUrl ? <Img
        src={resolveAsset(scene.backgroundUrl)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translate(${backgroundX}px, ${backgroundY}px) scale(${backgroundScale})`,
        }}
      /> : <AbsoluteFill style={{
        background: 'radial-gradient(circle at 25% 20%, rgba(255,255,255,.75), transparent 22%), linear-gradient(155deg,#f8dfab,#c8e2cf 62%,#8dbdaf)',
      }} />}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(255,255,255,.08) 55%, rgba(35,32,29,.20) 100%)'}} />

      {[0, 1, 2].map((item) => {
        const sparkleProgress = (frame / fps * 0.24 + item * 0.31 + sceneIndex * 0.17) % 1;
        return <div key={item} style={{
          position: 'absolute',
          left: `${12 + item * 37}%`,
          top: `${20 + (item % 2) * 18}%`,
          width: 20 + item * 8,
          height: 20 + item * 8,
          borderRadius: item === 1 ? '35% 65% 35% 65%' : '50%',
          background: item === 0 ? '#fff2a8' : item === 1 ? '#ffb9a7' : '#dff6d6',
          boxShadow: '0 3px 0 rgba(75,73,54,.12)',
          opacity: 0.24 + Math.sin(sparkleProgress * Math.PI) * 0.38,
          transform: `translateY(${-sparkleProgress * 34}px) rotate(${sparkleProgress * 80}deg) scale(${0.75 + sparkleProgress * 0.4})`,
        }} />;
      })}

      {scene.useCharacter && characterSrc ? <Img src={resolveAsset(characterSrc)} style={characterStyle} /> : null}
      <div style={{
        position: 'absolute',
        left: 74,
        right: 74,
        bottom: 144,
        padding: '30px 36px 34px',
        borderRadius: 34,
        color: '#fffdf7',
        fontFamily: 'Microsoft YaHei, Noto Sans SC, sans-serif',
        fontWeight: 800,
        fontSize: 54,
        lineHeight: 1.35,
        textAlign: 'center',
        letterSpacing: 1,
        background: 'rgba(35, 62, 57, 0.88)',
        boxShadow: `0 ${12 + emphasis * 3}px ${28 + emphasis * 5}px rgba(25,32,29,.24), inset 0 0 0 3px rgba(255,255,255,.18)`,
        transform: `translateY(${interpolate(subtitleEnter, [0, 1], [46, 0]) + exit * 26}px) scale(${0.97 + subtitleEnter * 0.03 + (emphasis - 1) * 0.22})`,
        opacity: subtitleEnter * (1 - exit * 0.5),
      }}>
        {scene.subtitle}
      </div>
      <div style={{
        position: 'absolute',
        top: 72,
        left: 72,
        padding: '14px 24px',
        borderRadius: 999,
        background: '#fff9e9',
        color: '#315a53',
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontWeight: 800,
        fontSize: 30,
        boxShadow: '0 8px 20px rgba(70,57,36,.16)',
        transform: `translateX(${interpolate(titleEnter, [0, 1], [-52, 0])}px) scale(${0.9 + titleEnter * 0.1})`,
        opacity: titleEnter * (1 - exit * 0.65),
      }}>
        {scene.title}
      </div>
    </AbsoluteFill>
  );
};

export const PaperVideo = ({project}: {project: VideoProject}) => {
  const timeline = getSceneTimeline(project);
  const totalFrames = getVideoDurationInFrames(project);
  const musicVolume = project.backgroundMusicVolume ?? 0.12;
  const voiceVolume = project.voiceVolume ?? 1;
  const musicUrl = project.backgroundMusicUrl || '/audio/paper-sprout-playful.wav';

  return (
    <AbsoluteFill style={{backgroundColor: '#f7f3e8'}}>
      <Audio
        src={resolveAsset(musicUrl)}
        volume={(frame) => {
          const fadeIn = interpolate(frame, [0, project.fps * 0.7], [0, 1], {extrapolateRight: 'clamp'});
          const fadeOut = interpolate(frame, [totalFrames - project.fps, totalFrames], [1, 0], {extrapolateLeft: 'clamp'});
          return musicVolume * fadeIn * fadeOut;
        }}
      />
      {project.audioUrl && !project.voiceSegments?.length ? <Audio src={resolveAsset(project.audioUrl)} volume={voiceVolume} /> : null}
      {timeline.map(({scene, from, durationInFrames}, sceneIndex) => {
        const voice = project.voiceSegments?.find((segment) => segment.sceneId === scene.id);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} premountFor={project.fps}>
            <SceneLayer scene={scene} project={project} sceneIndex={sceneIndex} sceneCount={project.scenes.length} />
            {voice?.audioUrl ? <Audio src={resolveAsset(voice.audioUrl)} volume={voiceVolume} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
