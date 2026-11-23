import { DEFAULT_CONFIG, STORE_KEYS, type AppConfig, type MemoryCard, type MemoryStore, type Session } from '@xiaoai/protocol';

/** 深合并配置补丁（provider 子对象与 memory 调参不整体覆盖）。 */
export function mergeConfig(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...patch,
    llm: { ...base.llm, ...(patch.llm || {}) },
    asr: { ...base.asr, ...(patch.asr || {}) },
    tts: { ...base.tts, ...(patch.tts || {}) },
    embedding: { ...base.embedding, ...(patch.embedding || {}) },
    memory: { ...base.memory, ...(patch.memory || {}) },
  };
}

/** 测试 / PC 模拟用内存存储。 */
export class InMemoryStore implements MemoryStore {
  cards: MemoryCard[];
  sessions: Session[];
  config: AppConfig;
  constructor(init?: { cards?: MemoryCard[]; sessions?: Session[]; config?: Partial<AppConfig> }) {
    this.cards = init?.cards ?? [];
    this.sessions = init?.sessions ?? [];
    this.config = mergeConfig({ ...DEFAULT_CONFIG }, init?.config ?? {});
  }
  async loadCards() { return this.cards.map((c) => ({ ...c })); }
  async saveCards(cards: MemoryCard[]) { this.cards = cards.map((c) => ({ ...c })); }
  async loadSessions() { return this.sessions.map((s) => ({ ...s, turns: s.turns.map((t) => ({ ...t })) })); }
  async saveSessions(sessions: Session[]) { this.sessions = sessions.map((s) => ({ ...s, turns: s.turns.map((t) => ({ ...t })) })); }
  async loadConfig() { return mergeConfig({ ...DEFAULT_CONFIG }, this.config); }
  async saveConfig(config: AppConfig) { this.config = mergeConfig({ ...DEFAULT_CONFIG }, config); }
}

/** 桥接 kv 的最小接口（Kotlin Bridge / MockBridge 都满足）。 */
export interface BlobApi {
  getBlob(key: string): Promise<string | null>;
  putBlob(key: string, value: string): Promise<void>;
}

/** 设备端真实存储：JSON 文档落在桥接 kv（Kotlin=SQLite，Mock=localStorage）。 */
export class BlobStore implements MemoryStore {
  /** strict=true 用于真机启动：读取/解析失败必须中止，不能拿默认空数据覆盖 SQLite。 */
  constructor(private api: BlobApi, private strict = false) {}
  private async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await this.api.getBlob(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw) as T;
      if (this.strict && Array.isArray(fallback) && !Array.isArray(value)) {
        throw new Error(`存储数据 ${key} 不是数组`);
      }
      if (this.strict && fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback)
        && (value === null || typeof value !== 'object' || Array.isArray(value))) {
        throw new Error(`存储数据 ${key} 不是对象`);
      }
      return value;
    } catch (e) {
      if (this.strict) throw new Error(`读取设备存储 ${key} 失败：${(e as Error).message || e}`);
      return fallback;
    }
  }
  async loadCards() { return this.read<MemoryCard[]>(STORE_KEYS.cards, []); }
  async saveCards(cards: MemoryCard[]) { await this.api.putBlob(STORE_KEYS.cards, JSON.stringify(cards)); }
  async loadSessions() { return this.read<Session[]>(STORE_KEYS.sessions, []); }
  async saveSessions(sessions: Session[]) { await this.api.putBlob(STORE_KEYS.sessions, JSON.stringify(sessions)); }
  async loadConfig() { return mergeConfig({ ...DEFAULT_CONFIG }, await this.read<Partial<AppConfig>>(STORE_KEYS.config, {})); }
  async saveConfig(config: AppConfig) { await this.api.putBlob(STORE_KEYS.config, JSON.stringify(config)); }
}
