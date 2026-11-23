import { describe, it, expect } from 'vitest';
import { qqCodeToCondition } from './weather';
import { searchCnCities, CN_CITIES } from './cnCities';

describe('qqCodeToCondition', () => {
  it('maps QQ weather codes', () => {
    expect(qqCodeToCondition('00', '晴')).toBe('clear');
    expect(qqCodeToCondition('01', '多云')).toBe('cloudy');
    expect(qqCodeToCondition('02', '阴')).toBe('overcast');
    expect(qqCodeToCondition('03', '阵雨')).toBe('drizzle');
    expect(qqCodeToCondition('04', '雷阵雨')).toBe('thunder');
    expect(qqCodeToCondition('07', '小雨')).toBe('rain');
    expect(qqCodeToCondition('09', '大雨')).toBe('rain');
    expect(qqCodeToCondition('13', '小雪')).toBe('snow');
    expect(qqCodeToCondition('16', '暴雪')).toBe('snow');
    expect(qqCodeToCondition('18', '雾')).toBe('fog');
    expect(qqCodeToCondition('53', '霾')).toBe('fog');
  });
  it('falls back to text for unknown codes', () => {
    expect(qqCodeToCondition('99', '雷阵雨伴冰雹')).toBe('thunder');
    expect(qqCodeToCondition('99', '大雪')).toBe('snow');
    expect(qqCodeToCondition('99', '中雨')).toBe('rain');
    expect(qqCodeToCondition('99', '晴')).toBe('clear');
    expect(qqCodeToCondition('', '多云')).toBe('cloudy');
  });
});

describe('searchCnCities', () => {
  it('finds major cities with province', () => {
    const gz = searchCnCities('广州');
    expect(gz[0]).toEqual({ name: '广州', province: '广东' });
    expect(searchCnCities('杭州')[0].province).toBe('浙江');
    expect(searchCnCities('北京')[0].province).toBe('北京');
  });
  it('strips 市/省 suffix and matches prefix first', () => {
    expect(searchCnCities('广州市')[0].name).toBe('广州');
    const hits = searchCnCities('州');
    expect(hits.length).toBeGreaterThan(3);
    expect(hits.every((h) => h.name.includes('州') || h.province.includes('州'))).toBe(true);
  });
  it('empty query returns empty; table covers 300+ cities', () => {
    expect(searchCnCities('')).toEqual([]);
    expect(CN_CITIES.length).toBeGreaterThan(300);
  });
});
