// Chrome61 缺失的 Web API 垫片：AbortController/AbortSignal（core-js 只管 JS 内建，不管 DOM API）。
// 旧 WebView 上 fetch 会忽略 signal（无法真正中断），但超时逻辑用 Promise.race 兜底即可。
class AbortSignalShim {
  aborted = false;
  onabort: ((this: AbortSignalShim, ev: any) => any) | null = null;
  private listeners: Array<(ev: any) => void> = [];
  addEventListener(type: string, cb: (ev: any) => void) { if (type === 'abort') this.listeners.push(cb); }
  removeEventListener(type: string, cb: (ev: any) => void) {
    if (type !== 'abort') return;
    const i = this.listeners.indexOf(cb); if (i >= 0) this.listeners.splice(i, 1);
  }
  dispatchEvent(ev: any): boolean {
    if (ev && ev.type === 'abort') {
      this.aborted = true;
      try { this.onabort?.call(this, ev); } catch { /* 忽略 */ }
      for (const cb of [...this.listeners]) { try { cb(ev); } catch { /* 忽略 */ } }
    }
    return true;
  }
  throwIfAborted() { if (this.aborted) throw new DOMException('Aborted', 'AbortError'); }
}
class AbortControllerShim {
  signal = new AbortSignalShim();
  abort() { if (!this.signal.aborted) this.signal.dispatchEvent({ type: 'abort' }); }
}
const g = globalThis as any;
if (typeof g.AbortController === 'undefined') {
  g.AbortController = AbortControllerShim;
  g.AbortSignal = AbortSignalShim;
}
export {};
