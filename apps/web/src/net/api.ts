import {
  DEFAULT_CONFIG, REST, maskKey, uid,
  type AdminCommand, type AppConfig, type DeviceStatus, type MemoryCard, type Session,
} from '@xiaoai/protocol';
import { BlobStore, mergeConfig } from '@xiaoai/brain';
import { getBridge } from '../bridge';
import type { Link } from './link';
import { sha256Hex } from './sha256';

export interface AdminApi {
  readonly kind: 'mock' | 'rest';
  needsSetup(): Promise<boolean>;
  login(password: string): Promise<boolean>;
  setupPassword(password: string): Promise<boolean>;
  getConfig(): Promise<AppConfig>;
  saveConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  getCards(): Promise<MemoryCard[]>;
  upsertCard(card: MemoryCard): Promise<void>;
  deleteCard(id: string): Promise<void>;
  getSessions(): Promise<Session[]>;
  deleteSession(id: string): Promise<void>;
  getStatus(): Promise<DeviceStatus | null>;
  command(cmd: AdminCommand): void;
  uploadBundle(file: File): Promise<{ hash: string }>;
}

/** 掩码 key 不回填：补丁里带 **** 的字段视为「未修改」，丢弃。 */
export function stripMasked(patch: Partial<AppConfig>): Partial<AppConfig> {
  const out: Partial<AppConfig> = { ...patch };
  for (const k of ['llm', 'asr', 'tts', 'embedding'] as const) {
    const p = out[k];
    if (p && typeof p.apiKey === 'string' && p.apiKey.includes('****')) {
      const { apiKey, ...rest } = p;
      out[k] = { ...rest } as any;
      if (!Object.keys(rest).length) delete out[k];
    }
  }
  return out;
}

export function maskConfig(cfg: AppConfig): AppConfig {
  return {
    ...cfg,
    llm: { ...cfg.llm, apiKey: maskKey(cfg.llm.apiKey) },
    asr: { ...cfg.asr, apiKey: maskKey(cfg.asr.apiKey) },
    tts: { ...cfg.tts, apiKey: maskKey(cfg.tts.apiKey) },
    embedding: { ...cfg.embedding, apiKey: maskKey(cfg.embedding.apiKey) },
  };
}

/** PC 模拟器：与设备页共享 localStorage，直接读写 + 通过 Link 广播。 */
export class MockAdminApi implements AdminApi {
  readonly kind = 'mock' as const;
  private store = new BlobStore(getBridge({ allowMock: true }));
  constructor(private link: Link) {}
  async needsSetup() { return !(await this.store.loadConfig()).adminPasswordHash; }
  async login(password: string) {
    const cfg = await this.store.loadConfig();
    return !!cfg.adminPasswordHash && sha256Hex(password) === cfg.adminPasswordHash;
  }
  async setupPassword(password: string) {
    const cfg = await this.store.loadConfig();
    if (cfg.adminPasswordHash) return false;
    const next = { ...cfg, adminPasswordHash: sha256Hex(password), updatedAt: Date.now() };
    await this.store.saveConfig(next);
    this.link.send({ type: 'config', config: next });
    return true;
  }
  async getConfig() { return this.store.loadConfig(); }
  async saveConfig(patch: Partial<AppConfig>) {
    const cfg = mergeConfig(await this.store.loadConfig(), stripMasked(patch));
    cfg.updatedAt = Date.now();
    await this.store.saveConfig(cfg);
    this.link.send({ type: 'config', config: cfg });
    return cfg;
  }
  async getCards() { return this.store.loadCards(); }
  async upsertCard(card: MemoryCard) {
    const cards = await this.store.loadCards();
    const i = cards.findIndex((c) => c.id === card.id);
    if (i >= 0) cards[i] = card; else cards.push(card);
    await this.store.saveCards(cards);
    this.link.send({ type: 'memory', op: 'upsert', card });
  }
  async deleteCard(id: string) {
    await this.store.saveCards((await this.store.loadCards()).filter((c) => c.id !== id));
    this.link.send({ type: 'memory', op: 'delete', id });
  }
  async getSessions() { return this.store.loadSessions(); }
  async deleteSession(id: string) {
    await this.store.saveSessions((await this.store.loadSessions()).filter((s) => s.id !== id));
  }
  async getStatus() {
    try {
      const raw = await getBridge({ allowMock: true }).getBlob('status');
      return raw ? (JSON.parse(raw) as DeviceStatus) : null;
    } catch { return null; }
  }
  command(cmd: AdminCommand) { this.link.send({ type: 'cmd', cmd }); }
  async uploadBundle(file: File) {
    const hash = uid('bundle_');
    await getBridge({ allowMock: true }).putBlob('bundle-meta', JSON.stringify({ name: file.name, size: file.size, hash, ts: Date.now() }));
    return { hash };
  }
}

/** 真机：REST + token（/api/login 换取），密钥服务端掩码。 */
export class RestAdminApi implements AdminApi {
  readonly kind = 'rest' as const;
  private token: string | null = null;
  constructor(private base: string, private link: Link) {
    this.token = sessionStorage.getItem('xiaoai-token');
  }
  private async req(path: string, init?: RequestInit & { noAuth?: boolean }): Promise<any> {
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
    if (!init?.noAuth && this.token) headers.Authorization = `Bearer ${this.token}`;
    if (init?.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json';
    const res = await fetch(this.base + path, { ...init, headers });
    if (res.status === 401) { this.token = null; sessionStorage.removeItem('xiaoai-token'); throw new Error('未登录或登录已过期'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
  async needsSetup() {
    try {
      const j = await this.req(REST.config, { noAuth: true });
      return !!j.setupRequired;
    } catch { return false; }
  }
  async login(password: string) {
    try {
      const j = await this.req(REST.login, { method: 'POST', body: JSON.stringify({ password }), noAuth: true });
      if (j.token) { this.token = j.token; sessionStorage.setItem('xiaoai-token', j.token); return true; }
      return false;
    } catch { return false; }
  }
  async setupPassword(password: string) {
    try {
      const j = await this.req(REST.login, { method: 'POST', body: JSON.stringify({ password, setup: true }), noAuth: true });
      if (j.token) { this.token = j.token; sessionStorage.setItem('xiaoai-token', j.token); return true; }
      return false;
    } catch { return false; }
  }
  async getConfig() {
    const j = await this.req(REST.config);
    return mergeConfig({ ...DEFAULT_CONFIG }, j.config ?? j) as AppConfig;
  }
  async saveConfig(patch: Partial<AppConfig>) {
    const j = await this.req(REST.config, { method: 'PUT', body: JSON.stringify(stripMasked(patch)) });
    return mergeConfig({ ...DEFAULT_CONFIG }, j.config ?? j) as AppConfig;
  }
  async getCards() { return (await this.req(REST.memories)).cards ?? []; }
  async upsertCard(card: MemoryCard) { await this.req(REST.memories, { method: 'POST', body: JSON.stringify({ card }) }); }
  async deleteCard(id: string) { await this.req(`${REST.memories}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  async getSessions() { return (await this.req(REST.sessions)).sessions ?? []; }
  async deleteSession(id: string) { await this.req(`${REST.sessions}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  async getStatus() {
    try { return (await this.req(REST.status)).status ?? null; } catch { return null; }
  }
  command(cmd: AdminCommand) { this.link.send({ type: 'cmd', cmd }); }
  async uploadBundle(file: File) {
    const buf = await file.arrayBuffer();
    const headers: Record<string, string> = { 'Content-Type': 'application/zip' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(this.base + REST.update, { method: 'POST', headers, body: buf });
    if (!res.ok) throw new Error(`更新失败 HTTP ${res.status}`);
    return (await res.json()) as { hash: string };
  }
}
