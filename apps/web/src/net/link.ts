import type { WsMessage } from '@xiaoai/protocol';
import { hasNative } from '../bridge';

/** 设备 ↔ 管理端实时通道：真机=WebSocket(/ws)，PC 模拟=BroadcastChannel 跨标签页。 */
export interface Link {
  readonly kind: 'mock' | 'ws';
  send(m: WsMessage): void;
  subscribe(cb: (m: WsMessage) => void): () => void;
  close(): void;
}

export class MockLink implements Link {
  readonly kind = 'mock' as const;
  private channel: BroadcastChannel | null = null;
  private subs = new Set<(m: WsMessage) => void>();
  constructor() {
    try {
      this.channel = new BroadcastChannel('xiaoai-link');
      this.channel.onmessage = (ev) => {
        const m = ev.data as WsMessage;
        for (const cb of [...this.subs]) cb(m);
      };
    } catch { /* 极旧浏览器无 BroadcastChannel：单标签页内仍可用 */ }
  }
  send(m: WsMessage) { this.channel?.postMessage(m); }
  subscribe(cb: (m: WsMessage) => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  close() { this.channel?.close(); this.channel = null; }
}

export class WsLink implements Link {
  readonly kind = 'ws' as const;
  private ws: WebSocket | null = null;
  private subs = new Set<(m: WsMessage) => void>();
  private queue: WsMessage[] = [];
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private url: string, private role: 'device' | 'admin') { this.connect(); }
  private connect() {
    if (this.closed) return;
    try { this.ws = new WebSocket(this.url); } catch { this.scheduleRetry(); return; }
    this.ws.onopen = () => {
      this.retry = 0;
      this.ws?.send(JSON.stringify({ type: 'hello', role: this.role } satisfies WsMessage));
      for (const m of this.queue.splice(0)) this.ws?.send(JSON.stringify(m));
    };
    this.ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data)) as WsMessage;
        for (const cb of [...this.subs]) cb(m);
      } catch { /* 忽略 */ }
    };
    this.ws.onclose = () => this.scheduleRetry();
    this.ws.onerror = () => { try { this.ws?.close(); } catch { /* 忽略 */ } };
  }
  private scheduleRetry() {
    if (this.closed) return;
    this.retry = Math.min(this.retry + 1, 6);
    this.timer = setTimeout(() => this.connect(), 500 * this.retry);
  }
  send(m: WsMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else { this.queue.push(m); if (this.queue.length > 50) this.queue.shift(); }
  }
  subscribe(cb: (m: WsMessage) => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  close() { this.closed = true; if (this.timer) clearTimeout(this.timer); try { this.ws?.close(); } catch { /* 忽略 */ } }
}

export function createLink(role: 'device' | 'admin', wsUrl?: string): Link {
  if (wsUrl) return new WsLink(wsUrl, role);
  if (hasNative()) return new WsLink(`ws://${location.host}/ws`, role);
  return new MockLink();
}
