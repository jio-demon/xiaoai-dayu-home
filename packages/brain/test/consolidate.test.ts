import { describe, expect, it } from 'vitest';
import type { MemoryCard, MemoryTuning } from '@xiaoai/protocol';
import { archiveWeak, consolidate, decayCards, findMergePairs, mergePair } from '../src/memory/consolidate';

const T: MemoryTuning = { topK: 6, tokenBudget: 800, decayPerDay: 0.98, archiveThreshold: 0.15, mergeThreshold: 0.92 };
const DAY = 86400000;
let n = 0;
function card(p: Partial<MemoryCard> = {}): MemoryCard {
  n++;
  return {
    id: 'm' + n, room: 'study', type: 'preference', text: '喜欢蓝色', importance: 0.6, strength: 0.8,
    createdAt: 0, lastRecalledAt: null, recallCount: 0, pinned: false, sourceSessionIds: ['s1'], ...p,
  };
}

describe('decayCards', () => {
  it('按天数指数衰减', () => {
    const c = card({ createdAt: 0, strength: 1 });
    const [d] = decayCards([c], T, 10 * DAY);
    expect(d.strength).toBeCloseTo(Math.pow(0.98, 10));
  });
  it('置顶与归档不衰减，半天内不衰减', () => {
    const pin = card({ pinned: true, createdAt: 0 });
    const arch = card({ archived: true, createdAt: 0 });
    const fresh = card({ createdAt: 0 });
    const out = decayCards([pin, arch, fresh], T, DAY * 0.2);
    expect(out[0].strength).toBe(0.8);
    expect(out[1].strength).toBe(0.8);
    expect(out[2].strength).toBe(0.8);
  });
  it('以 lastRecalledAt 为锚点', () => {
    const c = card({ createdAt: 0, lastRecalledAt: 9 * DAY, strength: 1 });
    const [d] = decayCards([c], T, 10 * DAY);
    expect(d.strength).toBeCloseTo(0.98);
  });
});

describe('findMergePairs / mergePair', () => {
  it('同房间同类型高相似配对，每卡至多一对', () => {
    const a = card({ embedding: [1, 0] });
    const b = card({ embedding: [0.99, 0.01] });
    const c = card({ embedding: [0.98, 0.02] });
    const diff = card({ room: 'hall', embedding: [1, 0] });
    const pairs = findMergePairs([a, b, c, diff], 0.92);
    expect(pairs.length).toBe(1);
    expect(pairs[0][0].id).toBe(a.id);
  });
  it('合并保留较大重要度/强度并集来源，清空向量', async () => {
    const a = card({ importance: 0.4, strength: 0.5, sourceSessionIds: ['s1'] });
    const b = card({ importance: 0.9, strength: 0.7, sourceSessionIds: ['s2'], embedding: [1] });
    const m = await mergePair(a, b, null);
    expect(m.id).toBe(a.id);
    expect(m.importance).toBe(0.9);
    expect(m.strength).toBe(0.7);
    expect(m.sourceSessionIds).toEqual(['s1', 's2']);
    expect(m.embedding).toBeUndefined();
    expect(m.text).toContain('；');
  });
});

describe('archiveWeak / consolidate', () => {
  it('弱记忆进阁楼且不删除，置顶豁免', () => {
    const weak = card({ strength: 0.1 });
    const pin = card({ strength: 0.05, pinned: true });
    const { cards, archivedIds } = archiveWeak([weak, pin], 0.15);
    expect(archivedIds).toEqual([weak.id]);
    expect(cards[0].room).toBe('attic');
    expect(cards[0].archived).toBe(true);
    expect(cards[1].archived).toBeFalsy();
  });
  it('consolidate 全流程：衰减+合并+归档', async () => {
    const a = card({ embedding: [1, 0], createdAt: 0 });
    const b = card({ embedding: [1, 0], createdAt: 0 });
    const weak = card({ strength: 0.05, createdAt: 0 });
    const r = await consolidate([a, b, weak], T, { now: 30 * DAY });
    expect(r.mergedIds.length).toBe(1);
    expect(r.archivedIds).toContain(weak.id);
    expect(r.cards.length).toBe(2);
  });
});
