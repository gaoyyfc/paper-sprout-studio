import {
  Apple,
  BookOpenCheck,
  Brain,
  Calculator,
  DoorClosed,
  HeartHandshake,
  Hand,
  Palette,
  Shapes,
  Sparkles,
  TrafficCone,
  X,
} from 'lucide-react';

const THEME_TEMPLATES = [
  {title: '红绿灯安全歌', theme: '过马路要看红绿灯，走斑马线', description: '认识红灯停、绿灯行和安全过街', tag: '安全启蒙', color: '#e76f51', icon: TrafficCone},
  {title: '刷牙亮晶晶', theme: '早晚认真刷牙，保护小牙齿', description: '学习刷牙顺序和早晚清洁习惯', tag: '生活习惯', color: '#4d96a8', icon: Sparkles},
  {title: '洗手泡泡操', theme: '饭前便后认真洗手，把小手洗干净', description: '用泡泡动作记住正确洗手方法', tag: '卫生健康', color: '#5b9bd5', icon: Hand},
  {title: '陌生人不开门', theme: '独自在家时，陌生人敲门不能开', description: '学会停一下、不开门并告诉家长', tag: '安全启蒙', color: '#cf6b7c', icon: DoorClosed},
  {title: '玩具回家啦', theme: '玩完玩具要分类整理，送玩具回家', description: '培养收纳意识和自己的事情自己做', tag: '生活习惯', color: '#d8993f', icon: Shapes},
  {title: '彩虹颜色歌', theme: '认识红橙黄绿蓝紫六种颜色', description: '从生活物品中轻松辨认常见颜色', tag: '认知启蒙', color: '#8d68b8', icon: Palette},
  {title: '数字蹦蹦跳', theme: '跟着动作认识数字一到十', description: '边数边跳，建立数字和数量的联系', tag: '数学启蒙', color: '#4b9b78', icon: Calculator},
  {title: '蔬果能量站', theme: '爱吃水果和蔬菜，身体长得棒', description: '认识健康食物和均衡饮食', tag: '健康饮食', color: '#75a94c', icon: Apple},
  {title: '生气呼呼操', theme: '生气时先停下来，慢慢深呼吸', description: '认识情绪并学习温和表达', tag: '情绪成长', color: '#e28363', icon: Brain},
  {title: '礼貌魔法词', theme: '学会说你好、请、谢谢和对不起', description: '在有趣互动中练习礼貌表达', tag: '社交启蒙', color: '#4f8177', icon: HeartHandshake},
] as const;

export const ThemeTemplatePanel = ({
  open,
  currentTheme,
  busy,
  connected,
  onClose,
  onSelect,
}: {
  open: boolean;
  currentTheme: string;
  busy: boolean;
  connected: boolean;
  onClose: () => void;
  onSelect: (theme: string) => void;
}) => {
  if (!open) return null;
  return (
    <aside className="theme-template-panel" aria-label="创作输入模板">
      <header>
        <div><small>CREATIVE STARTERS</small><h2>创作输入模板</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭创作输入模板"><X size={18} /></button>
      </header>
      <p className="template-intro"><BookOpenCheck size={16} /> 选择主题只会填入创作输入；需要你点击画布中的“一键生成完整视频”才会启动流程。</p>
      <div className="template-current"><span>当前创作输入</span><strong>{currentTheme || '尚未填写主题'}</strong></div>
      <div className="theme-template-list">
        {THEME_TEMPLATES.map((template, index) => {
          const Icon = template.icon;
          return (
            <button
              key={template.title}
              className={currentTheme === template.theme ? 'is-current' : ''}
              disabled={busy}
              onClick={() => onSelect(template.theme)}
            >
              <i style={{'--template-color': template.color} as React.CSSProperties}><Icon size={18} /></i>
              <span><small>{String(index + 1).padStart(2, '0')} · {template.tag}</small><strong>{template.title}</strong><em>{template.description}</em></span>
              <b>填入画布</b>
            </button>
          );
        })}
      </div>
      <footer>{busy ? '自动创作正在运行，请稍候…' : connected ? '选择主题后不会自动生成，请回到画布手动启动' : '可先选择主题，AI 服务连接后再手动启动'}</footer>
    </aside>
  );
};
