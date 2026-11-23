import { clamp01, type MemoryCard, type MemoryTuning } from '@xiaoai/protocol';
import type { ChatProvider } from '../providers/types';
import { cosine } from './retrieve';

const DAY = 86400000;

/**
 * 遗忘曲线：strength *= decayPerDay ^ 距上次触碰的天数（跳过置顶/归档）。
 * 注意：这是启发式近似——以 lastRecalledAt||createdAt 为锚点，
 * 若同一天重复执行会重复衰减，编排器用「每日一次」守卫规避。
 */
export function decayCards(cards: MemoryCard[], tuning: MemoryTuning, now: number): MemoryCard[] {
  return cards.map((c) => {
    if (c.pinned || c.archived) return { ...c };
    const anchor = c.lastRecalledAt ?? c.createdAt;
    const days = Math.max(0, (now - anchor) / DAY);
    if (days < 0.5) return { ...c };
    return { ...c, strength: clamp01(c.strength * Math.pow(tuning.decayPerDay, days)) };
  });
}

/** 找出可合并对：同房间同类型、双方有向量、余弦 > mergeThreshold；每卡每轮至多参与一对。 */
export function findMergePairs(cards: MemoryCard[], threshold: number): [MemoryCard, MemoryCard][] {
  const live = cards.filter((c) => !c.archived && c.embedding && c.embedding.length);
  const used = new Set<string>();
  const pairs: [MemoryCard, MemoryCard][] = [];
  for (let i = 0; i < live.length; i++) {
    if (used.has(live[i].id)) continue;
    for (let j = i + 1; j < live.length; j++) {
      if (used.has(live[j].id)) continue;
      const a = live[i]; const b = live[j];
      if (a.room !== b.room || a.type !== b.type) continue;
      if (cosine(a.embedding, b.embedding) > threshold) {
        pairs.push([a, b]); used.add(a.id); used.add(b.id); break;
      }
    }
  }
  return pairs;
}

/** 合并两张卡为一张（保留 a.id）；有 LLM 则压缩成一句，否则拼接兜底。 */
export async function mergePair(a: MemoryCard, b: MemoryCard, chat?: ChatProvider | null): Promise<MemoryCard> {
  let text = `${a.text}；${b.text}`.slice(0, 120);
  if (chat) {
    try {
      let raw = '';
      for await (const d of chat.stream([
        { role: 'system', content: '把两条关于用户的记忆合并成一句简洁中文（40字以内），只输出合并结果，不要解释。' },
        { role: 'user', content: `1. ${a.text}\n2. ${b.text}` },
      ], { temperature: 0.2 })) raw += d;
      const t = raw.trim().replace(/^["'“”]+|["'“”]+$/g, '');
      if (t) text = t.slice(0, 120);
    } catch { /* 兜底拼接 */ }
  }
  return {
    ...a, text,
    importance: Math.max(a.importance, b.importance),
    strength: Math.max(a.strength, b.strength),
    createdAt: Math.min(a.createdAt, b.createdAt),
    pinned: a.pinned || b.pinned,
    sourceSessionIds: [...new Set([...a.sourceSessionIds, ...b.sourceSessionIds])],
    embedding: undefined, // 文本变了，等待重新 embed
  };
}

/** 弱记忆归档到阁楼（可恢复），不删除。 */
export function archiveWeak(cards: MemoryCard[], threshold: number): { cards: MemoryCard[]; archivedIds: string[] } {
  const archivedIds: string[] = [];
  const out = cards.map((c) => {
    if (!c.archived && !c.pinned && c.strength < threshold) {
      archivedIds.push(c.id);
      return { ...c, archived: true, room: 'attic' as const };
    }
    return { ...c };
  });
  return { cards: out, archivedIds };
}

export interface ConsolidationResult { cards: MemoryCard[]; mergedIds: string[]; archivedIds: string[] }

/** 夜间整理：衰减 → 语义合并 → 弱记忆归档。chat 可选（无 key 时跳过 LLM 合并压缩）。 */
export async function consolidate(cards: MemoryCard[], tuning: MemoryTuning, opts: { chat?: ChatProvider | null; now: number }): Promise<ConsolidationResult> {
  let cur = decayCards(cards, tuning, opts.now);
  const mergedIds: string[] = [];
  for (const [a, b] of findMergePairs(cur, tuning.mergeThreshold)) {
    const merged = await mergePair(a, b, opts.chat);
    cur = cur.filter((c) => c.id !== b.id).map((c) => (c.id === a.id ? merged : c));
    mergedIds.push(b.id);
  }
  const { cards: archived, archivedIds } = archiveWeak(cur, tuning.archiveThreshold);
  return { cards: archived, mergedIds, archivedIds };
}
