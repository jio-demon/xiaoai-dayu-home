import { useCallback, useEffect, useRef, useState } from 'react';
import type { BridgeApi, VoiceState } from '@xiaoai/protocol';
import type { Orchestrator } from '@xiaoai/brain';

export interface VoiceFlowOpts {
  bridge: BridgeApi;
  getOrch: () => Orchestrator | null;
  wakeEnabled: boolean;
  native: boolean;
  onBargeIn: () => void;
  onMicError?: (msg: string) => void;
}

/** Chrome61 fetch 不支持 AbortSignal：用 Promise.race 兜底超时，避免识别挂起卡死状态机。 */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** 语音链路：KWS 唤醒 → 录音(VAD) → ASR → 编排器；麦克风按钮三态切换。 */
export function useVoiceFlow(opts: VoiceFlowOpts) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);
  const stateRef = useRef<VoiceState>('idle');
  const busyRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadStartedRef = useRef(false);
  const wakePendingRef = useRef(false);
  const finishRecordRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setState = useCallback((s: VoiceState) => { stateRef.current = s; setVoiceState(s); }, []);

  const startRecord = useCallback(async () => {
    const { bridge, getOrch, onBargeIn } = optsRef.current;
    if (busyRef.current) return;
    if (stateRef.current === 'speaking' || stateRef.current === 'thinking') { onBargeIn(); }
    busyRef.current = true;
    vadStartedRef.current = false;
    // 唤醒触发的录音：注入/回声等场景 VAD start 可能丢失，收尾时仍应尝试 ASR
    wakePendingRef.current = false;
    setRecording(true);
    setState('listening');
    try { await bridge.startMic('record'); }
    catch (e) { busyRef.current = false; setRecording(false); setState('idle'); optsRef.current.onMicError?.((e as Error).message || '麦克风不可用'); return; }
    // JS 侧录音看门狗：原生收尾事件丢失/采集线程异常时，20s 后强制收尾回 idle
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      if (stateRef.current === 'listening' && busyRef.current) void finishRecordRef.current(true);
    }, 20000);
  }, [setState]);

  const finishRecord = useCallback(async (force = false) => {
    if (!busyRef.current) return;
    // 原生没检测到说话就收尾（6s 无人声超时）→ 直接回 idle，不浪费一次云端 ASR
    if (!force && !vadStartedRef.current && !wakePendingRef.current) {
      busyRef.current = false;
      setRecording(false);
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      try { await optsRef.current.bridge.stopMic(); } catch { /* 忽略 */ }
      setLevel(0);
      setState('idle');
      return;
    }
    busyRef.current = false;
    vadStartedRef.current = false;
    wakePendingRef.current = false;
    setRecording(false);
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    const { bridge, getOrch } = optsRef.current;
    let pcm: string | null = null;
    try {
      pcm = await bridge.readRecordedPcm();
      await bridge.stopMic();
    } catch { /* 桥异常也要回到 idle */ }
    setLevel(0);
    const orch = getOrch();
    if (!pcm || !orch) { setState('idle'); return; }
    // PCM16@16k base64 ≈ 42.7 字符/ms；<250ms 的碎片直接丢弃，省一次云端 ASR
    if (pcm.length < 10700) { setState('idle'); return; }
    setState('thinking'); // 识别期间给「思考中」反馈，避免看起来卡死
    try {
      const text = await withTimeout(orch.transcribe(pcm), 25000, '语音识别超时');
      if (text.trim()) await orch.handleUserText(text);
      else setState('idle');
    } catch (e) {
      optsRef.current.onMicError?.(`语音识别失败：${(e as Error).message || e}`);
      setState('idle');
    }
  }, [setState]);

  finishRecordRef.current = finishRecord;

  useEffect(() => {
    const un = opts.bridge.onEvent((e) => {
      if (e.type === 'kws') {
        if (optsRef.current.wakeEnabled && stateRef.current === 'idle') { wakePendingRef.current = true; void startRecord(); }
      } else if (e.type === 'vad' && e.state === 'start') {
        vadStartedRef.current = true;
      } else if (e.type === 'vad' && e.state === 'end') {
        void finishRecord();
      } else if (e.type === 'mic' && e.state === 'off') {
        // 原生初始化失败：立即复位，别卡在「在听」
        if (busyRef.current) { busyRef.current = false; setRecording(false); setState('idle'); optsRef.current.onMicError?.('麦克风启动失败'); }
      } else if (e.type === 'audioLevel') {
        setLevel(e.level);
      }
    });
    return un;
  }, [opts.bridge, startRecord, finishRecord]);

  // 真机：空闲时保持 KWS 常开
  useEffect(() => {
    if (opts.native && opts.wakeEnabled && voiceState === 'idle' && !recording) {
      void opts.bridge.startMic('kws').catch(() => {});
    }
  }, [opts.native, opts.wakeEnabled, voiceState, recording, opts.bridge]);

  const tapMic = useCallback(() => {
    const s = stateRef.current;
    if (s === 'idle') void startRecord();
    else if (s === 'listening') {
      // stopMic 会触发原生 finalize → vad end → finishRecord；加兜底防事件丢失卡在「在听」
      void optsRef.current.bridge.stopMic().catch(() => {});
      setTimeout(() => { if (stateRef.current === 'listening') void finishRecord(true); }, 800);
    }
    else if (s === 'speaking' || s === 'thinking') {
      optsRef.current.onBargeIn();
      setState('idle');
    }
  }, [startRecord, setState, finishRecord]);

  return { voiceState, setVoiceState: setState, level, recording, tapMic, startRecord };
}

