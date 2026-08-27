import {Handle, Position, type NodeProps} from '@xyflow/react';
import {AudioLines, BookOpenText, Check, Film, ImagePlus, Layers3, LockKeyhole, Music2, PauseCircle, Pencil, PlayCircle, Sparkles, Trash2, Volume2, WandSparkles} from 'lucide-react';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {AiModelOption, StoryScene} from '../types';

const ModelSelect = ({label, value, options, onChange, disabled = false, compact = false}: {
  label: string; value: string; options: AiModelOption[]; onChange: (value: string) => void; disabled?: boolean; compact?: boolean;
}) => {
  const selected = options.find((option) => option.id === value);
  return <label className={`model-picker ${compact ? 'model-picker--compact' : ''}`}>
    <span>{label}<b>{selected?.configured ? '当前配置' : `${options.length} 个可用`}</b></span>
    <select className="nodrag nowheel" value={value} disabled={disabled || options.length === 0} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onChange(event.target.value)}>
      {options.length ? options.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.priceLabel}</option>) : <option value={value}>正在读取模型…</option>}
    </select>
    {selected ? <small>{selected.priceLabel}</small> : null}
  </label>;
};

const NodeCard = ({children, title, eyebrow, icon, accent = '#4f8177', input = true, output = true, className = '', locked = false, lockReason = ''}: {
  children: ReactNode; title: string; eyebrow: string; icon: ReactNode; accent?: string; input?: boolean; output?: boolean; className?: string; locked?: boolean; lockReason?: string;
}) => (
  <div className={`flow-node ${className} ${locked ? 'is-locked' : ''}`} style={{'--node-accent': accent} as React.CSSProperties}>
    {input ? <Handle type="target" position={Position.Left} /> : null}
    <div className="flow-node__head"><span className="flow-node__icon">{icon}</span><span><small>{eyebrow}</small><strong>{title}</strong></span></div>
    {locked ? <div className="node-lock"><LockKeyhole size={11} /><span>{lockReason || '请先完成上一步'}</span></div> : null}
    {children}
    {output ? <Handle type="source" position={Position.Right} /> : null}
  </div>
);

export const ThemeNode = ({data}: NodeProps) => {
  const d = data as {theme: string; sceneCount: number; onTheme: (value: string) => void; onSceneCount: (value: number) => void; onGenerate: () => void; onPause: () => void; onContinue: () => void; busy: boolean; paused: boolean; stage?: string; generated: boolean; pendingScenes: number; connected: boolean};
  const [draft, setDraft] = useState(d.theme);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current) setDraft(d.theme);
  }, [d.theme]);
  return <NodeCard title="创作输入" eyebrow="START · 01" icon={<Sparkles size={17} />} input={false} accent="#f07555">
    <label className="node-label">儿歌早教主题</label>
    <textarea
      className="node-input nodrag nowheel nopan"
      value={draft}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onCompositionStart={() => {composing.current = true;}}
      onCompositionEnd={(event) => {
        composing.current = false;
        const value = event.currentTarget.value;
        setDraft(value);
        d.onTheme(value);
      }}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        if (!composing.current) d.onTheme(value);
      }}
      rows={3}
      placeholder="例如：认识颜色、爱护花草"
    />
    <div className="scene-count-row"><span>分镜数量</span><div><button className="nodrag" onClick={() => d.onSceneCount(Math.max(1, d.sceneCount - 1))}>−</button><b>{d.sceneCount}</b><button className="nodrag" onClick={() => d.onSceneCount(Math.min(12, d.sceneCount + 1))}>＋</button></div></div>
    {d.stage ? <div className={`auto-stage ${d.busy ? 'is-running' : ''}`}>{d.stage}</div> : null}
    <button className={`node-button nodrag ${d.paused ? 'is-paused' : ''}`} onClick={d.busy ? d.onPause : d.paused ? d.onContinue : d.onGenerate} disabled={!d.connected && !d.busy && !d.paused}>{d.busy ? <PauseCircle size={15} /> : d.paused ? <PlayCircle size={15} /> : <WandSparkles size={15} />} {d.busy ? '暂停完整生成' : d.paused ? '继续完整生成' : d.generated && d.pendingScenes > 0 ? `继续生成剩余 ${d.pendingScenes} 个分镜` : d.generated ? '一键重新生成完整视频' : '一键生成完整视频'}</button>
  </NodeCard>;
};

export const CharacterNode = ({data}: NodeProps) => {
  const d = data as {name: string; imageUrl: string; onManage: () => void; onPause: () => void; onContinue: () => void; busy: boolean; paused: boolean; locked?: boolean; lockReason?: string; model: string; modelOptions: AiModelOption[]; onModel: (value: string) => void};
  return <NodeCard title="绑定 IP 形象" eyebrow="CHARACTER · 02" icon={<WandSparkles size={17} />} accent="#cc9b3d" locked={d.locked} lockReason={d.lockReason}>
    <div className="character-node__body"><div className="alpha-checker">{d.imageUrl ? <img src={d.imageUrl} alt="当前 IP" /> : <span>未选择</span>}</div><span><strong>{d.name || '未选择'}</strong><small>透明图层 · 可全局替换</small></span></div>
    <ModelSelect label="IP 生图模型" value={d.model} options={d.modelOptions} onChange={d.onModel} disabled={d.locked} compact />
    <button className={`node-secondary nodrag ${d.paused ? 'is-paused' : ''}`} onClick={d.busy ? d.onPause : d.paused ? d.onContinue : d.onManage} disabled={d.locked}>{d.busy ? <><PauseCircle size={14} /> 暂停 IP 生成</> : d.paused ? <><PlayCircle size={14} /> 继续 IP 生成</> : '选择 / 管理形象'}</button>
  </NodeCard>;
};

export const StoryNode = ({data}: NodeProps) => {
  const d = data as {lyrics: string; qualityWarnings: string[]; hasQualitySuggestion: boolean; onUseQualitySuggestion: () => void; onAcceptQuality: () => void; onLyrics: (value: string) => void; onRegenerate: () => void; onPause: () => void; onContinue: () => void; busy: boolean; paused: boolean; model?: string; connected: boolean; locked?: boolean; lockReason?: string; modelOptions: AiModelOption[]; onModel: (value: string) => void};
  return <NodeCard title="儿童儿歌文案" eyebrow="SCRIPT · 03" icon={<BookOpenText size={17} />} accent="#866ca5" locked={d.locked} lockReason={d.lockReason}>
    <div className={`model-state ${d.connected ? 'is-ready' : ''}`}><span />{d.connected ? `活泼儿歌模式 · ${d.model || 'Ark'}` : '大模型未连接'}</div>
    <ModelSelect label="文案模型" value={d.model || ''} options={d.modelOptions} onChange={d.onModel} disabled={d.locked || d.busy} />
    <textarea className="node-input node-input--lyrics nodrag nowheel" value={d.lyrics} disabled={d.locked} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => d.onLyrics(event.target.value)} rows={5} placeholder="点击生成，或在这里输入自己的歌词" />
    {d.qualityWarnings.length ? <div className="copy-quality-review"><strong>文案已生成 · 请决定是否使用</strong><small>{d.qualityWarnings[0]}{d.qualityWarnings.length > 1 ? `，另有 ${d.qualityWarnings.length - 1} 项提醒` : ''}</small><div>{d.hasQualitySuggestion ? <button className="nodrag" onClick={d.onUseQualitySuggestion}><WandSparkles size={12} /> 使用质量优化版</button> : null}<button className="nodrag" onClick={d.onAcceptQuality}><Check size={12} /> 保留此版</button></div></div> : null}
    <button className={`node-secondary nodrag ${d.paused ? 'is-paused' : ''}`} onClick={d.busy ? d.onPause : d.paused ? d.onContinue : d.onRegenerate} disabled={(!d.connected && !d.busy && !d.paused) || d.locked}>{d.busy ? <PauseCircle size={14} /> : d.paused ? <PlayCircle size={14} /> : <WandSparkles size={14} />} {d.busy ? '暂停文案生成' : d.paused ? '继续文案生成' : 'AI 重写文案（保留排版）'}</button>
  </NodeCard>;
};

export const SceneNode = ({data, selected}: NodeProps) => {
  const d = data as {scene: StoryScene; onOpen: () => void; onGenerate: () => void; onPause: () => void; onContinue: () => void; paused: boolean; onDelete: () => void; locked?: boolean; lockReason?: string; model: string; modelOptions: AiModelOption[]; onModel: (value: string) => void};
  const {scene} = d;
  return <NodeCard title={scene.title || `分镜 ${scene.order}`} eyebrow={`SCENE · ${String(scene.order).padStart(2, '0')}`} icon={<ImagePlus size={17} />} accent={scene.status === 'ready' ? '#3c8b70' : scene.status === 'error' ? '#c64c46' : '#4f8177'} className={`scene-node scene-node--compact ${selected ? 'is-selected' : ''}`} locked={d.locked} lockReason={d.lockReason}>
    <button className="scene-thumb nodrag" onClick={d.onOpen} disabled={d.locked}>
      {scene.backgroundUrl ? <img src={scene.backgroundUrl} alt={scene.title} /> : <div className="scene-empty"><ImagePlus size={20} /><span>等待生成图片</span></div>}
      {scene.characterUrl ? <img className="scene-thumb__character" src={scene.characterUrl} alt="透明角色动作" /> : null}
      <span>{scene.duration}s</span>
    </button>
    <div className="scene-card-meta"><span className={`scene-status ${scene.status}`}>{scene.status === 'ready' ? '素材完成' : scene.status === 'generating' ? '生成中' : scene.status === 'error' ? '需要重试' : '待生成'}</span><span>{scene.duration}s · {scene.useCharacter ? '已选IP直用' : '纯背景'}</span></div>
    <ModelSelect label="图片模型" value={d.model} options={d.modelOptions} onChange={d.onModel} disabled={d.locked || scene.status === 'generating'} compact />
    <div className="scene-node__actions">
      <button className="nodrag" onClick={d.onOpen} disabled={d.locked}><Pencil size={13} /> 编辑</button>
      <button className={`nodrag ${d.paused ? 'is-paused' : ''}`} onClick={scene.status === 'generating' ? d.onPause : d.paused ? d.onContinue : d.onGenerate} disabled={d.locked}>{scene.status === 'generating' ? <PauseCircle size={13} /> : d.paused ? <PlayCircle size={13} /> : <WandSparkles size={13} />} {scene.status === 'generating' ? '暂停' : d.paused ? '继续' : scene.status === 'ready' ? '重生成' : '生图'}</button>
      <button className="nodrag danger" onClick={d.onDelete} title="删除分镜"><Trash2 size={13} /></button>
    </div>
    {scene.error ? <div className="node-error">{scene.error}</div> : null}
  </NodeCard>;
};

export const ComposeNode = ({data}: NodeProps) => {
  const d = data as {ready: number; total: number; onOpen: () => void; locked?: boolean; lockReason?: string};
  return <NodeCard title="分镜组合" eyebrow="COMPOSE" icon={<Layers3 size={17} />} accent="#d37a48" locked={d.locked} lockReason={d.lockReason}>
    <div className="compose-meter"><span style={{width: `${d.total ? d.ready / d.total * 100 : 0}%`}} /></div>
    <strong className="compose-count">{d.ready}/{d.total} 个分镜有图片</strong>
    <button className="node-secondary nodrag" onClick={d.onOpen} disabled={d.locked}>打开成片预览</button>
  </NodeCard>;
};

export const VoiceNode = ({data}: NodeProps) => {
  const d = data as {audioReady: boolean; voiceCount: number; busy: boolean; paused: boolean; onGenerate: () => void; onPause: () => void; onContinue: () => void; voiceName?: string; selectionReason?: string; backgroundMusicVolume: number; voiceVolume: number; onBackgroundMusicVolume: (value: number) => void; onVoiceVolume: (value: number) => void; locked?: boolean; lockReason?: string; model: string; modelOptions: AiModelOption[]; onModel: (value: string) => void};
  return <NodeCard title="智能统一配音" eyebrow="SEED-TTS 2.0 · 0.9X" icon={<AudioLines size={17} />} accent="#866ca5" className="voice-node" locked={d.locked} lockReason={d.lockReason}>
    <div className="voice-state"><span className={d.audioReady ? 'is-ready' : ''}>时间轴</span><strong>{d.audioReady ? `${d.voiceCount || 1} 段已对齐` : '等待逐镜生成'}</strong></div>
    <ModelSelect label="语音模型" value={d.model} options={d.modelOptions} onChange={d.onModel} disabled={d.busy} />
    <div className="voice-choice"><Sparkles size={12} /><span><small>本片统一音色</small><strong>{d.voiceName || '生成时智能匹配文案'}</strong></span></div>
    <div className="node-hint">{d.selectionReason || '系统会阅读整篇文案后选择一次音色，并用于本视频全部分镜。'}</div>
    <label className="volume-control"><span><Music2 size={12} />背景音乐<b>{Math.round(d.backgroundMusicVolume * 100)}%</b></span><input className="nodrag nowheel" type="range" min="0" max="0.35" step="0.01" value={d.backgroundMusicVolume} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => d.onBackgroundMusicVolume(Number(event.target.value))} /></label>
    <label className="volume-control"><span><Volume2 size={12} />配音声音<b>{Math.round(d.voiceVolume * 100)}%</b></span><input className="nodrag nowheel" type="range" min="0" max="1" step="0.02" value={d.voiceVolume} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => d.onVoiceVolume(Number(event.target.value))} /></label>
    <button className={`node-button nodrag ${d.paused ? 'is-paused' : ''}`} onClick={d.busy ? d.onPause : d.paused ? d.onContinue : d.onGenerate} disabled={d.locked}>{d.busy ? <PauseCircle size={15} /> : d.paused ? <PlayCircle size={15} /> : <AudioLines size={15} />} {d.busy ? '暂停配音生成' : d.paused ? '继续配音生成' : d.audioReady ? '重新智能匹配并配音' : '智能匹配并生成配音'}</button>
  </NodeCard>;
};

export const OutputNode = ({data}: NodeProps) => {
  const d = data as {onPreview: () => void; onRender: () => void; onPause: () => void; onContinue: () => void; rendering: boolean; paused: boolean; progress: number; locked?: boolean; lockReason?: string};
  return <NodeCard title="预览与导出" eyebrow="REMOTION MP4" icon={<Film size={17} />} output={false} accent="#315a53" locked={d.locked} lockReason={d.lockReason}>
    <div className="output-specs"><span>9:16</span><span>约30s</span><span>30fps</span><span>原创BGM</span><span>关键帧转场</span></div>
    <button className="node-button nodrag" onClick={d.onPreview} disabled={d.locked}><Film size={15} /> 打开视频预览</button>
    <button className={`node-secondary nodrag ${d.paused ? 'is-paused' : ''}`} onClick={d.rendering ? d.onPause : d.paused ? d.onContinue : d.onRender} disabled={d.locked}>{d.rendering ? <><PauseCircle size={14} /> 暂停渲染 {Math.round(d.progress * 100)}%</> : d.paused ? <><PlayCircle size={14} /> 继续渲染</> : '后台渲染 MP4'}</button>
  </NodeCard>;
};
