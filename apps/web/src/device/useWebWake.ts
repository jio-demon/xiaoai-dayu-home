import { useCallback, useEffect, useRef, useState } from 'react';
import { matchWakeWord } from './wakeMatch';

/** 浏览器是否支持 Web Speech API（Chrome/Edge 支持；LX04 旧 WebView 不支持，实机走原生 KWS）。 */
export function webWakeSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface WebWakeOpts {
  /** 用户开关 && 配置唤醒开关（仅网页模拟器生效）。 */
  enabled: boolean;
  /** 设备空闲（不在录音/思考/播报）时才聆听，避免录进自己的播报。 */
  active: boolean;
  wakeWord: string;
  onWake: () => void;
  /** fatal=true 时应关闭开关（权限被拒/无麦克风/语音服务不可用）。 */
  onError: (msg: string, fatal: boolean) => void;
  /** 最近听到的文字（调试提示用，含未命中唤醒词的内容）。 */
  onHeard?: (text: string) => void;
}

/**
 * 实验性网页语音唤醒：Web Speech API 持续识别，命中唤醒词即触发 kws。
 * 只在 idle 时聆听；会话中自动暂停，结束后自动恢复；标签页隐藏时暂停。
 * Chrome 的 continuous 模式经常提前 onend / 静默失败，这里做看门狗与快速重启。
 */
export function useWebWake(opts: WebWakeOpts) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(true);
  const netErrRef = useRef(0);
  const startedAtRef = useRef(0);
  const gotResultRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clearTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
  };

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimers();
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      r.onresult = null; r.onerror = null; r.onend = null; r.onstart = null;
      try { r.abort(); } catch { /* 忽略 */ }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor || recRef.current) return;
    stoppedRef.current = false;
    let rec: any;
    try { rec = new Ctor(); } catch { return; }
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    startedAtRef.current = Date.now();
    gotResultRef.current = false;
    rec.onstart = () => { if (recRef.current === rec) setListening(true); };
    rec.onresult = (ev: any) => {
      gotResultRef.current = true;
      let text = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      if (text.trim()) optsRef.current.onHeard?.(text.trim());
      if (matchWakeWord(text, optsRef.current.wakeWord)) {
        netErrRef.current = 0;
        stop();
        optsRef.current.onWake();
      }
    };
    rec.onerror = (ev: any) => {
      const err = ev?.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        stop(); optsRef.current.onError('浏览器拒绝了麦克风权限，网页语音唤醒已关闭', true);
      } else if (err === 'audio-capture') {
        stop(); optsRef.current.onError('未检测到麦克风，网页语音唤醒已关闭', true);
      } else if (err === 'network') {
        netErrRef.current++;
        if (netErrRef.current >= 3) {
          stop();
          optsRef.current.onError('浏览器语音服务不可用（Chrome 需连通 Google 服务，可改用 Edge），网页语音唤醒已关闭', true);
        }
      }
      // no-speech / aborted 交给 onend 自动重启
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recRef.current = null;
      setListening(false);
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (!stoppedRef.current && optsRef.current.enabled && optsRef.current.active && !document.hidden) {
        // Chrome 常秒退（no-speech / 静默失败）：短间隔重启保持聆听
        const lived = Date.now() - startedAtRef.current;
        const delay = lived < 1500 ? 250 : 400;
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (optsRef.current.enabled && optsRef.current.active && !document.hidden) start();
        }, delay);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      // 看门狗：8 秒还没 onstart/结果就强制重启（部分环境 start 后无任何回调）
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (recRef.current === rec && !gotResultRef.current) {
          try { rec.abort(); } catch { /* onend 会重启 */ }
        }
      }, 8000);
    } catch { recRef.current = null; setListening(false); }
  }, [stop]);

  useEffect(() => {
    if (opts.enabled && opts.active && !document.hidden) start();
    else stop();
  }, [opts.enabled, opts.active, start, stop]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stop();
      else if (optsRef.current.enabled && optsRef.current.active) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [start, stop]);

  useEffect(() => stop, [stop]);

  return { listening, supported: webWakeSupported() };
}
