import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, STORE_KEYS } from '@xiaoai/protocol';
import { BlobStore, InMemoryStore, mergeConfig, type BlobApi } from '../src/memory/store';
import { Orchestrator } from '../src/orchestrator';

function fakeBlob(): BlobApi & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    async getBlob(k) { return map.get(k) ?? null; },
    async putBlob(k, v) { map.set(k, v); },
  };
}

describe('mergeConfig', () => {
  it('子对象深合并而非整体覆盖', () => {
    const m = mergeConfig({ ...DEFAULT_CONFIG }, { llm: { id: 'deepseek', apiKey: 'sk-x' }, memory: { topK: 9, tokenBudget: 800, decayPerDay: 0.98, archiveThreshold: 0.15, mergeThreshold: 0.92 } });
    expect(m.llm.apiKey).toBe('sk-x');
    expect(m.llm.model).toBe('deepseek-chat');
    expect(m.memory.topK).toBe(9);
    expect(m.tts.id).toBe('siliconflow');
  });
});

describe('InMemoryStore', () => {
  it('读写隔离（克隆）', async () => {
    const s = new InMemoryStore();
    await s.saveCards([{ id: 'a', room: 'hall', type: 'fact', text: 't', importance: 0.5, strength: 0.5, createdAt: 0, lastRecalledAt: null, recallCount: 0, pinned: false, sourceSessionIds: [] }]);
    const got = await s.loadCards();
    got[0].text = 'changed';
    expect((await s.loadCards())[0].text).toBe('t');
  });
});

describe('BlobStore', () => {
  it('JSON 文档往返', async () => {
    const api = fakeBlob();
    const s = new BlobStore(api);
    expect(await s.loadCards()).toEqual([]);
    const cfg = await s.loadConfig();
    expect(cfg.llm.model).toBe('deepseek-chat');
    await s.saveConfig({ ...cfg, wakeWord: '小鲸鱼' });
    expect(JSON.parse(api.map.get(STORE_KEYS.config)!).wakeWord).toBe('小鲸鱼');
    expect((await s.loadConfig()).wakeWord).toBe('小鲸鱼');
  });
  it('损坏 JSON 回退默认', async () => {
    const api = fakeBlob();
    api.map.set(STORE_KEYS.cards, '{bad json');
    const s = new BlobStore(api);
    expect(await s.loadCards()).toEqual([]);
  });

  it('真机严格模式传播读取异常，编排器不会用空配置覆盖原数据', async () => {
    const api = fakeBlob();
    api.map.set(STORE_KEYS.config, JSON.stringify({ wakeWord: '原来的唤醒词' }));
    api.getBlob = async () => { throw new Error('SQLite unavailable'); };
    const s = new BlobStore(api, true);
    await expect(s.loadConfig()).rejects.toThrow('读取设备存储 config 失败');
    const orch = new Orchestrator({ providers: {} as any, store: s, emit: () => {} });
    await expect(orch.init()).rejects.toThrow('SQLite unavailable');
    expect(JSON.parse(api.map.get(STORE_KEYS.config)!).wakeWord).toBe('原来的唤醒词');
    expect(api.map.has(STORE_KEYS.cards)).toBe(false);
    expect(api.map.has(STORE_KEYS.sessions)).toBe(false);
  });

  it('真机严格模式拒绝损坏 JSON 和错误文档类型', async () => {
    const api = fakeBlob();
    api.map.set(STORE_KEYS.cards, '{bad json');
    const s = new BlobStore(api, true);
    await expect(s.loadCards()).rejects.toThrow('读取设备存储 cards 失败');
    api.map.set(STORE_KEYS.sessions, '{}');
    await expect(s.loadSessions()).rejects.toThrow('不是数组');
    api.map.set(STORE_KEYS.config, '[]');
    await expect(s.loadConfig()).rejects.toThrow('不是对象');
    expect(api.map.get(STORE_KEYS.cards)).toBe('{bad json');
  });

  it('真机首次启动允许缺失键使用默认值，并完整加载已有三类数据', async () => {
    const api = fakeBlob();
    const s = new BlobStore(api, true);
    expect((await s.loadConfig()).wakeWord).toBe('大肥鱼');
    expect(await s.loadCards()).toEqual([]);
    expect(await s.loadSessions()).toEqual([]);
    await s.saveConfig({ ...(await s.loadConfig()), wakeWord: '小鲸鱼' });
    await s.saveCards([]);
    await s.saveSessions([]);
    expect((await s.loadConfig()).wakeWord).toBe('小鲸鱼');
  });
});
