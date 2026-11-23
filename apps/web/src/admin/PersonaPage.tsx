import { useEffect, useState } from 'react';
import { DEFAULT_PERSONA } from '@xiaoai/protocol';
import { useAdmin } from './AdminApp';

export function PersonaPage() {
  const { config, saveConfig, api } = useAdmin();
  const [text, setText] = useState('');
  const [say, setSay] = useState('今天也要元气满满哦！');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (config) setText(config.persona); }, [config]);

  const save = async () => {
    await saveConfig({ persona: text });
    setMsg('角色设定已保存 ✓');
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="page">
      <h2>角色设定（System Prompt）</h2>
      <p className="dim">定义大肥鱼的性格、说话方式与边界。记忆召回块会自动附加在其后。</p>
      <textarea className="persona-area" value={text} onChange={(e) => setText(e.target.value)} rows={14} />
      <div className="save-bar">
        <button className="btn btn-primary" onClick={() => void save()}>保存</button>
        <button className="btn" onClick={() => setText(DEFAULT_PERSONA)}>恢复默认</button>
        {msg && <span className="save-msg">{msg}</span>}
      </div>
      <section className="card">
        <h3>试说一句（不经大模型，直接 TTS 播报）</h3>
        <div className="say-line">
          <input className="text-input" value={say} onChange={(e) => setSay(e.target.value)} />
          <button className="btn" onClick={() => api.command({ cmd: 'say', text: say })}>播放</button>
          <button className="btn" onClick={() => api.command({ cmd: 'stop' })}>停止</button>
        </div>
      </section>
    </div>
  );
}
