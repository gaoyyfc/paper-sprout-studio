import {ChevronDown, ChevronRight, Clock3, File, Film, FolderHeart, FolderOpen, Image, Music2, Plus, RefreshCw, Trash2, X} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';
import type {ProjectFile, ProjectSummary, VideoProject} from '../types';

const formatBytes = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const fileUrl = (projectId: string, filePath: string) => `/projects/${encodeURIComponent(projectId)}/${filePath.split('/').map(encodeURIComponent).join('/')}`;

const friendlyFileName = (path: string, index: number) => {
  const file = path.split('/').pop() || path;
  const extension = file.split('.').pop()?.toUpperCase() || '文件';
  if (/background-/i.test(file)) return `分镜背景 ${index + 1} · ${extension}`;
  if (/character-|^ip-/i.test(file)) return `IP 透明形象 ${index + 1} · ${extension}`;
  if (/scene-/i.test(file) && /\.(mp3|wav|m4a)$/i.test(file)) return `分镜配音 ${index + 1} · ${extension}`;
  if (/\.(mp4|webm|mov)$/i.test(file)) return `导出成片 ${index + 1} · ${extension}`;
  return `项目素材 ${index + 1} · ${extension}`;
};

export const ProjectDrawer = ({open, projects, project, files, onClose, onOpen, onCreate, onDelete, onRefreshFiles}: {
  open: boolean; projects: ProjectSummary[]; project: VideoProject; files: ProjectFile[]; onClose: () => void;
  onOpen: (id: string) => void; onCreate: (title: string, theme: string) => Promise<void>; onDelete: (id: string) => void; onRefreshFiles: () => void;
}) => {
  const [title, setTitle] = useState('新的儿歌视频');
  const [theme, setTheme] = useState('认识颜色');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({images: false, audio: false, renders: false, backups: false});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  useEffect(() => {setExpanded({images: false, audio: false, renders: false, backups: false}); setShowAll({});}, [project.id]);

  const fileGroups = useMemo(() => {
    const actualFiles = files.filter((item) => item.kind === 'file');
    const backups = actualFiles.filter((item) => /-raw\./i.test(item.path));
    const usable = actualFiles.filter((item) => !/-raw\./i.test(item.path));
    return [
      {id: 'images', label: '图片素材', description: 'IP 透明图与分镜背景', icon: <Image size={15} />, items: usable.filter((item) => item.path.startsWith('images/'))},
      {id: 'audio', label: '配音素材', description: '逐分镜儿童配音', icon: <Music2 size={15} />, items: usable.filter((item) => item.path.startsWith('audio/'))},
      {id: 'renders', label: '导出成片', description: 'Remotion 渲染视频', icon: <Film size={15} />, items: usable.filter((item) => item.path.startsWith('renders/'))},
      {id: 'backups', label: '原始生成备份', description: '仅用于抠图失败恢复，默认隐藏', icon: <File size={15} />, items: backups},
    ];
  }, [files]);

  if (!open) return null;
  const submit = async () => {setBusy(true); try {await onCreate(title.trim(), theme.trim()); setTitle('新的儿歌视频'); setTheme('认识颜色');} finally {setBusy(false);}};
  const readyScenes = project.scenes.filter((scene) => scene.status === 'ready' && scene.backgroundUrl).length;
  const voiceCount = project.voiceSegments?.length || 0;
  const renderCount = fileGroups.find((group) => group.id === 'renders')?.items.length || 0;

  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="project-drawer project-drawer--organized" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><small>VIDEO PROJECT MANAGER</small><h2>项目管理</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></header>

    <section className="current-project-card">
      <div className="current-project-card__head"><span><FolderHeart size={16} /> 当前视频项目</span><b>自动保存</b></div>
      <h3>{project.title}</h3>
      <div className="current-project-theme"><small>当前创作主题</small><strong>{project.theme || '尚未填写主题'}</strong></div>
      <div className="project-progress-grid"><span><b>{project.characters.length}</b><small>IP 形象</small></span><span><b>{readyScenes}/{project.scenes.length}</b><small>分镜图片</small></span><span><b>{voiceCount}</b><small>配音片段</small></span><span><b>{renderCount}</b><small>成片文件</small></span></div>
      <p><Clock3 size={12} />主题和生成进度会随当前画布实时更新；素材文件在生成完成后自动归类。</p>
    </section>

    <section className="project-section"><div className="project-section__title"><strong>我的视频项目</strong><span>{projects.length} 个独立项目</span></div>
      <div className="project-list">
        {projects.map((item) => <article key={item.id} className={item.id === project.id ? 'is-current' : ''}>
          <button className="project-open" onClick={() => onOpen(item.id)}><FolderOpen size={18} /><span><strong>{item.title}</strong><em>{item.theme || '未设置主题'}</em><small>{item.sceneCount} 个分镜 · {new Date(item.updatedAt).toLocaleString()}</small></span></button>
          <button className="project-delete" onClick={() => onDelete(item.id)} title="删除项目"><Trash2 size={14} /></button>
        </article>)}
      </div>
    </section>

    <section className="file-browser organized-files"><div className="file-browser__head"><div><strong>当前项目素材</strong><small>已隐藏复杂技术路径，按用途整理</small></div><button onClick={onRefreshFiles}><RefreshCw size={12} />刷新</button></div>
      <div className="asset-groups">{fileGroups.map((group) => <article className="asset-group" key={group.id}>
        <button className="asset-group__toggle" onClick={() => setExpanded((value) => ({...value, [group.id]: !value[group.id]}))}>
          <span className="asset-group__icon">{group.icon}</span><span><strong>{group.label}</strong><small>{group.description}</small></span><b>{group.items.length}</b>{expanded[group.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {expanded[group.id] ? <div className="asset-group__items">{group.items.length ? group.items.slice(0, showAll[group.id] ? group.items.length : 8).map((item, index) => <a href={fileUrl(project.id, item.path)} target="_blank" rel="noreferrer" key={item.path} title={item.path}><span><File size={13} /><strong>{friendlyFileName(item.path, index)}</strong></span><small>{formatBytes(item.size)}</small></a>) : <p>暂无{group.label}</p>}{group.items.length > 8 ? <button className="asset-group__more" onClick={() => setShowAll((value) => ({...value, [group.id]: !value[group.id]}))}>{showAll[group.id] ? '收起多余素材' : `再查看 ${group.items.length - 8} 个历史素材`}</button> : null}</div> : null}
      </article>)}</div>
    </section>

    <section className="new-project"><strong><Plus size={15} /> 新建独立视频项目</strong><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="项目名称" /><textarea rows={2} value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="儿歌主题" /><button className="primary-button" onClick={submit} disabled={busy || !title.trim() || !theme.trim()}>{busy ? '创建中…' : '创建新项目'}</button></section>
  </aside></div>;
};
