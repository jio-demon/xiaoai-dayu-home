import { useEffect, useState } from 'react';
import { useAdmin } from './AdminApp';

const VOICE_NAME: Record<string, string> = { idle: '待机', listening: '聆听中', thinking: '思考中', speaking: '播报中' };

export function StatusPage() {
  const { api, status, refresh } = useAdmin();
  const [say, setSay] = useState('你好呀，我是大肥鱼！');
  useEffect(() => {
    const t = setInterval(() => { void api.getStatus().then((s) => { if (s) void refresh(); }); }, 3000);
    return () => clearInterval(t);
  }, [api, refresh]);

  const fmtUp = (sec: number) => sec >= 3600 ? `${Math.floor(sec / 3600)} 时 ${Math.floor((sec % 3600) / 60)} 分` : `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;

  return (
    <div className="page">
      <h2>状态与控制</h2>
      {status ? (
        <div className="status-grid">
          <div className="stat"><b>{status.fps}</b><span>FPS</span></div>
          <div className="stat"><b>{status.ramFreeMb >= 0 ? `${status.ramFreeMb} MB` : '—'}</b><span>JS 堆余量</span></div>
          <div className="stat"><b>{fmtUp(status.uptimeSec)}</b><span>运行时长</span></div>
          <div className="stat"><b>{VOICE_NAME[status.voiceState] ?? status.voiceState}</b><span>语音状态</span></div>
          <div className="stat"><b>{status.renderMode}</b><span>渲染模式</span></div>
          <div className="stat"><b>{status.ip}</b><span>设备 IP</span></div>
          <div className="stat"><b>{status.version}</b><span>版本</span></div>
          <div className="stat"><b className="mono">{status.bundleHash.slice(0, 12)}</b><span>界面包</span></div>
        </div>
      ) : <p className="dim">暂无状态上报（设备页需处于打开状态；真机由薄壳汇总）。</p>}
      <section className="card">
        <h3>远程控制</h3>
        <div className="say-line">
          <button className="btn" onClick={() => api.command({ cmd: 'wake' })}>🎤 模拟唤醒</button>
          <button className="btn" onClick={() => api.command({ cmd: 'stop' })}>⏹ 停止播报</button>
          <button className="btn" onClick={() => api.command({ cmd: 'reload' })}>🔄 重载界面</button>
        </div>
        <div className="say-line">
          <input className="text-input" value={say} onChange={(e) => setSay(e.target.value)} />
          <button className="btn btn-primary" onClick={() => api.command({ cmd: 'say', text: say })}>让她说</button>
        </div>
      </section>
      {status && status.errors.length > 0 && (
        <section className="card">
          <h3>最近错误</h3>
          <ul className="err-list">
            {status.errors.slice().reverse().map((e, i) => (
              <li key={i}><span className="dim">{new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span> {e.msg}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
