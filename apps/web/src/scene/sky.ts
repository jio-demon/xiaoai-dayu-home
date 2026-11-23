import type { CitySetting } from '@xiaoai/protocol';
export type { CitySetting };

/**
 * 天空环境：现实时间 + 城市天气 → 窗外景色 / 房间光照。
 * 纯函数（无 DOM/three），可在 node 下单测；场景层按分钟节流采样。
 */

export type WeatherCondition = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder';

export interface WeatherNow {
  condition: WeatherCondition;
  temperature: number; // °C
  isDay: boolean;
  fetchedAt: number;
}

export const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: '晴', cloudy: '多云', overcast: '阴', fog: '雾', drizzle: '小雨', rain: '雨', snow: '雪', thunder: '雷雨',
};

export const CONDITION_ICON: Record<WeatherCondition, string> = {
  clear: '☀️', cloudy: '⛅', overcast: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', thunder: '⛈️',
};

/** WMO weather_code → 场景天气分类。 */
export function wmoToCondition(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

export type SkyPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface SkyState {
  hour: number; // 0-24 小数
  phase: SkyPhase;
  night: number; // 0=白天 1=深夜（连续）
  warm: number; // 晨昏暖光强度 0-1
  sunAlt: number; // -1..1，太阳高度（正弦近似，6 点升 18 点落）
  dim: number; // 天气遮光系数 0(晴)..1(雷雨)
  condition: WeatherCondition;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** 天气对光线的遮挡程度。 */
export function weatherDim(c: WeatherCondition): number {
  switch (c) {
    case 'clear': return 0;
    case 'cloudy': return 0.15;
    case 'fog': return 0.3;
    case 'overcast': return 0.35;
    case 'drizzle': return 0.4;
    case 'snow': return 0.35;
    case 'rain': return 0.55;
    case 'thunder': return 0.7;
  }
}

/** 由本地时刻与天气计算天空状态（ sunrise≈6:00, sunset≈18:00，四季简化）。 */
export function skyState(date: Date, condition: WeatherCondition = 'clear'): SkyState {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let night: number;
  if (hour >= 20 || hour < 5) night = 1;
  else if (hour < 8) night = 1 - smooth((hour - 5) / 3); // 5→8 天亮
  else if (hour < 17) night = 0;
  else night = smooth((hour - 17) / 3); // 17→20 天黑
  const dawn = hour >= 5 && hour < 8 ? 1 - Math.abs((hour - 6.5) / 1.5) : 0;
  const dusk = hour >= 17 && hour < 20 ? 1 - Math.abs((hour - 18.5) / 1.5) : 0;
  const warm = clamp01(Math.max(dawn, dusk)) * (1 - weatherDim(condition) * 0.6);
  const phase: SkyPhase = night > 0.85 ? 'night' : warm > 0.25 ? (hour < 12 ? 'dawn' : 'dusk') : night > 0.5 ? 'night' : 'day';
  const sunAlt = Math.sin(((hour - 6) / 12) * Math.PI);
  return { hour, phase, night, warm, sunAlt, dim: weatherDim(condition), condition };
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const rgbCss = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
export const rgbHex = (c: RGB) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

/** 窗外天空渐变（顶/底），随昼夜与天气变化。 */
export function skyGradient(s: SkyState): { top: RGB; bottom: RGB } {
  const dayTop: RGB = [96, 156, 224], dayBot: RGB = [176, 214, 244];
  const nightTop: RGB = [8, 14, 38], nightBot: RGB = [22, 36, 74];
  const warmTop: RGB = [92, 84, 148], warmBot: RGB = [244, 156, 96];
  let top = mix(dayTop, nightTop, s.night);
  let bottom = mix(dayBot, nightBot, s.night);
  top = mix(top, warmTop, s.warm * 0.7);
  bottom = mix(bottom, warmBot, s.warm * 0.85);
  // 天气：向灰调靠拢并压暗
  const gray: RGB = [116, 126, 142];
  const dark: RGB = [58, 66, 84];
  const g = s.dim;
  top = mix(mix(top, gray, g * 0.7), dark, g * 0.35 * (1 - s.night * 0.5));
  bottom = mix(mix(bottom, gray, g * 0.6), dark, g * 0.3 * (1 - s.night * 0.5));
  if (s.condition === 'fog') { top = mix(top, [150, 158, 170], 0.45); bottom = mix(bottom, [168, 176, 186], 0.55); }
  return { top, bottom };
}

/** 房间环境光/主光颜色与强度（含天气压暗、晨昏暖调、夜晚蓝调）。 */
export function roomLighting(s: SkyState): { ambientColor: RGB; ambientIntensity: number; dirColor: RGB; dirIntensity: number } {
  const dayAmb: RGB = [176, 190, 214], nightAmb: RGB = [106, 122, 168], warmAmb: RGB = [214, 178, 148];
  const dayDir: RGB = [255, 244, 224], nightDir: RGB = [150, 172, 220], warmDir: RGB = [255, 186, 120];
  let amb = mix(dayAmb, nightAmb, s.night);
  let dir = mix(dayDir, nightDir, s.night);
  amb = mix(amb, warmAmb, s.warm * 0.5);
  dir = mix(dir, warmDir, s.warm * 0.8);
  const weatherDark = 1 - s.dim * 0.35;
  return {
    ambientColor: amb,
    ambientIntensity: (1.0 - s.night * 0.52) * weatherDark,
    dirColor: dir,
    dirIntensity: (0.78 - s.night * 0.52) * (1 - s.dim * 0.5),
  };
}

/** 星星可见度（夜晚且少云）。 */
export function starAlpha(s: SkyState): number {
  const cloudHide = s.condition === 'clear' ? 1 : s.condition === 'cloudy' ? 0.5 : 0;
  return clamp01((s.night - 0.4) / 0.6) * cloudHide;
}

/** 城市灯可见度（夜晚越深越亮，雨雾天朦胧一点）。 */
export function cityLightAlpha(s: SkyState): number {
  return clamp01((s.night - 0.25) / 0.75) * (1 - s.dim * 0.3);
}
