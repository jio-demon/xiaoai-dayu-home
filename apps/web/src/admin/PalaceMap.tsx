import { useMemo, useRef, useState } from 'react';
import { PALACE_ROOMS, type MemoryCard, type PalaceRoom } from '@xiaoai/protocol';
import { useAdmin } from './AdminApp';
import { CardEditor } from './CardEditor';

interface Rect { x: number; y: number; w: number; h: number }
const ROOM_RECTS: Record<PalaceRoom, Rect> = {
  attic: { x: 210, y: 52, w: 300, h: 100 },
  bedroom: { x: 50, y: 175, w: 300, h: 175 },
  study: { x: 370, y: 175, w: 300, h: 175 },
  living: { x: 50, y: 365, w: 300, h: 175 },
  kitchen: { x: 370, y: 365, w: 300, h: 175 },
  hall: { x: 50, y: 555, w: 620, h: 65 },
};
const COLS = 3; const SLOT_H = 32; const PAD = 8; const TITLE_H = 26;

function slots(rect: Rect) {
  const slotW = (rect.w - PAD * 2) / COLS;
  const rows = Math.max(1, Math.floor((rect.h - TITLE_H - PAD) / SLOT_H));
  return { slotW, rows, cap: COLS * rows };
}
function slotPos(rect: Rect, i: number) {
  const { slotW } = slots(rect);
  return { x: rect.x + PAD + (i % COLS) * slotW, y: rect.y + TITLE_H + Math.floor(i / COLS) * SLOT_H };
}
function roomAt(x: number, y: number): PalaceRoom | null {
  for (const r of PALACE_ROOMS) {
    const b = ROOM_RECTS[r.id];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return r.id;
  }
  return null;
}

/** 记忆宫殿地图：房子剖面图，卡片即便签；拖拽换房间，点击编辑。 */
export function PalaceMap() {
  const { cards, upsertCard, deleteCard } = useAdmin();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [editing, setEditing] = useState<MemoryCard | null>(null);
  const [hoverRoom, setHoverRoom] = useState<PalaceRoom | null>(null);

  const byRoom = useMemo(() => {
    const m = new Map<PalaceRoom, MemoryCard[]>();
    for (const r of PALACE_ROOMS) m.set(r.id, []);
    for (const c of cards) m.get(c.room)?.push(c);
    for (const list of m.values()) list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.strength - a.strength);
    return m;
  }, [cards]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 720, y: ((e.clientY - rect.top) / rect.height) * 640 };
  };

  const onDown = (e: React.PointerEvent, c: MemoryCard) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e);
    setDrag({ id: c.id, x: p.x, y: p.y, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    const moved = drag.moved || Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 6;
    setDrag({ ...drag, x: p.x, y: p.y, moved });
    setHoverRoom(moved ? roomAt(p.x, p.y) : null);
  };
  const onUp = () => {
    if (!drag) return;
    const card = cards.find((c) => c.id === drag.id);
    if (card) {
      if (!drag.moved) setEditing(card);
      else {
        const room = roomAt(drag.x, drag.y);
        if (room && room !== card.room) void upsertCard({ ...card, room, archived: room === 'attic' ? true : card.archived });
      }
    }
    setDrag(null); setHoverRoom(null);
  };

  const dragCard = drag ? cards.find((c) => c.id === drag.id) : null;

  return (
    <div className="page">
      <h2>记忆宫殿</h2>
      <p className="dim">每个房间存放一类记忆；便签越清晰代表记忆强度越高。拖到别的房间可重新归类，拖进阁楼即归档，点击可编辑。</p>
      <svg ref={svgRef} viewBox="0 0 720 640" className="palace-svg"
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        {/* 房子轮廓 */}
        <polygon points="30,165 360,18 690,165" className="palace-roof" />
        <rect x="40" y="165" width="640" height="465" className="palace-wall" />
        <line x1="40" y1="357" x2="680" y2="357" className="palace-floor" />
        <line x1="360" y1="165" x2="360" y2="547" className="palace-floor" />
        {PALACE_ROOMS.map((r) => {
          const b = ROOM_RECTS[r.id];
          const list = byRoom.get(r.id) ?? [];
          const { slotW, cap } = slots(b);
          const shown = list.slice(0, cap);
          return (
            <g key={r.id}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6"
                className={`palace-room ${hoverRoom === r.id ? 'hover' : ''}`} />
              <text x={b.x + PAD} y={b.y + 18} className="palace-title">
                {r.name} · {r.category}（{list.length}）
              </text>
              {shown.map((c, i) => {
                const p = slotPos(b, i);
                const hidden = drag?.id === c.id && drag.moved;
                return (
                  <g key={c.id} className="palace-card" opacity={hidden ? 0.25 : 0.35 + 0.65 * c.strength}
                    onPointerDown={(e) => onDown(e, c)}>
                    <rect x={p.x + 2} y={p.y + 2} width={slotW - 4} height={SLOT_H - 5} rx="4"
                      className={`sticky sticky-${c.type}`} />
                    <text x={p.x + 8} y={p.y + 21} className="sticky-text">
                      {c.pinned ? '★ ' : ''}{c.text.length > 9 ? c.text.slice(0, 9) + '…' : c.text}
                    </text>
                  </g>
                );
              })}
              {list.length > cap && (
                <text x={b.x + b.w - PAD} y={b.y + b.h - 8} textAnchor="end" className="palace-more">
                  +{list.length - cap} 更多
                </text>
              )}
            </g>
          );
        })}
        {dragCard && drag?.moved && (
          <g opacity="0.9" pointerEvents="none">
            <rect x={drag.x - 45} y={drag.y - 14} width="90" height="28" rx="4" className={`sticky sticky-${dragCard.type}`} />
            <text x={drag.x - 38} y={drag.y + 5} className="sticky-text">
              {dragCard.text.slice(0, 9)}
            </text>
          </g>
        )}
      </svg>
      {editing && <CardEditor card={editing} onSave={(c) => void upsertCard(c)} onDelete={(id) => void deleteCard(id)} onClose={() => setEditing(null)} />}
    </div>
  );
}
