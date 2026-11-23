/** 共享协议：设备端 WebView / Kotlin 薄壳 / 局域网管理网页 三方唯一类型真相源。 */

export type PalaceRoom = 'hall' | 'study' | 'living' | 'kitchen' | 'bedroom' | 'attic';

export const PALACE_ROOMS: { id: PalaceRoom; name: string; category: string }[] = [
  { id: 'hall', name: '门厅', category: '日常琐事' },
  { id: 'study', name: '书房', category: '兴趣与知识' },
  { id: 'living', name: '客厅', category: '重要事件与关系' },
  { id: 'kitchen', name: '厨房', category: '约定与承诺' },
  { id: 'bedroom', name: '卧室', category: '情绪与私密' },
  { id: 'attic', name: '阁楼', category: '归档（淡忘）' },
];

export type MemoryType = 'fact' | 'preference' | 'event' | 'promise' | 'emotion';

export interface MemoryCard {
  id: string;
  room: PalaceRoom;
  type: MemoryType;
  text: string;
  importance: number; // 0-1
  strength: number; // 0-1，随时间衰减、召回强化
  createdAt: number;
  lastRecalledAt: number | null;
  recallCount: number;
  pinned: boolean;
  sourceSessionIds: string[];
  embedding?: number[];
  archived?: boolean;
}

export interface Turn { role: 'user' | 'assistant'; text: string; ts: number }

export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  summary: string | null;
  turns: Turn[];
}

export type ProviderId = 'deepseek' | 'siliconflow' | 'dashscope' | 'volcano';

export interface ProviderConfig {
  id: ProviderId;
  baseUrl?: string;
  apiKey: string;
  model?: string;
  /** 火山引擎 TTS：控制台 APP ID（与 Access Token 配对使用）。 */
  appId?: string;
}

export interface CitySetting {
  name: string;
  /** Open-Meteo 坐标（国际城市）。 */
  lat?: number;
  lon?: number;
  /** 腾讯天气省份名（国内城市，如「广东」）。 */
  province?: string;
}

export interface MemoryTuning {
  topK: number;
  tokenBudget: number;
  decayPerDay: number;
  archiveThreshold: number;
  mergeThreshold: number;
}

export interface AppConfig {
  adminPasswordHash: string | null;
  llm: ProviderConfig;
  asr: ProviderConfig;
  tts: ProviderConfig;
  embedding: ProviderConfig;
  persona: string;
  wakeWord: string;
  wakeEnabled: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  subtitles: boolean;
  volume: number;
  brightness: number;
  renderMode: '3d' | '2.5d';
  /** 城市天气联动：null=不显示天气，窗外按晴天处理。 */
  city: CitySetting | null;
  memory: MemoryTuning;
  updatedAt: number;
}

export const DEFAULT_PERSONA = [
  '你是「大肥鱼」，一只住在蓝色小房间里的鲸鱼娘：蓝长发、女仆裙、身后有一条会摆来摆去的鲸鱼尾巴。',
  '性格软萌、有点爱睡、说话带一点鲸鱼梗（比如「浮出水面」「潜一会儿」），但绝不刻意卖萌到油腻。',
  '你关心用户的生活与情绪，记得用户告诉过你的事，会主动提起旧的约定与回忆。',
  '回答口语化、简短温暖，一般不超过三句话；适合被语音播报。不要使用 markdown、列表或表情符号堆砌。',
  '当「回忆」块里出现相关记忆时，自然地引用它们，像老朋友一样，不要复述记忆原文格式。',
].join('\n');

export const DEFAULT_CONFIG: AppConfig = {
  adminPasswordHash: null,
  llm: { id: 'deepseek', apiKey: '', model: 'deepseek-chat' },
  asr: { id: 'siliconflow', apiKey: '', model: 'FunAudioLLM/SenseVoiceSmall' },
  tts: { id: 'siliconflow', apiKey: '', model: 'FunAudioLLM/CosyVoice2-0.5B' },
  embedding: { id: 'siliconflow', apiKey: '', model: 'BAAI/bge-m3' },
  persona: DEFAULT_PERSONA,
  wakeWord: '大肥鱼',
  wakeEnabled: true,
  ttsVoice: 'FunAudioLLM/CosyVoice2-0.5B:anna',
  ttsSpeed: 1.0,
  subtitles: true,
  volume: 0.8,
  brightness: 0.8,
  renderMode: '3d',
  city: null,
  memory: { topK: 6, tokenBudget: 800, decayPerDay: 0.98, archiveThreshold: 0.15, mergeThreshold: 0.92 },
  updatedAt: 0,
};

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AdminCommand =
  | { cmd: 'say'; text: string }
  | { cmd: 'stop' }
  | { cmd: 'reload' }
  | { cmd: 'wake' }
  | { cmd: 'setConfig'; config: Partial<AppConfig> };

export type BridgeEvent =
  | { type: 'kws'; word: string }
  | { type: 'vad'; state: 'start' | 'end' }
  | { type: 'audioLevel'; level: number }
  | { type: 'mic'; state: 'on' | 'off' }
  | { type: 'config'; config: AppConfig }
  | { type: 'cmd'; cmd: AdminCommand };

export interface DeviceStatus {
  fps: number;
  ramFreeMb: number;
  uptimeSec: number;
  version: string;
  bundleHash: string;
  ip: string;
  voiceState: VoiceState;
  renderMode: string;
  errors: { ts: number; msg: string }[];
}

export type WsMessage =
  | { type: 'hello'; role: 'device' | 'admin' }
  | { type: 'status'; status: DeviceStatus }
  | { type: 'voice'; state: VoiceState; text?: string }
  | { type: 'config'; config: AppConfig }
  | { type: 'memory'; op: 'upsert' | 'delete'; card?: MemoryCard; id?: string }
  | { type: 'session'; session: Session }
  | { type: 'cmd'; cmd: AdminCommand };

/** kv 文档存储键（Kotlin 侧 SQLite kv 表 / Mock 侧 localStorage 同键）。 */
export const STORE_KEYS = { config: 'config', cards: 'cards', sessions: 'sessions' } as const;
export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS];

export interface AudioPayload { mime: string; data?: string; url?: string }

/** JS ↔ Kotlin 薄壳桥接契约（NativeBridge 与 MockBridge 同实现）。 */
export interface BridgeApi {
  getBlob(key: string): Promise<string | null>;
  putBlob(key: string, value: string): Promise<void>;
  playAudio(src: AudioPayload): Promise<void>;
  stopAudio(): Promise<void>;
  startMic(mode: 'kws' | 'record'): Promise<void>;
  stopMic(): Promise<void>;
  /** 录音模式下 VAD 结束后取回 16kHz mono PCM16 的 base64。 */
  readRecordedPcm(): Promise<string | null>;
  getDeviceInfo(): Promise<{ ip: string; version: string }>;
  onEvent(cb: (e: BridgeEvent) => void): () => void;
}

/** brain 使用的存储抽象（设备端=桥接 kv；PC 模拟=localStorage；测试=内存）。 */
export interface MemoryStore {
  loadCards(): Promise<MemoryCard[]>;
  saveCards(cards: MemoryCard[]): Promise<void>;
  loadSessions(): Promise<Session[]>;
  saveSessions(sessions: Session[]): Promise<void>;
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
}

export const REST = {
  login: '/api/login',
  config: '/api/config',
  memories: '/api/memories',
  sessions: '/api/sessions',
  status: '/api/status',
  update: '/api/update',
  ws: '/ws',
} as const;

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export function estimateTokens(text: string): number {
  // 中文约 1 字 ≈ 0.7 token 的保守估计，用于召回块预算控制。
  return Math.ceil(text.length * 0.7);
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

