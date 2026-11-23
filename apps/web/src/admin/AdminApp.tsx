import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppConfig, DeviceStatus, MemoryCard, Session, WsMessage } from '@xiaoai/protocol';
import { hasNative, isDeviceShellPage, waitForNative } from '../bridge';
import { MockLink, WsLink, type Link } from '../net/link';
import { MockAdminApi, RestAdminApi, maskConfig, type AdminApi } from '../net/api';
import { Login } from './Login';
import { ConfigPage } from './ConfigPage';
import { PersonaPage } from './PersonaPage';
import { MemoriesPage } from './MemoriesPage';
import { PalaceMap } from './PalaceMap';
import { HistoryPage } from './HistoryPage';
import { StatusPage } from './StatusPage';
import { UpdatePage } from './UpdatePage';

export interface AdminCtx {
  api: AdminApi;
  link: Link;
  config: AppConfig | null;
  cards: MemoryCard[];
  sessions: Session[];
  status: DeviceStatus | null;
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>;
  upsertCard: (card: MemoryCard) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AdminCtx | null>(null);
export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('AdminCtx 缺失');
  return v;
}

type PageId = 'status' | 'config' | 'persona' | 'memories' | 'palace' | 'history' | 'update';
const NAV: { id: PageId; name: string; icon: string }[] = [
  { id: 'status', name: '状态与控制', icon: '📡' },
  { id: 'config', name: '模型与 API', icon: '🔑' },
  { id: 'persona', name: '角色设定', icon: '🐋' },
  { id: 'palace', name: '记忆宫殿', icon: '🏠' },
  { id: 'memories', name: '记忆卡片', icon: '🗂' },
  { id: 'history', name: '对话历史', icon: '💬' },
  { id: 'update', name: '固件更新', icon: '📦' },
];

/** 管理端外壳：连接选择（PC 模拟 / 真机 IP）→ 登录 → 侧边栏 + 页面。 */
export function AdminApp() {
  const shellPage = isDeviceShellPage();
  const [native, setNative] = useState(hasNative);
  const [shellError, setShellError] = useState(false);
  // 真机薄壳伺服的页面（http://<设备IP>:8080）自动连本机，避免落进「PC 模拟」把配置存到浏览器本地
  const autoTarget = (() => {
    if (typeof location === 'undefined') return '';
    const h = location.hostname;
    if (location.protocol === 'http:' && /^\d+\.\d+\.\d+\.\d+$/.test(h) && h !== '127.0.0.1' && h !== 'localhost') return h;
    return '';
  })();
  const [target, setTarget] = useState(() => autoTarget || localStorage.getItem('xiaoai-admin-target') || '');
  const [targetInput, setTargetInput] = useState(target);
  const [conn, setConn] = useState<{ api: AdminApi; link: Link } | null>(null);
  const [authed, setAuthed] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [page, setPage] = useState<PageId>('status');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const authKey = `xiaoai-admin-auth:${target || 'local'}`;

  useEffect(() => {
    if (!shellPage) return;
    let dead = false;
    void waitForNative().then((ready) => {
      if (dead) return;
      setNative(ready);
      setShellError(!ready);
    });
    return () => { dead = true; };
  }, [shellPage]);

  useEffect(() => {
    // 手机通过局域网 IP 打开管理页时使用 REST，不依赖 WebView 的 JS 桥。
    // 音响自己的回环页则必须等原生桥出现，不能冒充 PC 或假装已连接。
    if (shellPage && !native) { setConn(null); return; }
    let link: Link; let api: AdminApi;
    if (shellPage || autoTarget) { link = new WsLink(`ws://${location.host}/ws`, 'admin'); api = new RestAdminApi(location.origin, link); }
    else if (target) { link = new WsLink(`ws://${target}:8080/ws`, 'admin'); api = new RestAdminApi(`http://${target}:8080`, link); }
    else { link = new MockLink(); api = new MockAdminApi(link); }
    setConn({ api, link });
    setAuthed(false); setConfig(null); setStatus(null);
    return () => link.close();
  }, [target, native, shellPage, autoTarget]);

  const refresh = useCallback(async () => {
    if (!conn) return;
    const cfg = await conn.api.getConfig();
    setConfig(maskConfig(cfg));
    setCards(await conn.api.getCards());
    setSessions(await conn.api.getSessions());
    setStatus(await conn.api.getStatus());
  }, [conn]);

  useEffect(() => {
    if (!conn) return;
    let dead = false;
    void (async () => {
      try {
        const setup = await conn.api.needsSetup();
        if (dead) return;
        setNeedsSetup(setup);
        if (!setup && sessionStorage.getItem(authKey) === '1') {
          await refresh();
          if (!dead) setAuthed(true);
        }
      } catch {
        sessionStorage.removeItem(authKey);
        if (!dead) setAuthed(false);
      }
    })();
    const un = conn.link.subscribe((m: WsMessage) => {
      if (m.type === 'config') setConfig(maskConfig(m.config));
      else if (m.type === 'memory') {
        setCards((prev) => m.op === 'delete' ? prev.filter((c) => c.id !== m.id)
          : m.card ? [...prev.filter((c) => c.id !== m.card!.id), m.card] : prev);
      } else if (m.type === 'session') {
        setSessions((prev) => [...prev.filter((s) => s.id !== m.session.id), m.session]);
      } else if (m.type === 'status') setStatus(m.status);
    });
    return () => { dead = true; un(); };
  }, [conn, refresh, authKey]);

  const ctx = useMemo<AdminCtx | null>(() => {
    if (!conn) return null;
    return {
      api: conn.api, link: conn.link, config, cards, sessions, status, refresh,
      saveConfig: async (patch) => { setConfig(maskConfig(await conn.api.saveConfig(patch))); },
      upsertCard: async (card) => {
        await conn.api.upsertCard(card);
        setCards((prev) => [...prev.filter((c) => c.id !== card.id), card]);
      },
      deleteCard: async (id) => { await conn.api.deleteCard(id); setCards((prev) => prev.filter((c) => c.id !== id)); },
      deleteSession: async (id) => { await conn.api.deleteSession(id); setSessions((prev) => prev.filter((s) => s.id !== id)); },
    };
  }, [conn, config, cards, sessions, status, refresh]);

  const connect = () => {
    const ip = targetInput.trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
    localStorage.setItem('xiaoai-admin-target', ip);
    setTarget(ip);
  };
  const backToMock = () => { localStorage.removeItem('xiaoai-admin-target'); setTarget(autoTarget); setTargetInput(autoTarget); };
  const logout = () => { sessionStorage.removeItem(authKey); sessionStorage.removeItem('xiaoai-token'); setAuthed(false); };

  const onLogin = async (password: string, setup: boolean): Promise<boolean> => {
    if (!conn) return false;
    const ok = setup ? await conn.api.setupPassword(password) : await conn.api.login(password);
    if (ok) {
      sessionStorage.setItem(authKey, '1');
      setNeedsSetup(false);
      await refresh();
      setAuthed(true);
    }
    return ok;
  };

  return (
    <div className="admin-root">
      <header className="admin-top">
        <h1>🐋 大肥鱼之家 · 管理</h1>
        <div className="admin-conn">
          {shellPage ? <span className={native ? 'tag tag-on' : 'tag'}>{native ? '本机设备' : shellError ? '原生服务未连接' : '连接设备中…'}</span> : target ? (
            <>
              <span className="tag tag-on">{autoTarget ? '设备管理页（真机）' : `已连接 ${target}`}</span>
              {!autoTarget && <button className="btn btn-sm" onClick={backToMock}>返回 PC 模拟</button>}
            </>
          ) : (
            <>
              <span className="tag">PC 模拟模式</span>
              <input className="text-input ip-input" placeholder="设备 IP，如 192.168.1.50"
                value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()} />
              <button className="btn btn-sm" onClick={connect}>连接真机</button>
            </>
          )}
          {authed && <button className="btn btn-sm" onClick={logout}>退出登录</button>}
        </div>
      </header>
      {!conn ? <div className="admin-loading">{shellError ? <><p>音响管理页未连接到原生服务，请返回主界面重新加载。</p><button className="btn" onClick={() => location.reload()}>重试</button></> : '连接中…'}</div>
        : !authed ? <Login needsSetup={needsSetup} onLogin={onLogin} />
        : ctx && (
          <Ctx.Provider value={ctx}>
            <div className="admin-main">
              <nav className="admin-nav">
                {NAV.map((n) => (
                  <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
                    <span className="nav-icon">{n.icon}</span>{n.name}
                  </button>
                ))}
              </nav>
              <main className="admin-page">
                {page === 'status' && <StatusPage />}
                {page === 'config' && <ConfigPage />}
                {page === 'persona' && <PersonaPage />}
                {page === 'palace' && <PalaceMap />}
                {page === 'memories' && <MemoriesPage />}
                {page === 'history' && <HistoryPage />}
                {page === 'update' && <UpdatePage />}
              </main>
            </div>
          </Ctx.Provider>
        )}
    </div>
  );
}
