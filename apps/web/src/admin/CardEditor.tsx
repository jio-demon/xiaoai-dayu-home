import { useState } from 'react';
import { PALACE_ROOMS, clamp01, uid, type MemoryCard, type MemoryType, type PalaceRoom } from '@xiaoai/protocol';

const TYPES: { id: MemoryType; name: string }[] = [
  { id: 'fact', name: '事实' }, { id: 'preference', name: '偏好' }, { id: 'event', name: '事件' },
  { id: 'promise', name: '约定' }, { id: 'emotion', name: '情绪' },
];

export function newCard(): MemoryCard {
  return {
    id: uid('mem_'), room: 'hall', type: 'fact', text: '', importance: 0.5, strength: 0.5,
    createdAt: Date.now(), lastRecalledAt: null, recallCount: 0, pinned: false, sourceSessionIds: [],
  };
}

/** 记忆卡片编辑器（记忆列表与宫殿地图共用）。 */
export function CardEditor(props: { card: MemoryCard; onSave: (c: MemoryCard) => void; onDelete?: (id: string) => void; onClose: () => void }) {
  const [c, setC] = useState<MemoryCard>({ ...props.card });
  return (
    <div className="editor-mask" onClick={props.onClose}>
      <div className="editor-card" onClick={(e) => e.stopPropagation()}>
        <h3>{props.card.text ? '编辑记忆' : '新建记忆'}</h3>
        <label>内容
          <textarea className="text-input" rows={3} value={c.text} onChange={(e) => setC({ ...c, text: e.target.value })} />
        </label>
        <div className="form-grid">
          <label>房间
            <select value={c.room} onChange={(e) => setC({ ...c, room: e.target.value as PalaceRoom })}>
              {PALACE_ROOMS.map((r) => <option key={r.id} value={r.id}>{r.name}（{r.category}）</option>)}
            </select>
          </label>
          <label>类型
            <select value={c.type} onChange={(e) => setC({ ...c, type: e.target.value as MemoryType })}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>重要性 {c.importance.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={c.importance} onChange={(e) => setC({ ...c, importance: clamp01(Number(e.target.value)) })} />
          </label>
          <label>强度 {c.strength.toFixed(2)}
            <input type="range" min={0} max={1} step={0.05} value={c.strength} onChange={(e) => setC({ ...c, strength: clamp01(Number(e.target.value)) })} />
          </label>
          <label className="check-line"><input type="checkbox" checked={c.pinned} onChange={(e) => setC({ ...c, pinned: e.target.checked })} /> 置顶（永不遗忘，召回必带）</label>
        </div>
        <div className="save-bar">
          <button className="btn btn-primary" disabled={!c.text.trim()} onClick={() => { props.onSave({ ...c, text: c.text.trim() }); props.onClose(); }}>保存</button>
          {props.onDelete && <button className="btn btn-danger" onClick={() => { props.onDelete!(c.id); props.onClose(); }}>删除</button>}
          <button className="btn" onClick={props.onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
