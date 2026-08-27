import {ArrowDown, ArrowUp, ImagePlus, Trash2, WandSparkles, X} from 'lucide-react';
import type {StoryScene} from '../types';

export const SceneEditor = ({scene, open, onClose, onChange, onGenerate, onDelete, onMove}: {
  scene?: StoryScene; open: boolean; onClose: () => void; onChange: (patch: Partial<StoryScene>) => void; onGenerate: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void;
}) => {
  if (!open || !scene) return null;
  const updateText = (key: keyof StoryScene, value: string) => onChange({[key]: value, status: 'draft'} as Partial<StoryScene>);
  return <aside className="scene-editor">
    <header><div><small>EDITABLE STORYBOARD</small><h2>分镜 {scene.order} · {scene.title}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header>
    <div className="scene-editor__preview alpha-checker">
      {scene.backgroundUrl ? <img className="editor-bg" src={scene.backgroundUrl} alt="分镜背景" /> : <div className="editor-empty"><ImagePlus size={25} /><span>尚未生成真实图片</span></div>}
      {scene.characterUrl ? <img className="editor-character" src={scene.characterUrl} alt="透明角色" style={{left: `${scene.characterLayout.x}%`, top: `${scene.characterLayout.y}%`, width: `${scene.characterLayout.width}%`, opacity: scene.characterLayout.opacity}} /> : null}
    </div>
    <div className="editor-order"><button onClick={() => onMove(-1)}><ArrowUp size={14} /> 前移</button><button onClick={() => onMove(1)}><ArrowDown size={14} /> 后移</button><button className="danger" onClick={onDelete}><Trash2 size={14} /> 删除本镜</button></div>
    <label>分镜标题<input value={scene.title} onChange={(event) => updateText('title', event.target.value)} /></label>
    <label>字幕<input value={scene.subtitle} onChange={(event) => updateText('subtitle', event.target.value)} /></label>
    <label>配音文案<textarea rows={2} value={scene.narration} onChange={(event) => updateText('narration', event.target.value)} /></label>
    <label>背景提示词<textarea rows={4} value={scene.backgroundPrompt} onChange={(event) => updateText('backgroundPrompt', event.target.value)} placeholder="只描述无人物的场景背景" /></label>
    <label>IP 动作备注（不会重新生成角色）<textarea rows={3} value={scene.actionPrompt} onChange={(event) => updateText('actionPrompt', event.target.value)} placeholder="记录希望表达的动作；视频始终使用形象库中已选 IP" /></label>
    <div className="editor-inline"><label>时长（秒）<input type="number" min="2" max="20" step="0.5" value={scene.duration} onChange={(event) => onChange({duration: Number(event.target.value)})} /></label><label className="check-label"><input type="checkbox" checked={scene.useCharacter} onChange={(event) => onChange({useCharacter: event.target.checked, status: 'draft'})} /> 使用 IP 角色</label></div>
    <section className="layer-controls"><strong>角色透明图层排版</strong>
      <label>水平位置 <b>{scene.characterLayout.x}%</b><input type="range" min="0" max="75" value={scene.characterLayout.x} onChange={(event) => onChange({characterLayout: {...scene.characterLayout, x: Number(event.target.value)}})} /></label>
      <label>垂直位置 <b>{scene.characterLayout.y}%</b><input type="range" min="18" max="76" value={scene.characterLayout.y} onChange={(event) => onChange({characterLayout: {...scene.characterLayout, y: Number(event.target.value)}})} /></label>
      <label>角色尺寸 <b>{scene.characterLayout.width}%</b><input type="range" min="18" max="70" value={scene.characterLayout.width} onChange={(event) => onChange({characterLayout: {...scene.characterLayout, width: Number(event.target.value)}})} /></label>
      <label>图层不透明度 <b>{Math.round(scene.characterLayout.opacity * 100)}%</b><input type="range" min="30" max="100" value={scene.characterLayout.opacity * 100} onChange={(event) => onChange({characterLayout: {...scene.characterLayout, opacity: Number(event.target.value) / 100}})} /></label>
    </section>
    <button className="render-button" onClick={onGenerate} disabled={scene.status === 'generating'}><WandSparkles size={16} /> {scene.status === 'generating' ? '正在生成分镜背景…' : scene.status === 'ready' ? '重新生成背景（保留已选 IP）' : '生成背景并使用已选 IP'}</button>
    {scene.error ? <div className="inline-error">{scene.error}</div> : null}
  </aside>;
};
