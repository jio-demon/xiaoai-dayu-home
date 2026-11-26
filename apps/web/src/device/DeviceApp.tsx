import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mergeConfig, BlobStore, Orchestrator, createProviders,
  type OrchEvent,
} from '@xiaoai/brain';
import { DEFAULT_CONFIG, type AppConfig, type DeviceStatus, type WsMessage } from '@xiaoai/protocol';
import { getBridge, getMockBridge, isDeviceShellPage, usesMockBridge, waitForNative } from '../bridge';
import { createLink, type Link } from '../net/link';
import { SceneManager } from '../scene/sceneManager';
import { useVoiceFlow } from './useVoiceFlow';
import { useWebWake } from './useWebWake';
import { VoiceRing } from './VoiceRing';
import { Subtitles } from './Subtitles';
import { SettingsOverlay } from './SettingsOverlay';
import { pickFlavor } from './flavor';
import { watchWeather } from '../net/weather';
import { CONDITION_ICON, CONDITION_LABEL, type WeatherNow } from '../scene/sky';

const VERSION = '0.2.0';
const IDLE_END_MS = 90 * 1000;

/** 未初始化时只订阅事件，不访问存储/麦克风；设备页不会提前创建模拟桥。 */
const UNREADY_BRIDGE = {
  onEvent: () => () => {},
};

/** 设备主界面：3D 房间 + 语音环 + 字幕 + 设置，编排器/场景/链路在此汇合。 */
export function DeviceApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orchRef = useRef<Orchestrator | null>(null);
  const sceneRef = useRef<SceneManager | null>(null);
  const linkRef = useRef<Link | null>(null);
  const cfgRef = useRef<AppConfig>({ ...DEFAULT_CONFIG });
  const playGenRef = useRef(0);
  const playChainRef = useRef<Promise<void>>(Promise.resolve());
  const errorsRef = useRef<{ ts: number; msg: string }[]>([]);
  const fpsRef = useRef(60);
  const infoRef = useRef({ ip: '0.0.0.0', version: VERSION });
  const lastActivityRef = useRef(Date.now());
  const idleDoneRef = useRef(true);
  const startedAtRef = useRef(Date.now());
  const voiceStateRef = useRef('idle');
  const renderModeRef = useRef('3d');
  const bridgeReadyRef = useRef(false);

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<'connecting' | 'native' | 'mock'>('connecting');
  const [bootError, setBootError] = useState<string | null>(null);
  const mockMode = runtimeMode === 'mock';
  const nativeMode = runtimeMode === 'native';
  const [subtitle, setSubtitle] = useState<{ text: string; speaker: 'user' | 'ai' } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webWakeOn, setWebWakeOn] = useState(() => {
    try { return localStorage.getItem('xiaoai-web-wake') === '1'; } catch { return false; }
  });
  const [heard, setHeard] = useState('');
  const heardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clock, setClock] = useState('');
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const weatherRef = useRef<WeatherNow | null>(null);
  weatherRef.current = weather;
  const [ip, setIp] = useState('0.0.0.0');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const bargeIn = useCallback(() => {
    playGenRef.current++;
    orchRef.current?.abort();
    if (bridgeReadyRef.current) void getBridge({ allowMock: true }).stopAudio().catch(() => {});
  }, []);

  const voice = useVoiceFlow({
    bridge: bridgeReadyRef.current ? getBridge({ allowMock: true }) : UNREADY_BRIDGE as any,
    getOrch: () => orchRef.current,
    wakeEnabled: config?.wakeEnabled ?? true,
    native: nativeMode,
    onBargeIn: bargeIn,
    onMicError: (msg) => showToast(msg),
  });
  voiceStateRef.current = voice.voiceState;

  // 语音状态 → 场景角色（唤醒聆听时她会走到镜头左侧；此前只有编排器事件会同步，
  // 手动点麦克风/唤醒后尚未进编排器的 listening 阶段漏掉了）
  useEffect(() => { sceneRef.current?.setCharacterState(voice.voiceState); }, [voice.voiceState]);

  // 城市天气：轮询 Open-Meteo；实况到达 → 窗外雨雪/房间光照联动 + 顶栏温度。
  // 依赖 city 本身：设置城市后 watcher 立即重建并拉取（不用等 30s tick）。
  const weatherErrShown = useRef(0);
  const cityKey = config?.city ? (config.city.province ?? '') + '|' + config.city.name + '|' + (config.city.lat ?? '') : '';
  useEffect(() => {
    if (!config) return;
    const watcher = watchWeather({
      getCity: () => cfgRef.current.city,
      onUpdate: (w) => {
        setWeather(w);
        sceneRef.current?.setWeather(w?.condition ?? 'clear');
      },
      onError: (msg) => {
        // 断网/接口失败不打扰：10 分钟最多提示一次
        if (Date.now() - weatherErrShown.current > 10 * 60 * 1000) {
          weatherErrShown.current = Date.now();
          showToast(`天气更新失败：${msg}（窗外保持上次状态）`);
        }
      },
    });
    return () => watcher.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config !== null, cityKey]);
  useEffect(() => { sceneRef.current?.setWeather(weather?.condition ?? 'clear'); }, [weather?.condition]);

  const toggleWebWake = useCallback((on: boolean) => {
    setWebWakeOn(on);
    try { localStorage.setItem('xiaoai-web-wake', on ? '1' : '0'); } catch { /* 忽略 */ }
    if (on) showToast(`网页语音唤醒已开启：试着说「${cfgRef.current.wakeWord}」（需允许麦克风）`);
  }, [showToast]);

  // 实验性：浏览器语音唤醒（仅 PC 模拟器；实机由原生 KWS 负责）
  const webWake = useWebWake({
    enabled: webWakeOn && (config?.wakeEnabled ?? true) && mockMode,
    active: voice.voiceState === 'idle' && !voice.recording,
    wakeWord: config?.wakeWord ?? '大肥鱼',
    onWake: () => getMockBridge()?.emit({ type: 'kws', word: cfgRef.current.wakeWord }),
    onError: (msg, fatal) => { showToast(msg); if (fatal) toggleWebWake(false); },
    onHeard: (text) => {
      setHeard(text.slice(-24));
      if (heardTimer.current) clearTimeout(heardTimer.current);
      heardTimer.current = setTimeout(() => setHeard(''), 3000);
    },
  });

  const applyFull = useCallback(async (cfg: AppConfig, broadcast: boolean) => {
    cfgRef.current = cfg;
    setConfig(cfg);
    renderModeRef.current = cfg.renderMode;
    sceneRef.current?.setMode(cfg.renderMode);
    await orchRef.current?.applyConfig(cfg);
    if (broadcast) linkRef.current?.send({ type: 'config', config: cfg });
  }, []);

  const savePatch = useCallback((patch: Partial<AppConfig>) => {
    const next = mergeConfig(cfgRef.current, patch);
    next.updatedAt = Date.now();
    void applyFull(next, true);
  }, [applyFull]);
  const savePatchRef = useRef(savePatch);
  savePatchRef.current = savePatch;

  const handleOrchEvent = useCallback((e: OrchEvent) => {
    lastActivityRef.current = Date.now();
    idleDoneRef.current = false;
    const link = linkRef.current;
    if (e.type === 'voice') {
      voice.setVoiceState(e.state);
      sceneRef.current?.setCharacterState(e.state);
      if (e.text && cfgRef.current.subtitles) setSubtitle({ text: e.text, speaker: 'ai' });
      link?.send({ type: 'voice', state: e.state, text: e.text });
    } else if (e.type === 'speak') {
      const gen = playGenRef.current;
      playChainRef.current = playChainRef.current.then(async () => {
        if (gen !== playGenRef.current) return;
        try { await getBridge({ allowMock: true }).playAudio(e.audio); } catch { /* 播放失败忽略 */ }
      });
    } else if (e.type === 'turn') {
      if (e.turn.role === 'user' && cfgRef.current.subtitles) setSubtitle({ text: e.turn.text, speaker: 'user' });
    } else if (e.type === 'session') {
      link?.send({ type: 'session', session: e.session });
    } else if (e.type === 'memory') {
      link?.send({ type: 'memory', op: e.op, card: e.card, id: e.id });
    } else if (e.type === 'error') {
      errorsRef.current.push({ ts: Date.now(), msg: e.msg });
      if (errorsRef.current.length > 20) errorsRef.current.shift();
      showToast(e.msg);
    }
  }, [showToast, voice.setVoiceState]);
  const handleEventRef = useRef(handleOrchEvent);
  handleEventRef.current = handleOrchEvent;

  // 一次性初始化：存储 → 编排器 → 链路 → 设备信息
  useEffect(() => {
    let disposed = false;
    let bridge: ReturnType<typeof getBridge> | null = null;
    let store: BlobStore | null = null;
    let link: Link | null = null;
    let unLink: (() => void) | null = null;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let idleTimer: ReturnType<typeof setInterval> | null = null;
    let nightTimer: ReturnType<typeof setInterval> | null = null;
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    const initialize = async () => {
      try {
        // 等待旧 WebView 完成原生对象注入，再决定使用 SQLite/KWS 还是浏览器模拟。
        const native = await waitForNative();
        if (disposed) return;
        if (!native && isDeviceShellPage()) {
          setRuntimeMode('connecting');
          setBootError('音响界面未连接到原生服务（XiaoAiBridge）。请重新加载；若仍出现，请更新薄壳 APK。');
          return;
        }
        bridge = getBridge({ allowMock: !native });
        bridgeReadyRef.current = true;
        store = new BlobStore(bridge, native);
        link = createLink('device');
        linkRef.current = link;
        setRuntimeMode(usesMockBridge() ? 'mock' : 'native');
        unLink = link.subscribe((m: WsMessage) => {
          if (m.type === 'cmd') {
            const c = m.cmd;
            if (c.cmd === 'say') void orchRef.current?.say(c.text);
            else if (c.cmd === 'stop') { bargeIn(); voice.setVoiceState('idle'); }
            else if (c.cmd === 'reload') location.reload();
            else if (c.cmd === 'wake') void voice.startRecord();
            else if (c.cmd === 'setConfig') void applyFull(mergeConfig(cfgRef.current, c.config), false);
          } else if (m.type === 'config') {
            void applyFull(m.config, false);
          } else if (m.type === 'memory') {
            void orchRef.current?.applyRemoteMemory(m.op, m.card, m.id);
          } else if (m.type === 'session') {
            void orchRef.current?.applyRemoteSession(m.session);
          }
        });
        // 真机读取失败必须停下，不能把默认空配置写回覆盖已有 SQLite 数据。
        const cfg = await store.loadConfig();
        if (disposed) return;
        const orch = new Orchestrator({
          providers: createProviders(cfg), store,
          emit: (e) => handleEventRef.current(e),
          providerFactory: createProviders,
        });
        orchRef.current = orch;
        await orch.init();
        if (disposed) return;
        cfgRef.current = cfg;
        renderModeRef.current = cfg.renderMode;
        setConfig(cfg);
        const info = await bridge.getDeviceInfo();
        if (disposed) return;
        infoRef.current = { ip: info.ip || '0.0.0.0', version: info.version || VERSION };
        setIp(infoRef.current.ip);
      } catch (e) {
        if (!disposed) {
          bridgeReadyRef.current = false;
          orchRef.current = null;
          link?.close();
          linkRef.current = null;
          setRuntimeMode('connecting');
          setBootError(`设备界面启动失败：${(e as Error).message || e}`);
        }
      }
    };
    void initialize();

    // 状态上报：kv + 链路，每 5 秒
    statusTimer = setInterval(() => {
      if (!bridgeReadyRef.current || !bridge || !link) return;
      const status: DeviceStatus = {
        fps: fpsRef.current,
        ramFreeMb: (performance as any).memory
          ? Math.round(((performance as any).memory.jsHeapSizeLimit - (performance as any).memory.usedJSHeapSize) / 1048576)
          : -1,
        uptimeSec: Math.round((Date.now() - startedAtRef.current) / 1000),
        version: infoRef.current.version,
        bundleHash: (window as any).__bundleHash ?? 'dev',
        ip: infoRef.current.ip,
        voiceState: voiceStateRef.current as DeviceStatus['voiceState'],
        renderMode: renderModeRef.current,
        errors: errorsRef.current.slice(-10),
      };
      void bridge.putBlob('status', JSON.stringify(status)).catch(() => {});
      link.send({ type: 'status', status });
    }, 5000);

    // 空闲 90 秒结束会话并整理记忆
    idleTimer = setInterval(() => {
      if (!idleDoneRef.current && voiceStateRef.current === 'idle' && Date.now() - lastActivityRef.current > IDLE_END_MS) {
        idleDoneRef.current = true;
        void orchRef.current?.endSession();
      }
    }, 10000);

    // 夜间 4 点记忆巩固（编排器内有每日一次守卫）
    nightTimer = setInterval(() => {
      if (new Date().getHours() === 4) void orchRef.current?.runNightlyConsolidation();
    }, 60000);

    clockTimer = setInterval(() => {
      setClock(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 1000);
    setClock(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));

    return () => {
      disposed = true;
      bridgeReadyRef.current = false;
      unLink?.();
      if (statusTimer) clearInterval(statusTimer);
      if (idleTimer) clearInterval(idleTimer);
      if (nightTimer) clearInterval(nightTimer);
      if (clockTimer) clearInterval(clockTimer);
      link?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 场景：配置就绪后创建一次
  useEffect(() => {
    if (!config || sceneRef.current || !canvasRef.current) return;
    const scene = new SceneManager(canvasRef.current, {
      mode: cfgRef.current.renderMode,
      onTap: (name) => {
        lastActivityRef.current = Date.now();
        idleDoneRef.current = false;
        if (name === 'character') sceneRef.current?.pet();
        const h = new Date().getHours();
        void orchRef.current?.say(pickFlavor(name, { weather: cfgRef.current.city ? weatherRef.current?.condition : undefined, night: h >= 19 || h < 6 }));
      },
      onFps: (f) => { fpsRef.current = f; },
      onDegrade: () => {
        savePatchRef.current({ renderMode: '2.5d' });
        showToast('性能不足，已自动切换 2.5D 模式');
      },
    });
    sceneRef.current = scene;
    scene.setWeather(weather?.condition ?? 'clear');
    if (import.meta.env.DEV) {
      (window as any).__scene = scene;
      (window as any).__setWeather = (c: string) => scene.setWeather(c as any);
    }
    return () => { /* 场景与页面同生命周期，卸载时释放 */ };
  }, [config !== null, showToast]);

  useEffect(() => () => { sceneRef.current?.dispose(); sceneRef.current = null; }, []);

  const validIp = /^(?!0\.0\.0\.0$)(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)
    && ip.split('.').every((part) => Number(part) <= 255);
  const adminUrl = validIp ? `http://${ip}:8080/#/admin` : '';

  return (
    <div className="device-root">
      <canvas ref={canvasRef} className="scene-canvas" />
      <div className="brightness-mask" style={{ opacity: config ? (1 - config.brightness) * 0.65 : 0 }} />
      <div className="topbar">
        <span className="clock">{clock}</span>
        {config?.city && weather && (
          <span className="topbar-weather" title={`${config.city.name} ${CONDITION_LABEL[weather.condition]} ${weather.temperature}°C`}>
            {config.city.name} {CONDITION_ICON[weather.condition]} {Math.round(weather.temperature)}°
          </span>
        )}
        <span className="topbar-ip">{validIp ? ip : mockMode ? 'PC 模拟' : bootError ? '设备连接异常' : '连接设备中…'}</span>
        <button className="gear" disabled={!config} onClick={() => setSettingsOpen(true)} aria-label="设置">⚙</button>
      </div>
      {config && !config.adminPasswordHash && (
        <div className="first-run-hint" onClick={() => setSettingsOpen(true)}>
          首次使用：点右上角 ⚙ 设置管理密码与 API
        </div>
      )}
      {subtitle && config?.subtitles && <Subtitles text={subtitle.text} speaker={subtitle.speaker} />}
      {webWake.listening && (
        <div className="web-wake-hint">
          🎙 正在聆听「{config?.wakeWord ?? '大肥鱼'}」…
          {heard && <span className="web-wake-heard">听到：{heard}</span>}
        </div>
      )}
      <div className="voice-dock">
        {mockMode && (
          <button className="btn mock-wake" onClick={() => getMockBridge()?.emit({ type: 'kws', word: config?.wakeWord ?? '大肥鱼' })}>
            模拟唤醒
          </button>
        )}
        {(nativeMode || mockMode) && (
          <VoiceRing state={voice.voiceState} level={voice.level} wakeWord={config?.wakeWord ?? '大肥鱼'} onTap={voice.tapMic} />
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {bootError && <div className="boot-error" role="alert">{bootError} <button className="btn btn-sm" onClick={() => location.reload()}>重试</button></div>}
      {settingsOpen && config && (
        <SettingsOverlay
          config={config} onSave={savePatch} onClose={() => setSettingsOpen(false)}
          adminUrl={adminUrl} ip={validIp ? ip : '0.0.0.0'} version={infoRef.current.version}
          onReload={() => location.reload()}
          webWake={mockMode ? { supported: webWake.supported, on: webWakeOn, onToggle: toggleWebWake } : undefined}
        />
      )}
    </div>
  );
}




