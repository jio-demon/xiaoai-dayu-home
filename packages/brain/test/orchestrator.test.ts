import { describe, expect, it } from 'vitest';
import type { AppConfig, AudioPayload } from '@xiaoai/protocol';
import { Orchestrator, type OrchEvent } from '../src/orchestrator';
import { InMemoryStore } from '../src/memory/store';
import type { ChatMessage, Providers } from '../src/providers/types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function mockProviders(opts?: { reply?: string; slow?: boolean; extractJson?: string }): Providers {
  const reply = opts?.reply ?? '你好呀！今天过得怎么样？我很好。';
  return {
    chat: {
      async *stream(messages: ChatMessage[]): AsyncIterable<string> {
        const isExtract = messages[0]?.content.includes('记忆提取器');
        const text = isExtract ? (opts?.extractJson ?? '{"summary":"打了招呼","cards":[{"room":"hall","type":"fact","text":"用户打过招呼","importance":0.4}]}') : reply;
        for (const ch of text) {
          if (opts?.slow) await sleep(2);
          yield ch;
        }
      },
    },
    asr: { async transcribe() { return '你好'; } },
    tts: { async synthesize(text): Promise<AudioPayload> { return { mime: 'audio/mpeg', data: 'QUJD', url: undefined }; } },
    embed: { async embed(texts) { return texts.map(() => [1, 0]); } },
  };
}

function setup(cfgPatch?: Partial<AppConfig>, opts?: { reply?: string; slow?: boolean }) {
  const store = new InMemoryStore({
    config: { llm: { id: 'deepseek', apiKey: 'sk-test' }, tts: { id: 'siliconflow', apiKey: 'sk-test' }, embedding: { id: 'siliconflow', apiKey: 'sk-test' }, ...cfgPatch },
  });
  const events: OrchEvent[] = [];
  const orch = new Orchestrator({
    providers: mockProviders(opts), store, emit: (e) => events.push(e),
    providerFactory: () => mockProviders(opts),
  });
  return { store, events, orch };
}

describe('Orchestrator', () => {
  it('完整对话流：thinking→speaking→speak→idle，落库两轮', async () => {
    const { store, events, orch } = setup();
    await orch.handleUserText('你好');
    const states = events.filter((e) => e.type === 'voice').map((e) => (e as any).state);
    expect(states[0]).toBe('thinking');
    expect(states).toContain('speaking');
    expect(states[states.length - 1]).toBe('idle');
    expect(events.filter((e) => e.type === 'speak').length).toBeGreaterThan(0);
    const sessions = await store.loadSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].turns.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(sessions[0].turns[1].text).toContain('你好呀');
  });

  it('召回块注入 system 且命中强化', async () => {
    const { store, orch } = setup();
    await store.saveCards([{ id: 'c1', room: 'kitchen', type: 'promise', text: '周末一起看海', importance: 0.9, strength: 0.5, createdAt: 0, lastRecalledAt: null, recallCount: 0, pinned: true, sourceSessionIds: [], embedding: [1, 0] }]);
    let seenSystem = '';
    const providers = mockProviders();
    const orig = providers.chat.stream.bind(providers.chat);
    providers.chat.stream = (msgs, o) => { seenSystem = msgs[0].content; return orig(msgs, o); };
    const orch2 = new Orchestrator({ providers, store, emit: () => {}, providerFactory: () => providers });
    await orch2.handleUserText('周末干嘛');
    expect(seenSystem).toContain('周末一起看海');
    const cards = await store.loadCards();
    expect(cards[0].recallCount).toBe(1);
    expect(cards[0].strength).toBeCloseTo(0.65);
  });

  it('abort 打断后提前 idle', async () => {
    const { events, orch } = setup(undefined, { reply: '第一句。第二句。第三句。第四句。第五句。第六句。', slow: true });
    const p = orch.handleUserText('讲长一点');
    await sleep(30);
    orch.abort();
    await p;
    const states = events.filter((e) => e.type === 'voice').map((e) => (e as any).state);
    expect(states[states.length - 1]).toBe('idle');
    const speaks = events.filter((e) => e.type === 'speak');
    expect(speaks.length).toBeLessThan(6);
  });

  it('endSession 提取记忆卡片', async () => {
    const { store, events, orch } = setup();
    await orch.handleUserText('我下周去青岛');
    await orch.endSession();
    const cards = await store.loadCards();
    expect(cards.length).toBe(1);
    expect(cards[0].text).toBe('用户打过招呼');
    expect(cards[0].embedding).toEqual([1, 0]);
    const sessions = await store.loadSessions();
    expect(sessions[0].endedAt).not.toBeNull();
    expect(sessions[0].summary).toBe('打了招呼');
    expect(events.some((e) => e.type === 'memory' && e.op === 'upsert')).toBe(true);
  });

  it('无 TTS key 时只出文字不出音频', async () => {
    const { events, orch } = setup({ tts: { id: 'siliconflow', apiKey: '' } });
    await orch.handleUserText('你好');
    expect(events.filter((e) => e.type === 'speak').length).toBe(0);
    expect(events.some((e) => e.type === 'voice' && (e as any).state === 'speaking')).toBe(true);
  });

  it('夜间巩固每日守卫', async () => {
    const { store, orch } = setup();
    await store.saveCards([{ id: 'w', room: 'hall', type: 'fact', text: '弱记忆', importance: 0.2, strength: 0.05, createdAt: 0, lastRecalledAt: null, recallCount: 0, pinned: false, sourceSessionIds: [] }]);
    await orch.runNightlyConsolidation();
    expect((await store.loadCards())[0].archived).toBe(true);
    await orch.runNightlyConsolidation(); // 同日第二次应跳过（不报错即可）
  });

  it('say 直接播报', async () => {
    const { events, orch } = setup();
    await orch.say('摸头舒服吧');
    const speaks = events.filter((e) => e.type === 'speak');
    expect(speaks.length).toBe(1);
    expect((speaks[0] as any).text).toBe('摸头舒服吧');
  });

  it('applyRemoteMemory 增改删落库且不回环 emit', async () => {
    const { store, events, orch } = setup();
    const card = { id: 'r1', room: 'study' as const, type: 'preference' as const, text: '喜欢鲸鱼', importance: 0.6, strength: 0.5, createdAt: 0, lastRecalledAt: null, recallCount: 0, pinned: false, sourceSessionIds: [] };
    await orch.applyRemoteMemory('upsert', card);
    expect((await store.loadCards()).map((c) => c.id)).toEqual(['r1']);
    await orch.applyRemoteMemory('upsert', { ...card, text: '喜欢蓝发鲸鱼娘' });
    expect((await store.loadCards())[0].text).toBe('喜欢蓝发鲸鱼娘');
    await orch.applyRemoteMemory('delete', undefined, 'r1');
    expect((await store.loadCards()).length).toBe(0);
    expect(events.filter((e) => e.type === 'memory').length).toBe(0);
  });

  it('applyRemoteSession 整段 upsert 落库', async () => {
    const { store, orch } = setup();
    const sess = { id: 's9', startedAt: 0, endedAt: null, summary: null, turns: [{ role: 'user' as const, text: 'hi', ts: 0 }] };
    await orch.applyRemoteSession(sess);
    expect((await store.loadSessions()).map((s) => s.id)).toEqual(['s9']);
    await orch.applyRemoteSession({ ...sess, summary: '打过招呼' });
    expect((await store.loadSessions())[0].summary).toBe('打过招呼');
  });
});

