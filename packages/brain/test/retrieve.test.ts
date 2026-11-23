import { describe, expect, it } from 'vitest';
import type { MemoryCard, MemoryTuning } from '@xiaoai/protocol';
import { buildRecallBlock, cosine, retrieveMemories, scoreCard } from '../src/memory/retrieve';

const T: MemoryTuning = { topK: 6, tokenBudget: 800, decayPerDay: 0.98, archiveThreshold: 0.15, mergeThreshold: 0.92 };
let n = 0;
function card(p: Partial<MemoryCard> = {}): MemoryCard {
  n++;
  return {
    id: 'c' + n, room: 'hall', type: 'fact', text: '用户喜欢鲸鱼', importance: 0.5, strength: 0.5,
    createdAt: 0, lastRecalledAt: null, recallCount: 0, pinned: false, sourceSessionIds: [], ...p,
  };
}

describe('cosine', () => {
  it('同向=1 正交=0 维度不匹配=0', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1], [1, 0])).toBe(0);
    expect(cosine(undefined, [1])).toBe(0);
  });
});

describe('retrieveMemories', () => {
  it('得分权重 0.6cos+0.2imp+0.2str', () => {
    const c = card({ embedding: [1, 0], importance: 0.8, strength: 0.4 });
    expect(scoreCard(c, [1, 0])).toBeCloseTo(0.6 + 0.16 + 0.08);
  });
  it('语义相关优先于重要度', () => {
    const rel = card({ text: '相关', embedding: [1, 0], importance: 0.3, strength: 0.3 });
    const imp = card({ text: '重要但不相关', embedding: [0, 1], importance: 0.9, strength: 0.9 });
    const r = retrieveMemories([imp, rel], [1, 0], T, 1000);
    expect(r.picked[0].id).toBe(rel.id);
  });
  it('无查询向量时按重要度+强度退化排序', () => {
    const a = card({ importance: 0.9, strength: 0.9 });
    const b = card({ importance: 0.1, strength: 0.1 });
    const r = retrieveMemories([b, a], null, T, 1000);
    expect(r.picked[0].id).toBe(a.id);
  });
  it('topK 与 tokenBudget 限制', () => {
    const cards = Array.from({ length: 20 }, () => card({ text: '很长'.repeat(40) }));
    const r = retrieveMemories(cards, null, { ...T, topK: 3, tokenBudget: 100 }, 1000);
    expect(r.picked.length).toBeLessThanOrEqual(3);
    const small = Array.from({ length: 20 }, () => card({ text: '短' }));
    const r2 = retrieveMemories(small, null, { ...T, topK: 3 }, 1000);
    expect(r2.picked.length).toBe(3);
  });
  it('置顶卡必进且最多3张，归档卡排除', () => {
    const pins = Array.from({ length: 5 }, (_, i) => card({ pinned: true, importance: i / 10 }));
    const arch = card({ archived: true, importance: 1, strength: 1 });
    const r = retrieveMemories([...pins, arch], null, { ...T, topK: 0, tokenBudget: 0 }, 1000);
    expect(r.picked.length).toBe(3);
    expect(r.picked.every((c) => c.pinned)).toBe(true);
    expect(r.picked.find((c) => c.id === arch.id)).toBeUndefined();
  });
  it('召回强化 strength+0.15 封顶1 并计数', () => {
    const c = card({ strength: 0.9 });
    const r = retrieveMemories([c], null, T, 5000);
    const up = r.cards.find((x) => x.id === c.id)!;
    expect(up.strength).toBe(1);
    expect(up.recallCount).toBe(1);
    expect(up.lastRecalledAt).toBe(5000);
    expect(c.strength).toBe(0.9); // 原数组不被修改
  });
  it('召回块包含房间与类型标签', () => {
    const block = buildRecallBlock([card({ room: 'kitchen', type: 'promise', text: '周末一起看海' })]);
    expect(block).toContain('厨房');
    expect(block).toContain('约定');
    expect(block).toContain('周末一起看海');
    expect(buildRecallBlock([])).toBe('');
  });
});
