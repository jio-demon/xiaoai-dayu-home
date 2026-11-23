import { describe, expect, it } from 'vitest';
import { SentenceSplitter } from '../src/sentence';

describe('SentenceSplitter', () => {
  it('按句末标点切分', () => {
    const s = new SentenceSplitter();
    expect(s.push('你好呀！今天')).toEqual(['你好呀！']);
    expect(s.push('过得怎么样？我')).toEqual(['今天过得怎么样？']);
    expect(s.flush()).toBe('我');
  });
  it('换行与分号也切分', () => {
    const s = new SentenceSplitter();
    expect(s.push('第一句;第二句\n')).toEqual(['第一句;', '第二句']);
  });
  it('超长无句末标点时按逗号软切', () => {
    const s = new SentenceSplitter();
    const long = '这是一段非常非常长的话，'.repeat(6);
    const out = s.push(long);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((x) => x.length <= 61)).toBe(true);
  });
  it('flush 空缓冲返回 null', () => {
    const s = new SentenceSplitter();
    expect(s.flush()).toBeNull();
  });
});

