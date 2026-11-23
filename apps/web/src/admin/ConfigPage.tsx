import { useEffect, useState } from 'react';
import { DEFAULT_CONFIG, type AppConfig, type MemoryTuning, type ProviderConfig, type ProviderId } from '@xiaoai/protocol';
import { testProvider, VOLCANO_VOICES, type ConnTestResult } from '@xiaoai/brain';
import { useAdmin } from './AdminApp';
import { searchCity, type GeoResult } from '../net/weather';

const LLM_IDS: ProviderId[] = ['deepseek', 'dashscope'];
const SF_IDS: ProviderId[] = ['siliconflow', 'dashscope'];
const TTS_IDS: ProviderId[] = ['volcano', 'siliconflow', 'dashscope'];
const VOICES = ['alex', 'anna', 'bella', 'claire', 'diana', 'david'];
const TTS_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';

type Section = 'llm' | 'asr' | 'tts' | 'embedding';
const SECTIONS: { id: Section; name: string; desc: string; ids: ProviderId[] }[] = [
  { id: 'llm', name: '大模型（对话）', desc: '推荐 DeepSeek deepseek-chat', ids: LLM_IDS },
  { id: 'asr', name: '语音识别 ASR', desc: '推荐硅基流动 SenseVoiceSmall', ids: SF_IDS },
  { id: 'tts', name: '语音合成 TTS', desc: '推荐火山引擎大模型音色（活泼自然）；硅基流动 CosyVoice2 备选', ids: TTS_IDS },
  { id: 'embedding', name: '向量 Embedding', desc: '推荐硅基流动 BGE-M3（记忆召回）', ids: SF_IDS },
];

/** 模型与 API 配置：只提交改动字段；掩码 key 视为未修改。 */
export function ConfigPage() {
  const { config, saveConfig, api } = useAdmin();
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<Section | null>(null);
  const [testRes, setTestRes] = useState<Partial<Record<Section, ConnTestResult>>>({});
  const [cityQuery, setCityQuery] = useState('');
  const [cityHits, setCityHits] = useState<GeoResult[]>([]);
  const [cityBusy, setCityBusy] = useState(false);
  const [cityMsg, setCityMsg] = useState('');
  useEffect(() => { if (config) setDraft(JSON.parse(JSON.stringify(config))); }, [config]);
  // 旧配置迁移：moon/mars 系 1.0 音色 ID 在 2.0 资源下不可用，自动换成 uranus 2.0 对应音色
  useEffect(() => {
    if (!draft || draft.tts.id !== 'volcano') return;
    const v = draft.ttsVoice;
    if (/_moon_bigtts|_mars_bigtts/.test(v)) {
      const migrated = v.replace(/_moon_bigtts|_mars_bigtts/, '_uranus_bigtts');
      const model = draft.tts.model === 'volcano_tts' && !draft.tts.appId ? 'seed-tts-2.0' : draft.tts.model;
      setDraft({ ...draft, ttsVoice: migrated, tts: { ...draft.tts, model } });
    }
  }, [draft?.tts.id, draft?.ttsVoice]);
  if (!draft || !config) return <div className="admin-loading">加载配置…</div>;

  const setProv = (s: Section, patch: Partial<ProviderConfig>) =>
    setDraft({ ...draft, [s]: { ...draft[s], ...patch } });
  const setMem = (patch: Partial<MemoryTuning>) => setDraft({ ...draft, memory: { ...draft.memory, ...patch } });
  const doSearchCity = async () => {
    if (!cityQuery.trim()) { setCityMsg('请输入城市名'); return; }
    setCityBusy(true); setCityMsg(''); setCityHits([]);
    try {
      const hits = await searchCity(cityQuery);
      if (!hits.length) setCityMsg('没找到该城市，试试中文名');
      else setCityHits(hits);
    } catch (e: any) { setCityMsg(`搜索失败：${e?.message ?? e}`); }
    finally { setCityBusy(false); }
  };

  const buildPatch = (): Partial<AppConfig> => {
    const patch: Partial<AppConfig> = {};
    for (const s of ['llm', 'asr', 'tts', 'embedding'] as Section[]) {
      const a = draft[s]; const b = config[s];
      const p: Partial<ProviderConfig> = {};
      if (a.id !== b.id) p.id = a.id;
      if ((a.baseUrl ?? '') !== (b.baseUrl ?? '')) p.baseUrl = a.baseUrl;
      if (a.apiKey !== b.apiKey && !a.apiKey.includes('****')) p.apiKey = a.apiKey;
      if ((a.model ?? '') !== (b.model ?? '')) p.model = a.model;
      if ((a.appId ?? '') !== (b.appId ?? '')) p.appId = a.appId;
      if (Object.keys(p).length) patch[s] = { ...a, ...p };
    }
    if (draft.ttsVoice !== config.ttsVoice) patch.ttsVoice = draft.ttsVoice;
    if (draft.ttsSpeed !== config.ttsSpeed) patch.ttsSpeed = draft.ttsSpeed;
    if (draft.wakeEnabled !== config.wakeEnabled) patch.wakeEnabled = draft.wakeEnabled;
    if (draft.wakeWord !== config.wakeWord) patch.wakeWord = draft.wakeWord;
    if (draft.subtitles !== config.subtitles) patch.subtitles = draft.subtitles;
    if (JSON.stringify(draft.city ?? null) !== JSON.stringify(config.city ?? null)) patch.city = draft.city ?? null;
    const mem: Partial<MemoryTuning> = {};
    for (const k of Object.keys(draft.memory) as (keyof MemoryTuning)[]) {
      if (draft.memory[k] !== config.memory[k]) (mem as any)[k] = draft.memory[k];
    }
    if (Object.keys(mem).length) patch.memory = { ...draft.memory };
    return patch;
  };

  const save = async () => {
    const patch = buildPatch();
    if (!Object.keys(patch).length) { setMsg('没有改动'); return; }
    setBusy(true); setMsg('');
    try { await saveConfig(patch); setMsg('已保存并同步到设备 ✓'); }
    catch (e) { setMsg(`保存失败：${(e as Error).message}`); }
    setBusy(false);
  };

  const runTest = async (s: Section) => {
    setTesting(s);
    setTestRes((r) => ({ ...r, [s]: undefined }));
    let cfg = { ...draft[s] };
    if (cfg.apiKey.includes('****')) {
      // 掩码 key：PC 模拟从本地存储取真实 key；真机密钥不出设备，需重新输入完整 key 再测
      if (api.kind === 'mock') {
        try {
          const raw = localStorage.getItem('xiaoai:blob:config');
          if (raw) {
            const saved = JSON.parse(raw)[s];
            cfg = { ...cfg, apiKey: saved?.apiKey ?? '', appId: cfg.appId || saved?.appId };
          }
        } catch { /* 忽略 */ }
      }
      if (cfg.apiKey.includes('****')) {
        setTestRes((r) => ({ ...r, [s]: { ok: false, ms: 0, detail: '真机密钥保存在设备端不回传：请在输入框重新粘贴完整 API Key 后再测试（测完可不保存）' } }));
        setTesting(null);
        return;
      }
    }
    const res = await testProvider(s, cfg, { ...draft, [s]: cfg });
    setTestRes((r) => ({ ...r, [s]: res }));
    setTesting(null);
  };

  const isVolcano = draft.tts.id === 'volcano';
  const voiceName = draft.ttsVoice.split(':').pop() ?? (isVolcano ? VOLCANO_VOICES[0].id : 'anna');
  const switchTtsProvider = (id: ProviderId) => {
    // 切服务商时同步换默认模型与音色，避免残留不兼容值
    if (id === 'volcano') {
      setDraft({ ...draft, tts: { ...draft.tts, id, model: 'seed-tts-2.0' }, ttsVoice: `volcano:${VOLCANO_VOICES[0].id}` });
    } else if (id === 'siliconflow') {
      setDraft({ ...draft, tts: { ...draft.tts, id, model: TTS_MODEL }, ttsVoice: `${TTS_MODEL}:anna` });
    } else {
      setDraft({ ...draft, tts: { ...draft.tts, id, model: 'qwen3-tts-flash' }, ttsVoice: 'Cherry' });
    }
  };

  return (
    <div className="page">
      <h2>模型与 API</h2>
      <p className="dim">密钥只保存在设备本地；显示为掩码（如 sk-1****abcd）表示未修改，重新输入才会覆盖。</p>
      {SECTIONS.map((s) => (
        <section key={s.id} className="card">
          <h3>{s.name}</h3>
          <p className="dim">{s.desc}</p>
          <div className="form-grid">
            <label>服务商
              <select value={draft[s.id].id} onChange={(e) => s.id === 'tts' ? switchTtsProvider(e.target.value as ProviderId) : setProv(s.id, { id: e.target.value as ProviderId })}>
                {s.ids.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
            <label>模型
              <input className="text-input" value={draft[s.id].model ?? ''} onChange={(e) => setProv(s.id, { model: e.target.value })} />
            </label>
            <label>Base URL（留空用官方）
              <input className="text-input" placeholder="https://api..." value={draft[s.id].baseUrl ?? ''} onChange={(e) => setProv(s.id, { baseUrl: e.target.value })} />
            </label>
            <label>API Key
              <input className="text-input" type="password" placeholder="未设置" value={draft[s.id].apiKey} onChange={(e) => setProv(s.id, { apiKey: e.target.value })} />
            </label>
            {s.id === 'tts' && draft.tts.id === 'volcano' && (
              <label>APP ID（仅旧版语音技术应用需要；新版留空）
                <input className="text-input" placeholder="新版豆包语音控制台无需填写" value={draft.tts.appId ?? ''} onChange={(e) => setProv('tts', { appId: e.target.value.trim() })} />
              </label>
            )}
          </div>
          {s.id === 'tts' && draft.tts.id === 'volcano' && (
            <p className="dim">新版豆包语音控制台（推荐）：登录后打开「开通管理」页 console.volcengine.com/speech/new/setting/activate?projectName=default → 找到「豆包语音合成模型2.0」点【试用】（免费 2 万字符/半年，试用期全部音色可用；只有「开通」按钮则为按量计费约 2.8 元/万字符）→ 「API 管理」页 console.volcengine.com/speech/new/setting/apikeys?projectName=default 创建并复制 API Key 填上方框即可，APP ID 留空，注意项目与开通试用的项目一致。「模型」框 = Resource-Id：seed-tts-2.0（2.0 音色）或 volc.service_type.10029（1.0 大模型音色）。旧版「语音技术」应用则填 APP ID + Access Token，模型框填 volcano_tts。</p>
          )}
          <div className="conn-test-line">
            <button className="btn btn-sm" disabled={testing !== null} onClick={() => void runTest(s.id)}>
              {testing === s.id ? '测试中…' : '连通测试'}
            </button>
            {testRes[s.id] && (
              <span className={testRes[s.id]!.ok ? 'conn-ok' : 'conn-fail'}>
                {testRes[s.id]!.ok ? '✓ ' : '✗ '}{testRes[s.id]!.detail}（{testRes[s.id]!.ms} ms）
              </span>
            )}
          </div>
        </section>
      ))}
      <section className="card">
        <h3>声音与唤醒</h3>
        <div className="form-grid">
          <label>音色{isVolcano ? '（火山大模型）' : draft.tts.id === 'dashscope' ? '（Qwen-TTS）' : '（CosyVoice2）'}
            {isVolcano ? (
              <select value={voiceName} onChange={(e) => setDraft({ ...draft, ttsVoice: `volcano:${e.target.value}` })}>
                {VOLCANO_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                {!VOLCANO_VOICES.some((v) => v.id === voiceName) && <option value={voiceName}>{voiceName}</option>}
              </select>
            ) : draft.tts.id === 'dashscope' ? (
              <input className="text-input" value={voiceName} placeholder="Cherry" onChange={(e) => setDraft({ ...draft, ttsVoice: e.target.value })} />
            ) : (
              <select value={voiceName} onChange={(e) => setDraft({ ...draft, ttsVoice: `${TTS_MODEL}:${e.target.value}` })}>
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </label>
          {isVolcano && (
            <label>自定义音色 ID（可选，覆盖上方选择）
              <input className="text-input" placeholder="zh_female_...（控制台音色列表复制）" value={voiceName}
                onChange={(e) => setDraft({ ...draft, ttsVoice: `volcano:${e.target.value.trim()}` })} />
            </label>
          )}
          <label>语速 {draft.ttsSpeed.toFixed(2)}
            <input type="range" min={0.5} max={2} step={0.05} value={draft.ttsSpeed} onChange={(e) => setDraft({ ...draft, ttsSpeed: Number(e.target.value) })} />
          </label>
          <label className="check-line"><input type="checkbox" checked={draft.wakeEnabled} onChange={(e) => setDraft({ ...draft, wakeEnabled: e.target.checked })} /> 启用语音唤醒</label>
          <label>唤醒词
            <input className="text-input" value={draft.wakeWord} maxLength={8} onChange={(e) => setDraft({ ...draft, wakeWord: e.target.value })} />
          </label>
          <label className="check-line"><input type="checkbox" checked={draft.subtitles} onChange={(e) => setDraft({ ...draft, subtitles: e.target.checked })} /> 屏幕字幕</label>
        </div>
      </section>
      <section className="card">
        <h3>城市与天气</h3>
        <p className="dim">设置城市后：设备顶栏显示实时天气与温度；窗外景色随当地天气变化（下雨/下雪/晴天），房间光线随现实时间昼夜变化。国内城市走腾讯天气、国际城市走 Open-Meteo，均免费无需 key。</p>
        <div className="form-grid">
          <label>当前城市
            <input className="text-input" readOnly value={draft.city ? draft.city.name + (draft.city.province ? '（' + draft.city.province + '）' : draft.city.lat != null ? '（' + draft.city.lat.toFixed(2) + ', ' + (draft.city.lon?.toFixed(2) ?? '') + '）' : '') : '未设置'} />
          </label>
          <label>搜索新城市
            <div className="city-search">
              <input className="text-input" placeholder="如：广州" value={cityQuery} maxLength={20}
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void doSearchCity(); }} />
              <button className="btn" disabled={cityBusy} onClick={() => void doSearchCity()}>{cityBusy ? '搜索中…' : '搜索'}</button>
              {draft.city && <button className="btn" onClick={() => { setDraft({ ...draft, city: null }); setCityHits([]); setCityMsg('已清除（保存后生效）'); }}>清除</button>}
            </div>
          </label>
        </div>
        {cityHits.length > 0 && (
          <div className="city-hits">
            {cityHits.map((r, i) => (
              <button key={i} className="btn city-hit" onClick={() => { setDraft({ ...draft, city: { name: r.name, lat: r.lat, lon: r.lon, province: r.province } }); setCityHits([]); setCityQuery(r.name); setCityMsg(`已选择 ${r.name}，记得点「保存全部改动」`); }}>
                {r.name}{r.admin1 ? ` · ${r.admin1}` : ''}{r.country ? ` · ${r.country}` : ''}
              </button>
            ))}
          </div>
        )}
        {cityMsg && <p className="dim">{cityMsg}</p>}
      </section>
      <section className="card">
        <h3>记忆宫殿参数</h3>
        <div className="form-grid">
          <label>召回条数 topK
            <input type="number" min={1} max={20} value={draft.memory.topK} onChange={(e) => setMem({ topK: Number(e.target.value) })} />
          </label>
          <label>召回 token 预算
            <input type="number" min={100} max={4000} step={100} value={draft.memory.tokenBudget} onChange={(e) => setMem({ tokenBudget: Number(e.target.value) })} />
          </label>
          <label>每日衰减系数
            <input type="number" min={0.8} max={1} step={0.005} value={draft.memory.decayPerDay} onChange={(e) => setMem({ decayPerDay: Number(e.target.value) })} />
          </label>
          <label>归档阈值（强度低于）
            <input type="number" min={0.05} max={0.5} step={0.01} value={draft.memory.archiveThreshold} onChange={(e) => setMem({ archiveThreshold: Number(e.target.value) })} />
          </label>
          <label>合并阈值（相似度高于）
            <input type="number" min={0.8} max={0.99} step={0.01} value={draft.memory.mergeThreshold} onChange={(e) => setMem({ mergeThreshold: Number(e.target.value) })} />
          </label>
        </div>
      </section>
      <div className="save-bar">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存全部改动'}</button>
        <button className="btn" onClick={() => setDraft(JSON.parse(JSON.stringify(config)))}>还原</button>
        {msg && <span className="save-msg">{msg}</span>}
      </div>
    </div>
  );
}


