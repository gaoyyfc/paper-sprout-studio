import {CheckCircle2, Download, Film, Mic2, Music2, PauseCircle, PlayCircle, Sparkles, X} from 'lucide-react';
import {Player} from '@remotion/player';
import {PaperVideo} from '../remotion/PaperVideo';
import {getSceneTimeline, getVideoDurationInFrames, getVideoDurationSeconds} from '../lib/video-timing';
import type {RenderJob, VideoProject} from '../types';

export const PreviewPanel = ({
  project,
  open,
  rendering,
  renderUrl,
  renderJob,
  onClose,
  onRender,
  onPause,
  onContinue,
}: {
  project: VideoProject;
  open: boolean;
  rendering: boolean;
  renderUrl: string;
  renderJob?: RenderJob;
  onClose: () => void;
  onRender: () => void;
  onPause: () => void;
  onContinue: () => void;
}) => {
  if (!open) return null;
  const durationInFrames = getVideoDurationInFrames(project);
  const timeline = getSceneTimeline(project);
  return (
    <aside className="preview-panel">
      <header>
        <div><small>REMOTION LIVE PREVIEW</small><h2>成片预览</h2></div>
        <button className="icon-button" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="player-shell">
        <Player
          component={PaperVideo}
          inputProps={{project}}
          durationInFrames={durationInFrames}
          compositionWidth={project.width}
          compositionHeight={project.height}
          fps={project.fps}
          controls
          loop
          acknowledgeRemotionLicense
          style={{width: '100%', aspectRatio: '9 / 16'}}
        />
      </div>
      <div className="preview-meta">
        <span><Film size={14} /> 1080 × 1920</span><span>{getVideoDurationSeconds(project).toFixed(1)} 秒</span><span><Music2 size={12} /> BGM {Math.round((project.backgroundMusicVolume ?? 0.12) * 100)}%</span><span><Mic2 size={12} /> 配音 {Math.round((project.voiceVolume ?? 1) * 100)}%</span><span><Sparkles size={12} /> 1 秒关键帧衔接</span>
      </div>
      <section className="preview-timeline">
        <div className="preview-timeline__head"><strong>分镜时间轴</strong><span><Mic2 size={12} /> {project.voiceSegments?.length || 0}/{project.scenes.length} 段配音</span></div>
        {timeline.map(({scene, from, to}) => {
          const voice = project.voiceSegments?.find((segment) => segment.sceneId === scene.id);
          return <div className="timeline-row" key={scene.id}><i>{scene.order}</i><span><strong>{scene.title}</strong><small>{(from / project.fps).toFixed(1)}–{(to / project.fps).toFixed(1)}s · {voice?.profileName || '未生成配音'}</small></span>{voice ? <CheckCircle2 size={15} /> : <Mic2 size={15} />}</div>;
        })}
      </section>
      <div className="export-zone"><button className={`render-button ${renderJob?.status === 'paused' ? 'is-paused' : ''}`} onClick={rendering ? onPause : renderJob?.status === 'paused' ? onContinue : onRender}>
          {rendering ? <PauseCircle size={17} /> : renderJob?.status === 'paused' ? <PlayCircle size={17} /> : <Download size={17} />} {rendering ? `暂停 Remotion 渲染 ${Math.round((renderJob?.progress || 0) * 100)}%` : renderJob?.status === 'paused' ? '继续 Remotion 渲染' : '后台渲染并导出 MP4'}
        </button>
        {renderJob ? <div className={`render-progress ${renderJob.status}`}><div><span style={{width: `${Math.round(renderJob.progress * 100)}%`}} /></div><p><b>{renderJob.stage}</b><em>{Math.round(renderJob.progress * 100)}%</em></p>{renderJob.error ? <small>{renderJob.error}</small> : null}</div> : null}
        {renderUrl ? <a className="download-link" href={renderUrl} download>下载刚刚生成的视频</a> : null}
      </div>
    </aside>
  );
};
