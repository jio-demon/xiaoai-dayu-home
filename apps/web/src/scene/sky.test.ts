import { describe, it, expect } from 'vitest';
import { wmoToCondition, skyState, weatherDim, roomLighting, starAlpha, cityLightAlpha, skyGradient } from './sky';

describe('wmoToCondition', () => {
  it('maps WMO codes', () => {
    expect(wmoToCondition(0)).toBe('clear');
    expect(wmoToCondition(1)).toBe('cloudy');
    expect(wmoToCondition(2)).toBe('cloudy');
    expect(wmoToCondition(3)).toBe('overcast');
    expect(wmoToCondition(45)).toBe('fog');
    expect(wmoToCondition(51)).toBe('drizzle');
    expect(wmoToCondition(61)).toBe('rain');
    expect(wmoToCondition(65)).toBe('rain');
    expect(wmoToCondition(80)).toBe('rain');
    expect(wmoToCondition(71)).toBe('snow');
    expect(wmoToCondition(85)).toBe('snow');
    expect(wmoToCondition(95)).toBe('thunder');
    expect(wmoToCondition(99)).toBe('thunder');
    expect(wmoToCondition(42)).toBe('cloudy'); // unknown fallback
  });
});

const at = (h: number, m = 0) => new Date(2026, 5, 15, h, m, 0);

describe('skyState', () => {
  it('noon is day, midnight is night', () => {
    expect(skyState(at(12)).night).toBe(0);
    expect(skyState(at(12)).phase).toBe('day');
    expect(skyState(at(0)).night).toBe(1);
    expect(skyState(at(23)).night).toBe(1);
    expect(skyState(at(3)).phase).toBe('night');
  });
  it('transitions are continuous and monotonic', () => {
    const dawn = [5, 5.5, 6, 6.5, 7, 7.5, 8].map((h) => skyState(at(Math.floor(h), (h % 1) * 60)).night);
    for (let i = 1; i < dawn.length; i++) expect(dawn[i]).toBeLessThanOrEqual(dawn[i - 1]);
    expect(dawn[0]).toBe(1); expect(dawn[dawn.length - 1]).toBe(0);
    const dusk = [17, 18, 19, 20].map((h) => skyState(at(h)).night);
    for (let i = 1; i < dusk.length; i++) expect(dusk[i]).toBeGreaterThanOrEqual(dusk[i - 1]);
    expect(dusk[0]).toBe(0); expect(dusk[3]).toBe(1);
  });
  it('warm glow peaks near sunrise/sunset', () => {
    expect(skyState(at(6, 30)).warm).toBeGreaterThan(0.9);
    expect(skyState(at(18, 30)).warm).toBeGreaterThan(0.9);
    expect(skyState(at(12)).warm).toBe(0);
    expect(skyState(at(0)).warm).toBe(0);
  });
  it('sunAlt positive at noon, negative at night', () => {
    expect(skyState(at(12)).sunAlt).toBeCloseTo(1, 5);
    expect(skyState(at(0)).sunAlt).toBeCloseTo(-1, 5);
  });
  it('weather dims light', () => {
    const clear = roomLighting(skyState(at(12), 'clear'));
    const rain = roomLighting(skyState(at(12), 'rain'));
    expect(rain.dirIntensity).toBeLessThan(clear.dirIntensity);
    expect(rain.ambientIntensity).toBeLessThan(clear.ambientIntensity);
    expect(weatherDim('thunder')).toBeGreaterThan(weatherDim('rain'));
    expect(weatherDim('clear')).toBe(0);
  });
  it('night lighting darker than day', () => {
    const day = roomLighting(skyState(at(12)));
    const night = roomLighting(skyState(at(0)));
    expect(night.ambientIntensity).toBeLessThan(day.ambientIntensity);
    expect(night.dirIntensity).toBeLessThan(day.dirIntensity);
  });
  it('stars only at clear night; city lights fade in at dusk', () => {
    expect(starAlpha(skyState(at(0), 'clear'))).toBe(1);
    expect(starAlpha(skyState(at(0), 'rain'))).toBe(0);
    expect(starAlpha(skyState(at(12)))).toBe(0);
    expect(cityLightAlpha(skyState(at(22)))).toBe(1);
    expect(cityLightAlpha(skyState(at(12)))).toBe(0);
  });
  it('gradient colors valid rgb ranges', () => {
    for (const h of [0, 6, 12, 18, 22]) {
      for (const c of ['clear', 'rain', 'snow', 'fog'] as const) {
        const { top, bottom } = skyGradient(skyState(at(h), c));
        for (const v of [...top, ...bottom]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
      }
    }
  });
});
