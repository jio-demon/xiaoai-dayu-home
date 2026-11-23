import { PALACE_ROOMS, clamp01, estimateTokens, type MemoryCard, type MemoryTuning } from '@xiaoai/protocol';

export function cosine(a?: number[], b?: number[] | null): number {
  if (!a || !b || !a.length || a.length !== b.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 召回得分 = 0.6*语义相似 + 0.2*重要度 + 0.2*当前强度。 */
export function scoreCard(c: MemoryCard, query: number[] | null): number {
  return 0.6 * cosine(c.embedding, query) + 0.2 * c.importance + 0.2 * c.strength;
}

const ROOM_NAME = new Map(PALACE_ROOMS.map((r) => [r.id, r.name]));
const TYPE_NAME: Record<string, string> = { fact: '事实', preference: '喜好', event: '事件', promise: '约定', emotion: '情绪' };

export function buildRecallBlock(picked: MemoryCard[]): string {
  if (!picked.length) return '';
  const lines = picked.map((c) => `- 【${ROOM_NAME.get(c.room) ?? c.room}·${TYPE_NAME[c.type] ?? c.type}】${c.text}`);
  return '【回忆】你记得的关于用户的事（自然地引用，像老朋友一样）：\n' + lines.join('\n');
}

export interface RecallResult { picked: MemoryCard[]; block: string; cards: MemoryCard[] }

/**
 * 召回：置顶卡（≤3）必进；其余按得分 topK，受 tokenBudget 约束。
 * 命中即强化：strength+0.15（封顶1）、recallCount+1、lastRecalledAt=now。
 * 返回的 cards 是强化后的完整新数组，调用方负责持久化。
 */
export function retrieveMemories(all: MemoryCard[], query: number[] | null, tuning: MemoryTuning, now: number): RecallResult {
  const active = all.filter((c) => !c.archived);
  const pinned = active.filter((c) => c.pinned).sort((a, b) => b.importance - a.importance).slice(0, 3);
  const rest = active.filter((c) => !c.pinned)
    .map((c) => ({ c, s: scoreCard(c, query) }))
    .sort((a, b) => b.s - a.s);
  const picked: MemoryCard[] = [...pinned];
  let budget = tuning.tokenBudget - pinned.reduce((s, c) => s + estimateTokens(c.text), 0);
  let taken = 0;
  for (const { c } of rest) {
    if (taken >= tuning.topK) break;
    const cost = estimateTokens(c.text);
    if (cost > budget) continue;
    budget -= cost; taken++; picked.push(c);
  }
  const pickedIds = new Set(picked.map((c) => c.id));
  const cards = all.map((c) => pickedIds.has(c.id)
    ? { ...c, strength: clamp01(c.strength + 0.15), recallCount: c.recallCount + 1, lastRecalledAt: now }
    : { ...c });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const reinforced = picked.map((c) => byId.get(c.id)!);
  return { picked: reinforced, block: buildRecallBlock(reinforced), cards };
}

