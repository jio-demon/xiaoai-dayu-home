import { describe, expect, it } from 'vitest';
import type { Session } from '@xiaoai/protocol';
import { draftsToCards, embedCards, extractMemories, parseExtraction } from '../src/memory/extract';
import type { ChatProvider, EmbedProvider } from '../src/providers/types';

const sess: Session = {
  id: 's1', startedAt: 0, endedAt: 1, summary: null,
  turns: [
    { role: 'user', text: '我下周要去青岛看海', ts: 0 },
    { role: 'assistant', text: '好呀，记得带外套。', ts: 1 },
  ],
};

function chatOf(text: string): ChatProvider {
  return { async *stream() { yield text; } };
}

describe('parseExtraction', () => {
  it('解析合法 JSON 并钳制', () => {
    const raw = '{"summary":"用户要去青岛","cards":[{"room":"living","type":"event","text":"用户下周去青岛看海","importance":1.5},{"room":"bad","type":"xx","text":"  ","importance":-1}]}';
    const r = parseExtraction(raw, sess);
    expect(r.summary).toBe('用户要去青岛');
    expect(r.cards.length).toBe(1);
    expect(r.cards[0].importance).toBe(1);
  });
  it('剥代码围栏', () => {
    const raw = '```json\n{"summary":"s","cards":[{"room":"kitchen","type":"promise","text":"约定看海","importance":0.8}]}\n```';
    const r = parseExtraction(raw, sess);
    expect(r.cards[0].room).toBe('kitchen');
  });
  it('非法 room/type 回退映射，去重', () => {
    const raw = '{"summary":"s","cards":[{"room":"attic","type":"emotion","text":"用户有点想家","importance":0.7},{"room":"hall","type":"fact","text":"用户有点想家","importance":0.7}]}';
    const r = parseExtraction(raw, sess);
    expect(r.cards.length).toBe(1);
    expect(r.cards[0].room).toBe('bedroom');
  });
  it('垃圾输出回退摘要', () => {
    const r = parseExtraction('对不起我不会', sess);
    expect(r.cards).toEqual([]);
    expect(r.summary).toContain('青岛');
  });
});

describe('extractMemories', () => {
  it('走 chat 流并解析', async () => {
    const r = await extractMemories(sess, chatOf('{"summary":"青岛之行","cards":[{"room":"living","type":"event","text":"用户下周去青岛","importance":0.8}]}'));
    expect(r.summary).toBe('青岛之行');
    expect(r.cards.length).toBe(1);
  });
  it('chat 抛错时静默回退', async () => {
    const bad: ChatProvider = { async *stream(): AsyncIterable<string> { throw new Error('boom'); } };
    const r = await extractMemories(sess, bad);
    expect(r.cards).toEqual([]);
  });
});

describe('draftsToCards / embedCards', () => {
  it('草稿转卡片字段完整', () => {
    const [c] = draftsToCards([{ room: 'study', type: 'preference', text: '喜欢鲸鱼', importance: 0.7 }], 's1', 42);
    expect(c.id).toMatch(/^mem_/);
    expect(c.strength).toBe(0.7);
    expect(c.sourceSessionIds).toEqual(['s1']);
    expect(c.createdAt).toBe(42);
  });
  it('只补缺失向量', async () => {
    const cards = draftsToCards([
      { room: 'hall', type: 'fact', text: 'a', importance: 0.5 },
      { room: 'hall', type: 'fact', text: 'b', importance: 0.5 },
    ], 's1', 0);
    cards[0].embedding = [9];
    const embed: EmbedProvider = { async embed(texts) { return texts.map(() => [1, 2]); } };
    await embedCards(cards, embed);
    expect(cards[0].embedding).toEqual([9]);
    expect(cards[1].embedding).toEqual([1, 2]);
  });
});
