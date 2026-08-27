import {Check, Eye, LoaderCircle, PauseCircle, PlayCircle, Plus, ShieldCheck, Sparkles, Trash2, Volume2, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {PaperCharacter} from '../types';

export const CharacterLibrary = ({
  characters,
  selectedId,
  open,
  paused,
  onPause,
  onClose,
  onSelect,
  onGenerate,
  onPreviewVoice,
  onDelete,
}: {
  characters: PaperCharacter[];
  selectedId: string;
  open: boolean;
  paused: boolean;
  onPause: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onGenerate: (name: string, description: string) => Promise<void>;
  onPreviewVoice?: (character: PaperCharacter) => Promise<void>;
  onDelete: (id: string) => void;
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastGeneratedName, setLastGeneratedName] = useState('');
  const [previewCharacter, setPreviewCharacter] = useState<PaperCharacter>();
  const [voiceBusyId, setVoiceBusyId] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const localVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!open) {
      localVoiceAudioRef.current?.pause();
      setPreviewCharacter(undefined);
      setLastGeneratedName('');
    }
  }, [open]);
  useEffect(() => {
    if (!previewCharacter) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewCharacter(undefined);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewCharacter]);
  useEffect(() => () => localVoiceAudioRef.current?.pause(), []);
  if (!open) return null;

  const playVoice = async (character: PaperCharacter) => {
    if (voiceBusyId) return;
    setVoiceBusyId(character.id);
    setVoiceError('');
    try {
      if (character.voicePreviewUrl) {
        localVoiceAudioRef.current?.pause();
        const audio = new Audio(character.voicePreviewUrl);
        localVoiceAudioRef.current = audio;
        await audio.play();
      } else if (typeof onPreviewVoice === 'function') {
        await onPreviewVoice(character);
      } else {
        throw new Error('试听功能正在更新，请刷新页面后再试');
      }
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : '专属声音试听失败');
    } finally {
      setVoiceBusyId('');
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const generatedName = name.trim();
      await onGenerate(generatedName, description.trim());
      setLastGeneratedName(generatedName);
      setName('');
      setDescription('');
    } catch (err) {
      if (!(err instanceof Error && (err.name === 'AbortError' || err.message.includes('已暂停')))) setError(err instanceof Error ? err.message : '形象生成失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="character-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>IP CHARACTER LIBRARY</small><h2>形象库</h2></div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </header>
        <p className="drawer-copy">同一个 IP 会绑定到全部分镜，也可以在单个场景里替换动作与位置。</p>
        <div className="character-grid">
          {characters.map((character) => <article key={character.id} className={`character-card ${selectedId === character.id ? 'is-selected' : ''}`}>
            <button className="character-card__preview" onClick={() => setPreviewCharacter(character)} title={`查看 ${character.name} 大图`}>
              <div className="character-card__image alpha-checker"><img src={character.imageUrl} alt={character.name} /></div>
              <span><Eye size={13} /> 查看大图</span>
            </button>
            <button className="character-card__select" onClick={() => onSelect(character.id)}>
              <strong>{character.name}</strong><span>{character.description}</span>
              <div className="character-badges">
                <b><ShieldCheck size={11} /> {character.alphaReport?.quality === 'fallback' ? 'Alpha 兜底可用' : character.alphaReport?.quality === 'recovered' ? 'Alpha 已修复' : character.alphaReport?.passed === false ? '抠图异常' : 'Alpha 严格通过'}</b>
                <span
                  className="character-voice-badge"
                  role="button"
                  tabIndex={0}
                  title={`${character.voiceDescription || '此 IP 在所有视频中固定使用该音色'} · 点击试听`}
                  onClick={(event) => {event.stopPropagation(); void playVoice(character);}}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      void playVoice(character);
                    }
                  }}
                >
                  {voiceBusyId === character.id ? <LoaderCircle className="is-spinning" size={11} /> : <Volume2 size={11} />}
                  {voiceBusyId === character.id ? '正在准备试听…' : character.voiceProfileName || '点击试听专属声音'}
                </span>
              </div>
              {selectedId === character.id ? <i><Check size={13} /> 当前使用</i> : null}
            </button>
            <button className="character-delete" onClick={() => {if (previewCharacter?.id === character.id) setPreviewCharacter(undefined); onDelete(character.id);}} title="删除形象"><Trash2 size={14} /></button>
          </article>)}
        </div>
        {voiceError ? <div className="inline-error">{voiceError}</div> : null}
        <section className="generator-card">
          <div className="generator-card__title"><Plus size={16} /><strong>自主生成新形象</strong></div>
          {lastGeneratedName ? <div className="generator-success"><Check size={13} />“{lastGeneratedName}”已加入形象库，请填写下一个新形象</div> : null}
          <label>形象名称<input value={name} onChange={(event) => {setName(event.target.value); setLastGeneratedName('');}} placeholder="例如：糖糖兔、星星熊" autoComplete="off" /></label>
          <label>外观描述<textarea value={description} onChange={(event) => {setDescription(event.target.value); setLastGeneratedName('');}} rows={3} placeholder="例如：奶油白小兔，草莓红背带裤，圆脸长耳朵，笑容活泼" /></label>
          <div className="generator-note">后台自动追加：儿童剪纸绘本、完整全身、纯绿背景、白色剪纸边、无文字水印。</div>
          <button className={`primary-button ${paused ? 'is-paused' : ''}`} onClick={busy ? onPause : submit} disabled={!busy && (!name.trim() || !description.trim())}>
            {busy ? <PauseCircle size={16} /> : paused ? <PlayCircle size={16} /> : <Sparkles size={16} />} {busy ? '暂停形象生成' : paused ? '继续生成透明 IP' : '生成透明 IP 形象'}
          </button>
          {error ? <div className="inline-error">{error}</div> : null}
        </section>
      </aside>
      {previewCharacter ? <div className="character-preview-backdrop" onMouseDown={(event) => {event.stopPropagation(); setPreviewCharacter(undefined);}}>
        <section className="character-preview" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${previewCharacter.name} 大图预览`}>
          <header><div><small>IP PREVIEW</small><h2>{previewCharacter.name}</h2></div><button className="icon-button" onClick={() => setPreviewCharacter(undefined)} title="关闭大图"><X size={20} /></button></header>
          <div className="character-preview__stage alpha-checker"><img src={previewCharacter.imageUrl} alt={`${previewCharacter.name} 完整透明形象`} /></div>
          <div className="character-preview__details"><p>{previewCharacter.description}</p><button type="button" className="character-preview__voice" onClick={() => void playVoice(previewCharacter)} disabled={Boolean(voiceBusyId)}>{voiceBusyId === previewCharacter.id ? <LoaderCircle className="is-spinning" size={15} /> : <Volume2 size={15} />}<span><strong>{voiceBusyId === previewCharacter.id ? '正在生成专属试听…' : '点击试听专属声音'}</strong><small>{previewCharacter.voiceProfileName || '已固定分配'}{previewCharacter.voiceDescription ? ` · ${previewCharacter.voiceDescription}` : ''}</small></span></button><div className="character-preview__meta"><span><ShieldCheck size={13} />{previewCharacter.alphaReport?.quality === 'fallback' ? '兜底透明图' : 'Alpha 已校验'}</span>{previewCharacter.alphaReport ? <span>透明 {Math.round(previewCharacter.alphaReport.transparentRatio * 100)}%</span> : null}{previewCharacter.alphaReport ? <span>{previewCharacter.alphaReport.width} × {previewCharacter.alphaReport.height}</span> : null}</div></div>
          <div className="character-preview__actions"><button className="primary-button" onClick={() => {onSelect(previewCharacter.id); setPreviewCharacter(undefined);}} disabled={selectedId === previewCharacter.id}>{selectedId === previewCharacter.id ? <><Check size={15} /> 当前正在使用</> : <><Check size={15} /> 设为当前 IP</>}</button><button className="ghost-button" onClick={() => setPreviewCharacter(undefined)}>返回形象库</button></div>
        </section>
      </div> : null}
    </div>
  );
};
