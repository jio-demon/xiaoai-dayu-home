/**
 * 城市天气：双通道。
 *  - 国内城市（有 province）：腾讯天气 wis.qq.com（免费无 key，国内网络稳定可达）
 *  - 国际城市（有 lat/lon）：Open-Meteo（免费无 key）
 * 城市搜索：内置中国城市表即时匹配；Open-Meteo geocoding 作为国际补充（可达时）。
 * PC 模拟下全局 fetch 已被 cloudProxy 包装，自动走 vite 代理绕 CORS。
 */
import { wmoToCondition, type CitySetting, type WeatherNow, type WeatherCondition } from '../scene/sky';
import { searchCnCities } from './cnCities';

export const WEATHER_POLL_MS = 10 * 60 * 1000;
const CHECK_MS = 30 * 1000;

/** 瞬时网络抖动重试（2 次，退避 600ms/1500ms）。 */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1) + Math.random() * 300));
    }
  }
  throw lastErr;
}

export interface GeoResult { name: string; lat?: number; lon?: number; province?: string; admin1?: string; country?: string }

/** 腾讯天气 weather_code(00-31) → 场景分类。 */
export function qqCodeToCondition(code: string, text: string): WeatherCondition {
  const n = Number(code);
  if (code === '00') return 'clear';
  if (code === '01') return 'cloudy';
  if (code === '02') return 'overcast';
  if (code === '03') return 'drizzle';
  if (code === '04') return 'thunder';
  if (code === '05') return 'thunder'; // 冰雹按雷雨处理
  if (code === '06') return 'snow'; // 雨夹雪
  if (code === '07') return 'rain';
  if (code === '08') return 'rain';
  if (code === '09') return 'rain';
  if (code === '10') return 'rain';
  if (code === '11') return 'rain';
  if (code === '12') return 'rain';
  if (code === '13') return 'snow';
  if (code === '14') return 'snow';
  if (code === '15') return 'snow';
  if (code === '16') return 'snow';
  if (code === '17') return 'snow';
  if (code === '18') return 'fog';
  if (code === '53') return 'fog'; // 霾
  if (Number.isFinite(n) && n >= 19 && n <= 25) return 'rain'; // 冻雨/强阵雨等
  if (Number.isFinite(n) && n >= 26 && n <= 31) return 'snow';
  // 文本兜底
  if (/雷/.test(text)) return 'thunder';
  if (/雪/.test(text)) return 'snow';
  if (/雨/.test(text)) return 'rain';
  if (/雾|霾/.test(text)) return 'fog';
  if (/阴/.test(text)) return 'overcast';
  if (/多云/.test(text)) return 'cloudy';
  if (/晴/.test(text)) return 'clear';
  return 'cloudy';
}

/** 搜索城市：先查内置中国城市表（零网络、毫秒级），再补 Open-Meteo 国际结果（失败静默）。 */
export async function searchCity(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const cn: GeoResult[] = searchCnCities(q).map((c) => ({ name: c.name, province: c.province, admin1: c.province, country: '中国' }));
  let intl: GeoResult[] = [];
  try {
    // 国际接口在国内网络可能不可达：4s 超时，不阻塞国内结果返回
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 4000);
    const onOuterAbort = () => timeout.abort();
    signal?.addEventListener('abort', onOuterAbort);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=zh&format=json`;
    const res = await fetch(url, { signal: timeout.signal }).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.results) ? data.results : [];
      intl = list.map((r: any) => ({
        name: String(r.name ?? q),
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        admin1: r.admin1 ? String(r.admin1) : undefined,
        country: r.country ? String(r.country) : undefined,
      })).filter((r: GeoResult) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
    }
  } catch { /* 国际接口不可达时仅用国内表 */ }
  // 去重（同名国内城市优先）
  const seen = new Set(cn.map((c) => c.name));
  return [...cn, ...intl.filter((r) => !seen.has(r.name))].slice(0, 8);
}

async function fetchQqWeather(city: CitySetting, signal?: AbortSignal): Promise<WeatherNow> {
  const url = `https://wis.qq.com/weather/common?source=pc&weather_type=observe` +
    `&province=${encodeURIComponent(city.province ?? '')}&city=${encodeURIComponent(city.name)}`;
  const res = await withRetry(() => fetch(url, { signal }));
  if (!res.ok) throw new Error(`天气获取失败 HTTP ${res.status}`);
  const data = await res.json();
  const ob = data?.data?.observe;
  if (data?.status !== 200 || !ob || ob.degree === '' || ob.weather_code === '') throw new Error('未找到该城市天气（试试加省份搜索）');
  const hour = new Date().getHours();
  return {
    condition: qqCodeToCondition(String(ob.weather_code), String(ob.weather ?? '')),
    temperature: Math.round(Number(ob.degree) * 10) / 10,
    isDay: hour >= 6 && hour < 19,
    fetchedAt: Date.now(),
  };
}

async function fetchOpenMeteo(city: CitySetting, signal?: AbortSignal): Promise<WeatherNow> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const res = await withRetry(() => fetch(url, { signal }));
  if (!res.ok) throw new Error(`天气获取失败 HTTP ${res.status}`);
  const data = await res.json();
  const cur = data?.current;
  if (!cur || typeof cur.weather_code !== 'number') throw new Error('天气数据格式异常');
  return {
    condition: wmoToCondition(cur.weather_code),
    temperature: Math.round(Number(cur.temperature_2m) * 10) / 10,
    isDay: cur.is_day === 1,
    fetchedAt: Date.now(),
  };
}

/** 拉当前天气：国内走腾讯，国际走 Open-Meteo。 */
export async function fetchWeather(city: CitySetting, signal?: AbortSignal): Promise<WeatherNow> {
  if (city.province) return fetchQqWeather(city, signal);
  if (typeof city.lat === 'number' && typeof city.lon === 'number') return fetchOpenMeteo(city, signal);
  throw new Error('城市配置缺少坐标或省份');
}

const cityKey = (c: CitySetting | null) =>
  (c ? (c.province ? `${c.province}|${c.name}` : `${c.lat?.toFixed(3)},${c.lon?.toFixed(3)}`) : '');

export interface WeatherWatcherOpts {
  getCity: () => CitySetting | null;
  onUpdate: (w: WeatherNow | null) => void;
  onError?: (msg: string) => void;
  pollMs?: number;
}

/** 轮询器：每 30s 检查一次；城市变化立即刷新，否则按 pollMs 节流。断网静默保留上次结果。 */
export function watchWeather(opts: WeatherWatcherOpts): { stop: () => void; refresh: () => void } {
  let stopped = false;
  let lastKey: string | null = null;
  let lastFetch = 0;
  let inflight: AbortController | null = null;
  const pollMs = opts.pollMs ?? WEATHER_POLL_MS;

  const doFetch = async () => {
    const city = opts.getCity();
    const key = cityKey(city);
    lastKey = key;
    lastFetch = Date.now();
    if (!city) { inflight?.abort(); opts.onUpdate(null); return; }
    inflight?.abort();
    const ac = new AbortController();
    inflight = ac;
    try {
      const w = await fetchWeather(city, ac.signal);
      if (!stopped && lastKey === key) opts.onUpdate(w);
    } catch (e: any) {
      if (!stopped && e?.name !== 'AbortError') opts.onError?.(String(e?.message ?? e));
    }
  };

  const tick = () => {
    if (stopped) return;
    const key = cityKey(opts.getCity());
    if (key !== lastKey || (key && Date.now() - lastFetch >= pollMs)) void doFetch();
  };
  const timer = setInterval(tick, CHECK_MS);
  tick();

  return {
    stop: () => { stopped = true; clearInterval(timer); inflight?.abort(); },
    refresh: () => { void doFetch(); },
  };
}
