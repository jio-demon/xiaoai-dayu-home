import { useState } from 'react';
import { useAdmin } from './AdminApp';

export function HistoryPage() {
  const { sessions, deleteSession } = useAdmin();
  const [open, setOpen] = useState<string | null>(null);
  const list = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { hour12: false });

  return (
    <div className="page">
      <h2>对话历史 <span className="dim">共 {sessions.length} 段会话</span></h2>
      <p className="dim">会话结束（空闲 90 秒或手动）后，大模型会把内容整理成记忆卡片存入宫殿；删除会话不影响已生成的记忆。</p>
      <div className="sess-list">
        {list.map((s) => (
          <div key={s.id} className="sess-item">
            <div className="sess-head" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="sess-arrow">{open === s.id ? '▾' : '▸'}</span>
              <span>{fmt(s.startedAt)}</span>
              <span className="tag tag-dim">{s.turns.length} 轮</span>
              {s.endedAt ? <span className="tag">已结束</span> : <span className="tag tag-on">进行中</span>}
              <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}>删除</button>
            </div>
            {s.summary && <p className="sess-summary">📝 {s.summary}</p>}
            {open === s.id && (
              <div className="sess-turns">
                {s.turns.map((t, i) => (
                  <div key={i} className={`turn turn-${t.role}`}>
                    <span className="turn-name">{t.role === 'user' ? '你' : '大肥鱼'}</span>
                    <span className="turn-text">{t.text}</span>
                    <span className="turn-ts">{new Date(t.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!list.length && <p className="dim empty">还没有对话记录。</p>}
      </div>
    </div>
  );
}
