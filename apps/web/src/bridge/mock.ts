import type { AudioPayload, BridgeApi, BridgeEvent } from '@xiaoai/protocol';
import { bytesToB64 } from '@xiaoai/brain';
import { STORE_KEYS } from '@xiaoai/protocol';

const PREFIX = 'xiaoai:blob:';
type Listener = (e: BridgeEvent) => void;

function downsampleTo16k(input: Float32Array, rate: number): Int16Array {
  if (rate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
    return out;
  }
  const ratio = rate / 16000;
  const len = Math.floor(input.length / ratio);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s = input[i0] * (1 - frac) + (input[Math.min(i0 + 1, input.length - 1)] ?? 0) * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  return out;
}

/**
 * PC 模拟器桥：localStorage=kv，getUserMedia+能量VAD=麦克风，Audio 元素=播报。
 * 唤醒词在模拟器里用「模拟唤醒」按钮 / 管理端 wake 命令代替真实 KWS。
 */
export class MockBridge implements BridgeApi {
  private listeners = new Set<Listener>();
  private audio: HTMLAudioElement | null = null;
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private micMode: 'kws' | 'record' | null = null;
  private micStarting = false;
  private micGeneration = 0;
  private pcmChunks: Int16Array[] = [];
  private recordedB64: string | null = null;
  private vadActive = false;
  private silenceMs = 0;
  private speechMs = 0;
  private recordStartedAt = 0;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private volumeCache = 0.8;

  private dispatch(e: BridgeEvent) { for (const cb of [...this.listeners]) cb(e); }
  /** 模拟器专用：注入事件（如手动唤醒）。 */
  emit(e: BridgeEvent) { this.dispatch(e); }

  async getBlob(key: string) { return localStorage.getItem(PREFIX + key); }
  async putBlob(key: string, value: string) { localStorage.setItem(PREFIX + key, value); }

  private async loadVolume() {
    try {
      const raw = localStorage.getItem(PREFIX + STORE_KEYS.config);
      if (raw) this.volumeCache = JSON.parse(raw).volume ?? 0.8;
    } catch { /* 忽略 */ }
    return this.volumeCache;
  }

  async playAudio(src: AudioPayload) {
    this.stopAudioSync();
    const url = src.url || (src.data ? `data:${src.mime};base64,${src.data}` : '');
    if (!url) return;
    const el = new Audio(url);
    el.volume = await this.loadVolume();
    this.audio = el;
    await new Promise<void>((resolve) => {
      el.onended = () => resolve();
      el.onerror = () => resolve();
      el.play().catch(() => resolve());
    });
    if (this.audio === el) this.audio = null;
  }
  private stopAudioSync() {
    if (this.audio) { try { this.audio.pause(); } catch { /* 忽略 */ } this.audio = null; }
  }
  async stopAudio() { this.stopAudioSync(); }

  async startMic(mode: 'kws' | 'record') {
    // 与原生桥一致：切换采集模式不广播 off；off 只表示真正的启动失败。
    // generation 同时隔离被 stop/新 start 淘汰的异步 getUserMedia，避免旧流复活。
    this.releaseMic(false);
    const generation = ++this.micGeneration;
    this.micStarting = true;
    this.micMode = mode;
    let stream: MediaStream;
    try {
      const gum = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      let guard: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        guard = setTimeout(() => reject(new Error('麦克风权限未授予或设备不可用')), 8000);
      });
      try { stream = await Promise.race([gum, timeout]); }
      finally { if (guard) clearTimeout(guard); }
    } catch (e) {
      if (generation === this.micGeneration) {
        this.micStarting = false;
        this.micMode = null;
        this.dispatch({ type: 'mic', state: 'off' });
      }
      throw e;
    }
    if (generation !== this.micGeneration) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    try {
      this.micStream = stream;
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => {});
      this.source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    } catch (e) {
      this.releaseMic(true);
      throw e;
    }
    const rate = this.audioCtx.sampleRate;
    this.pcmChunks = [];
    this.recordedB64 = null;
    this.vadActive = false;
    this.silenceMs = 0;
    this.speechMs = 0;
    this.recordStartedAt = performance.now();
    if (mode === 'record') this.capTimer = setTimeout(() => this.finishRecording(), 16000);
    this.processor.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      this.dispatch({ type: 'audioLevel', level: Math.min(1, rms * 8) });
      if (this.micMode !== 'record') return;
      this.pcmChunks.push(downsampleTo16k(input, rate));
      const frameMs = (input.length / rate) * 1000;
      if (rms > 0.02) {
        this.speechMs += frameMs;
        this.silenceMs = 0;
        if (!this.vadActive && this.speechMs > 120) { this.vadActive = true; this.dispatch({ type: 'vad', state: 'start' }); }
      } else if (this.vadActive) {
        this.silenceMs += frameMs;
        if (this.silenceMs > 700) { this.finishRecording(); return; }
      }
      if (performance.now() - this.recordStartedAt > 15000) this.finishRecording();
    };
    this.source.connect(this.processor);
    this.processor.connect(this.audioCtx.destination);
    this.micStarting = false;
    this.dispatch({ type: 'mic', state: 'on' });
  }

  private concatPcm(): string {
    const total = this.pcmChunks.reduce((s, c) => s + c.length, 0);
    const all = new Int16Array(total);
    let off = 0;
    for (const c of this.pcmChunks) { all.set(c, off); off += c.length; }
    return bytesToB64(new Uint8Array(all.buffer));
  }

  private finishRecording() {
    if (this.micMode !== 'record') return;
    if (this.pcmChunks.length) this.recordedB64 = this.concatPcm();
    const hadVad = this.vadActive;
    void this.stopMic();
    if (hadVad || this.recordedB64) this.dispatch({ type: 'vad', state: 'end' });
  }

  private releaseMic(notifyFailure: boolean) {
    ++this.micGeneration;
    const failed = notifyFailure && this.micStarting;
    this.micStarting = false;
    if (this.capTimer) { clearTimeout(this.capTimer); this.capTimer = null; }
    this.micMode = null;
    if (this.processor) { try { this.processor.disconnect(); } catch { /* 忽略 */ } this.processor.onaudioprocess = null; this.processor = null; }
    if (this.source) { try { this.source.disconnect(); } catch { /* 忽略 */ } this.source = null; }
    if (this.micStream) { for (const t of this.micStream.getTracks()) t.stop(); this.micStream = null; }
    if (this.audioCtx) { void this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    if (failed) this.dispatch({ type: 'mic', state: 'off' });
  }

  async stopMic() {
    if (this.micMode === 'record' && this.pcmChunks.length && !this.recordedB64) {
      this.recordedB64 = this.concatPcm();
      this.dispatch({ type: 'vad', state: 'end' });
    }
    // 正常收尾由 vad end 驱动状态机；不能把成功停止误报成“麦克风启动失败”。
    this.releaseMic(false);
  }

  async readRecordedPcm() { return this.recordedB64; }
  async getDeviceInfo() { return { ip: location.hostname || '127.0.0.1', version: 'web-sim-0.2.0' }; }
  onEvent(cb: Listener) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
}

