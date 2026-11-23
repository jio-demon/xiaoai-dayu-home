import type { AudioPayload, BridgeApi, BridgeEvent } from '@xiaoai/protocol';

/** Kotlin @JavascriptInterface 注入的原生桥（同步方法，这里包成 Promise）。 */
export interface NativeRaw {
  getBlob(key: string): string | null;
  putBlob(key: string, value: string): void;
  playAudio(json: string): void;
  stopAudio(): void;
  startMic(mode: string): void;
  stopMic(): void;
  readRecordedPcm(): string | null;
  getDeviceInfo(): string;
}

declare global {
  interface Window {
    XiaoAiBridge?: NativeRaw;
    __onNativeEvent?: (json: string) => void;
    __audioDone?: (cbId: number) => void;
  }
}

export function hasNative(): boolean {
  return typeof window !== 'undefined' && !!window.XiaoAiBridge;
}

/** 薄壳固定从自己的回环服务加载主界面；这只表示“设备页”，不证明原生桥已注入。 */
export function isDeviceShellPage(): boolean {
  return typeof location !== 'undefined'
    && location.protocol === 'http:'
    && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)
    && location.port === '8080';
}

/**
 * 给旧 WebView 的 addJavascriptInterface 留一个短暂初始化窗口。
 * 超时只表示“未连接”，绝不据此切换到 PC 模拟存储。
 */
export function waitForNative(timeoutMs = 3000): Promise<boolean> {
  if (hasNative()) return Promise.resolve(true);
  if (!isDeviceShellPage()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (hasNative() || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(hasNative());
      }
    }, 50);
  });
}

export class NativeBridge implements BridgeApi {
  private listeners = new Set<(e: BridgeEvent) => void>();
  private audioCbs = new Map<number, () => void>();
  private nextCb = 1;

  constructor() {
    window.__onNativeEvent = (json: string) => {
      try {
        const e = JSON.parse(json) as BridgeEvent;
        for (const cb of [...this.listeners]) cb(e);
      } catch { /* 忽略坏消息 */ }
    };
    window.__audioDone = (id: number) => {
      const r = this.audioCbs.get(id);
      if (r) { this.audioCbs.delete(id); r(); }
    };
  }

  private raw(): NativeRaw {
    if (!window.XiaoAiBridge) throw new Error('原生桥不可用');
    return window.XiaoAiBridge;
  }

  async getBlob(key: string) { return this.raw().getBlob(key) ?? null; }
  async putBlob(key: string, value: string) { this.raw().putBlob(key, value); }

  async playAudio(src: AudioPayload) {
    const id = this.nextCb++;
    const done = new Promise<void>((resolve) => this.audioCbs.set(id, resolve));
    // cb 字段是桥接实现细节：Kotlin 播放完成/停止时回调 window.__audioDone(id)
    this.raw().playAudio(JSON.stringify({ ...src, cb: id }));
    await done;
  }
  async stopAudio() { this.raw().stopAudio(); }
  async startMic(mode: 'kws' | 'record') { this.raw().startMic(mode); }
  async stopMic() { this.raw().stopMic(); }
  async readRecordedPcm() { return this.raw().readRecordedPcm() ?? null; }
  async getDeviceInfo() {
    const info = JSON.parse(this.raw().getDeviceInfo()) as Partial<{ ip: string; version: string }>;
    if (!info || typeof info.ip !== 'string' || typeof info.version !== 'string') {
      throw new Error('原生设备信息格式无效');
    }
    return { ip: info.ip, version: info.version };
  }
  onEvent(cb: (e: BridgeEvent) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
}
