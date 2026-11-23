import { uid, type AppConfig, type AudioPayload, type MemoryCard, type MemoryStore, type Session, type Turn, type VoiceState } from '@xiaoai/protocol';
import { SentenceSplitter } from './sentence';
import { createProviders, hasKey, type ChatMessage, type Providers } from './providers';
import { draftsToCards, embedCards, extractMemories } from './memory/extract';
import { retrieveMemories } from './memory/retrieve';
import { consolidate } from './memory/consolidate';

export type OrchEvent =
  | { type: 'voice'; state: VoiceState; text?: string }
  | { type: 'speak'; audio: AudioPayload; text: string }
  | { type: 'turn'; sessionId: string; turn: Turn }
  | { type: 'session'; session: Session }
  | { type: 'memory'; op: 'upsert' | 'delete'; card?: MemoryCard; id?: string }
  | { type: 'error'; msg: string };

export interface OrchestratorOpts {
  providers: Providers;
  store: MemoryStore;
  emit: (e: OrchEvent) => void;
  now?: () => number;
  providerFactory?: (cfg: AppConfig) => Providers;
}

const SESSION_GAP = 30 * 60 * 1000; // 超过 30 分钟视为新会话
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 对话编排：召回 → 流式 LLM → 逐句 TTS → 会话整理 → 夜间巩固。 */
export class Orchestrator {
  private providers: Providers;
  private config: AppConfig | null = null;
  private cards: MemoryCard[] = [];
  private sessions: Session[] = [];
  private currentId: string | null = null;
  private aborted = false;
  private lastConsolidatedDay = '';
  private ready: Promise<void> | null = null;

  constructor(private o: OrchestratorOpts) { this.providers = o.providers; }
  private now() { return this.o.now ? this.o.now() : Date.now(); }
  private emit(e: OrchEvent) { this.o.emit(e); }

  init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        this.config = await this.o.store.loadConfig();
        this.cards = await this.o.store.loadCards();
        this.sessions = await this.o.store.loadSessions();
      })();
    }
    return this.ready;
  }

  get cfg(): AppConfig | null { return this.config; }

  async applyConfig(cfg: AppConfig): Promise<void> {
    await this.init();
    this.config = cfg;
    this.providers = this.o.providerFactory ? this.o.providerFactory(cfg) : createProviders(cfg);
    await this.o.store.saveConfig(cfg);
  }

  abort() { this.aborted = true; }

  /** 应用管理端的记忆变更：更新内部状态并持久化，不 emit（避免回环广播）。 */
  async applyRemoteMemory(op: 'upsert' | 'delete', card?: MemoryCard, id?: string): Promise<void> {
    await this.init();
    if (op === 'delete') {
      const key = id ?? card?.id;
      this.cards = this.cards.filter((c) => c.id !== key);
    } else if (card) {
      const i = this.cards.findIndex((c) => c.id === card.id);
      if (i >= 0) this.cards[i] = card; else this.cards.push(card);
    }
    await this.o.store.saveCards(this.cards);
  }

  /** 应用管理端/远端的会话整段更新：持久化，不 emit。 */
  async applyRemoteSession(session: Session): Promise<void> {
    await this.init();
    const i = this.sessions.findIndex((s) => s.id === session.id);
    if (i >= 0) this.sessions[i] = session; else this.sessions.push(session);
    await this.o.store.saveSessions(this.sessions);
  }

  async transcribe(pcm16kBase64: string): Promise<string> {
    await this.init();
    return this.providers.asr.transcribe(pcm16kBase64);
  }

  /** 直接播报一句（管理端试音 / 触屏彩蛋台词），不走 LLM。 */
  async say(text: string): Promise<void> {
    await this.init();
    const cfg = this.config!;
    this.aborted = false;
    this.emit({ type: 'voice', state: 'speaking', text });
    if (hasKey(cfg.tts)) {
      try {
        const audio = await this.providers.tts.synthesize(text, cfg.ttsVoice, cfg.ttsSpeed);
        if (!this.aborted) this.emit({ type: 'speak', audio, text });
      } catch (e) { this.emit({ type: 'error', msg: `TTS: ${(e as Error).message}` }); }
    }
    this.emit({ type: 'voice', state: 'idle' });
  }

  private ensureSession(now: number): Session {
    const cur = this.sessions.find((s) => s.id === this.currentId && !s.endedAt);
    if (cur) {
      const last = cur.turns[cur.turns.length - 1];
      if (!last || now - last.ts < SESSION_GAP) return cur;
      cur.endedAt = last.ts;
      void this.extractFor(cur);
      this.emit({ type: 'session', session: cur });
    }
    const s: Session = { id: uid('sess_'), startedAt: now, endedAt: null, summary: null, turns: [] };
    this.sessions.push(s);
    this.currentId = s.id;
    this.emit({ type: 'session', session: s });
    return s;
  }

  private async speakSentence(text: string): Promise<void> {
    const cfg = this.config!;
    this.emit({ type: 'voice', state: 'speaking', text });
    if (!hasKey(cfg.tts)) return;
    try {
      const audio = await this.providers.tts.synthesize(text, cfg.ttsVoice, cfg.ttsSpeed);
      if (!this.aborted) this.emit({ type: 'speak', audio, text });
    } catch (e) { this.emit({ type: 'error', msg: `TTS: ${(e as Error).message}` }); }
  }

  async handleUserText(text: string): Promise<void> {
    await this.init();
    const cfg = this.config!;
    const now = this.now();
    this.aborted = false;
    const sess = this.ensureSession(now);
    const userTurn: Turn = { role: 'user', text, ts: now };
    sess.turns.push(userTurn);
    this.emit({ type: 'turn', sessionId: sess.id, turn: userTurn });
    this.emit({ type: 'voice', state: 'thinking' });
    try {
      let qv: number[] | null = null;
      if (hasKey(cfg.embedding)) {
        try { qv = (await this.providers.embed.embed([text]))[0] ?? null; } catch { /* 无向量退化 */ }
      }
      const recall = retrieveMemories(this.cards, qv, cfg.memory, now);
      this.cards = recall.cards;
      await this.o.store.saveCards(this.cards);
      for (const c of recall.picked) this.emit({ type: 'memory', op: 'upsert', card: c });

      const timeLine = `现在时间：${new Date(now).toLocaleString('zh-CN', { hour12: false })}。`;
      const system = cfg.persona + '\n' + timeLine + (recall.block ? '\n\n' + recall.block : '');
      const history = sess.turns.slice(-7, -1);
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        ...history.map((t): ChatMessage => ({ role: t.role, content: t.text })),
        { role: 'user', content: text },
      ];

      const splitter = new SentenceSplitter();
      const pending: string[] = [];
      let streamDone = false;
      let full = '';
      const consumer = (async () => {
        while (!streamDone || pending.length) {
          if (this.aborted) { pending.length = 0; break; }
          const s = pending.shift();
          if (s === undefined) { await sleep(15); continue; }
          await this.speakSentence(s);
        }
      })();
      try {
        for await (const delta of this.providers.chat.stream(messages)) {
          if (this.aborted) break;
          full += delta;
          for (const s of splitter.push(delta)) pending.push(s);
        }
        const tail = splitter.flush();
        if (tail && !this.aborted) pending.push(tail);
      } finally { streamDone = true; }
      await consumer;

      const reply = full.trim();
      if (reply) {
        const t: Turn = { role: 'assistant', text: reply, ts: this.now() };
        sess.turns.push(t);
        this.emit({ type: 'turn', sessionId: sess.id, turn: t });
      }
      this.emit({ type: 'session', session: sess });
      await this.o.store.saveSessions(this.sessions);
    } catch (e) {
      this.emit({ type: 'error', msg: (e as Error).message });
    } finally {
      this.emit({ type: 'voice', state: 'idle' });
    }
  }

  private async extractFor(sess: Session): Promise<void> {
    const cfg = this.config!;
    if (!hasKey(cfg.llm) || sess.turns.length < 2) return;
    try {
      const { summary, cards } = await extractMemories(sess, this.providers.chat);
      sess.summary = summary;
      const drafts = draftsToCards(cards, sess.id, this.now());
      if (hasKey(cfg.embedding)) { try { await embedCards(drafts, this.providers.embed); } catch { /* 忽略 */ } }
      this.cards.push(...drafts);
      await this.o.store.saveCards(this.cards);
      for (const c of drafts) this.emit({ type: 'memory', op: 'upsert', card: c });
      this.emit({ type: 'session', session: sess });
      await this.o.store.saveSessions(this.sessions);
    } catch (e) { this.emit({ type: 'error', msg: `记忆整理: ${(e as Error).message}` }); }
  }

  /** 结束当前会话并整理记忆（空闲超时 / 手动）。 */
  async endSession(): Promise<void> {
    await this.init();
    const sess = this.sessions.find((s) => s.id === this.currentId);
    this.currentId = null;
    if (!sess || sess.endedAt || !sess.turns.length) return;
    sess.endedAt = this.now();
    this.emit({ type: 'session', session: sess });
    await this.o.store.saveSessions(this.sessions);
    await this.extractFor(sess);
  }

  /** 夜间巩固（每日一次守卫）：衰减/合并/归档，并补向量。 */
  async runNightlyConsolidation(force = false): Promise<void> {
    await this.init();
    const now = this.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (!force && this.lastConsolidatedDay === day) return;
    this.lastConsolidatedDay = day;
    const cfg = this.config!;
    const before = new Map(this.cards.map((c) => [c.id, c]));
    const result = await consolidate(this.cards, cfg.memory, {
      chat: hasKey(cfg.llm) ? this.providers.chat : null, now,
    });
    if (hasKey(cfg.embedding)) { try { await embedCards(result.cards, this.providers.embed); } catch { /* 忽略 */ } }
    this.cards = result.cards;
    await this.o.store.saveCards(this.cards);
    const after = new Map(this.cards.map((c) => [c.id, c]));
    for (const id of result.mergedIds) this.emit({ type: 'memory', op: 'delete', id });
    for (const [id, c] of after) {
      const old = before.get(id);
      if (!old || old.strength !== c.strength || old.archived !== c.archived || old.text !== c.text || old.room !== c.room) {
        this.emit({ type: 'memory', op: 'upsert', card: c });
      }
    }
  }
}

