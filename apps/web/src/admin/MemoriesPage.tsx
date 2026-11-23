import { useMemo, useState } from 'react';
import { PALACE_ROOMS, type MemoryCard, type PalaceRoom } from '@xiaoai/protocol';
import { useAdmin } from './AdminApp';
import { CardEditor, newCard } from './CardEditor';

const TYPE_NAME: Record<string, string> = { fact: '事实', preference: '偏好', event: '事件', promise: '约定', emotion: '情绪' };

export function MemoriesPage() {
  const { cards, upsertCard, deleteCard } = useAdmin();
  const [room, setRoom] = useState<PalaceRoom | 'all'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MemoryCard | null>(null);

  const list = useMemo(() => cards
    .filter((c) => (room === 'all' || c.room === room) && (!q || c.text.includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt), [cards, room, q]);

  return (
    <div className="page">
      <h2>记忆卡片 <span className="dim">共 {cards.length} 条</span></h2>
      <div className="filter-bar">
        <select value={room} onChange={(e) => setRoom(e.target.value as PalaceRoom | 'all')}>
          <option value="all">全部房间</option>
          {PALACE_ROOMS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input className="text-input" placeholder="搜索内容…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setEditing(newCard())}>＋ 新建记忆</button>
      </div>
      <div className="mem-list">
        {list.map((c) => (
          <div key={c.id} className={`mem-item ${c.archived ? 'archived' : ''}`} onClick={() => setEditing(c)}>
            <div className="mem-head">
              <span className="tag">{PALACE_ROOMS.find((r) => r.id === c.room)?.name}</span>
              <span className="tag tag-dim">{TYPE_NAME[c.type] ?? c.type}</span>
              {c.pinned && <span className="tag tag-pin">📌 置顶</span>}
              {c.archived && <span className="tag tag-dim">已归档</span>}
              <span className="mem-date">{new Date(c.createdAt).toLocaleDateString('zh-CN')}</span>
            </div>
            <p className="mem-text">{c.text}</p>
            <div className="mem-bars">
              <span>重要 {c.importance.toFixed(2)}</span>
              <div className="bar"><i style={{ width: `${c.importance * 100}%` }} /></div>
              <span>强度 {c.strength.toFixed(2)}</span>
              <div className="bar bar-s"><i style={{ width: `${c.strength * 100}%` }} /></div>
              <span className="dim">召回 {c.recallCount} 次</span>
            </div>
          </div>
        ))}
        {!list.length && <p className="dim empty">暂无记忆。和大肥鱼多聊聊，会话结束后会自动整理出记忆卡片。</p>}
      </div>
      {editing && <CardEditor card={editing} onSave={(c) => void upsertCard(c)} onDelete={(id) => void deleteCard(id)} onClose={() => setEditing(null)} />}
    </div>
  );
}
