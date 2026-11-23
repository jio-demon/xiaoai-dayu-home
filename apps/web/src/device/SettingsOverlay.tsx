import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { AppConfig } from '@xiaoai/protocol';
import { sha256Hex } from '../net/sha256';
import { searchCity, type GeoResult } from '../net/weather';

export interface SettingsProps {
  config: AppConfig;
  onSave: (patch: Partial<AppConfig>) => void;
  onClose: () => void;
  adminUrl: string;
  ip: string;
  version: string;
  onReload: () => void;
  /** 网页语音唤醒（仅 PC 模拟器提供；实机由原生 KWS 负责）。 */
  webWake?: { supported: boolean; on: boolean; onToggle: (on: boolean) => void };
}

/** 设备端设置面板：音量/亮度/唤醒/字幕/渲染模式 + 管理密码 + 管理页二维码。 */
export function SettingsOverlay(props: SettingsProps) {
  const { config, onSave, onClose, adminUrl, ip, version, onReload, webWake } = props;
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const firstRun = !config.adminPasswordHash;
  const [cityQuery, setCityQuery] = useState(config.city?.name ?? '');
  const [cityHits, setCityHits] = useState<GeoResult[]>([]);
  const [cityBusy, setCityBusy] = useState(false);
  const [cityMsg, setCityMsg] = useState('');

  const doSearchCity = async () => {
    if (!cityQuery.trim()) { setCityMsg('请输入城市名，如：广州'); return; }
    setCityBusy(true); setCityMsg(''); setCityHits([]);
    try {
      const hits = await searchCity(cityQuery);
      if (!hits.length) setCityMsg('没找到这个城市，试试中文名或加省份，如「杭州」');
      else setCityHits(hits);
    } catch (e: any) {
      setCityMsg(`搜索失败：${e?.message ?? e}（检查网络）`);
    } finally { setCityBusy(false); }
  };
  const pickCity = (r: GeoResult) => {
    onSave({ city: { name: r.name, lat: r.lat, lon: r.lon, province: r.province } });
    setCityHits([]); setCityQuery(r.name);
    setCityMsg(`已设置：${r.name}${r.admin1 ? `（${r.admin1}）` : ''}，窗外天气马上同步`);
  };

  const qr = useMemo(() => {
    if (!adminUrl) return '';
    try {
      const q = qrcode(0, 'M');
      q.addData(adminUrl);
      q.make();
      return q.createDataURL(4, 8);
    } catch { return ''; }
  }, [adminUrl]);

  const savePw = () => {
    if (newPw.length < 4) { setPwMsg('密码至少 4 位'); return; }
    if (!firstRun && sha256Hex(oldPw) !== config.adminPasswordHash) { setPwMsg('旧密码不正确'); return; }
    onSave({ adminPasswordHash: sha256Hex(newPw) });
    setOldPw(''); setNewPw('');
    setPwMsg(firstRun ? '密码已设置，手机扫码即可管理' : '密码已修改');
  };

  return (
    <div className="settings-mask" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>设置</h2>
          <button className="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="settings-body">
          <section>
            <label className="row">
              <span>音量 {Math.round(config.volume * 100)}%</span>
              <input type="range" min={0} max={1} step={0.05} value={config.volume}
                onChange={(e) => onSave({ volume: Number(e.target.value) })} />
            </label>
            <label className="row">
              <span>亮度 {Math.round(config.brightness * 100)}%</span>
              <input type="range" min={0.15} max={1} step={0.05} value={config.brightness}
                onChange={(e) => onSave({ brightness: Number(e.target.value) })} />
            </label>
            <label className="row">
              <span>语音唤醒</span>
              <input type="checkbox" checked={config.wakeEnabled}
                onChange={(e) => onSave({ wakeEnabled: e.target.checked })} />
            </label>
            <label className="row">
              <span>唤醒词</span>
              <input type="text" className="text-input" value={config.wakeWord} maxLength={8}
                onChange={(e) => onSave({ wakeWord: e.target.value || '大肥鱼' })} />
            </label>
            {webWake && (
              <>
                <label className="row">
                  <span>网页语音唤醒（实验）</span>
                  <input type="checkbox" disabled={!webWake.supported} checked={webWake.on}
                    onChange={(e) => webWake.onToggle(e.target.checked)} />
                </label>
                {!webWake.supported && <p className="dim">此浏览器不支持语音识别：PC 请用 Chrome/Edge；实机由原生唤醒引擎负责。</p>}
                {webWake.supported && webWake.on && <p className="dim">对着麦克风说唤醒词即可唤醒；仅保存在本浏览器，不随设备配置同步。</p>}
              </>
            )}
            <label className="row">
              <span>显示字幕</span>
              <input type="checkbox" checked={config.subtitles}
                onChange={(e) => onSave({ subtitles: e.target.checked })} />
            </label>
            <div className="row city-row">
              <span>城市天气{config.city ? `：${config.city.name}` : '（未设置）'}</span>
              <div className="city-search">
                <input type="text" className="text-input" placeholder="如：广州" value={cityQuery} maxLength={20}
                  onChange={(e) => setCityQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void doSearchCity(); }} />
                <button className="btn" disabled={cityBusy} onClick={() => void doSearchCity()}>{cityBusy ? '搜索中…' : '搜索'}</button>
                {config.city && <button className="btn" onClick={() => { onSave({ city: null }); setCityQuery(''); setCityHits([]); setCityMsg('已关闭城市天气'); }}>清除</button>}
              </div>
            </div>
            {cityHits.length > 0 && (
              <div className="city-hits">
                {cityHits.map((r, i) => (
                  <button key={i} className="btn city-hit" onClick={() => pickCity(r)}>
                    {r.name}{r.admin1 ? ` · ${r.admin1}` : ''}{r.country ? ` · ${r.country}` : ''}
                  </button>
                ))}
              </div>
            )}
            {cityMsg && <p className="dim">{cityMsg}</p>}
            <p className="dim">设置后：顶栏显示实时天气温度，窗外景色随当地天气变化（雨/雪/晴），房间光线随现实时间昼夜变化。国内城市即时可搜；国际城市需网络可达 Open-Meteo。</p>
            <label className="row">
              <span>渲染模式</span>
              <select value={config.renderMode} onChange={(e) => onSave({ renderMode: e.target.value as '3d' | '2.5d' })}>
                <option value="3d">3D 实时</option>
                <option value="2.5d">2.5D 省电</option>
              </select>
            </label>
          </section>
          <section>
            <h3>{firstRun ? '设置管理密码（首次）' : '修改管理密码'}</h3>
            {!firstRun && (
              <input type="password" className="text-input" placeholder="旧密码" value={oldPw}
                onChange={(e) => setOldPw(e.target.value)} />
            )}
            <input type="password" className="text-input" placeholder="新密码（≥4位）" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} />
            <button className="btn" onClick={savePw}>{firstRun ? '设置密码' : '修改密码'}</button>
            {pwMsg && <p className="pw-msg">{pwMsg}</p>}
          </section>
          <section className="admin-qr">
            <h3>手机管理页</h3>
            {qr && <img src={qr} alt="管理页二维码" width={120} height={120} />}
            <p className="mono">{adminUrl || '等待获取音响局域网地址…'}</p>
            <p className="dim">{adminUrl ? '同一 Wi-Fi 下扫码或输入网址，可配置 API、角色与记忆。' : '请确认音响已连接 Wi-Fi，再重新加载界面；127.0.0.1 仅供音响内部使用。'}</p>
          </section>
          <section>
            <p className="dim">版本 {version}</p>
            <button className="btn" onClick={onReload}>重新加载界面</button>
          </section>
        </div>
      </div>
    </div>
  );
}
