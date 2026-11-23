import { describe, expect, it } from 'vitest';
import { matchWakeWord, normalizeTranscript } from './wakeMatch';

describe('wakeMatch', () => {
  it('归一化去标点空格', () => {
    expect(normalizeTranscript('你好， 大肥鱼！')).toBe('你好大肥鱼');
    expect(normalizeTranscript('Hello, World!')).toBe('helloworld');
  });
  it('精确包含匹配', () => {
    expect(matchWakeWord('大肥鱼', '大肥鱼')).toBe(true);
    expect(matchWakeWord('嗯…大肥鱼，在吗？', '大肥鱼')).toBe(true);
  });
  it('同音误识别容错', () => {
    expect(matchWakeWord('大飞鱼', '大肥鱼')).toBe(true);
    expect(matchWakeWord('叫一下大肥余', '大肥鱼')).toBe(true);
  });
  it('自定义唤醒词', () => {
    expect(matchWakeWord('小鲸鱼你好', '小鲸鱼')).toBe(true);
    expect(matchWakeWord('大肥鱼', '小鲸鱼')).toBe(false);
  });
  it('不匹配与空输入', () => {
    expect(matchWakeWord('今天天气不错', '大肥鱼')).toBe(false);
    expect(matchWakeWord('', '大肥鱼')).toBe(false);
    expect(matchWakeWord('大肥鱼', '')).toBe(false);
    expect(matchWakeWord('肥鱼', '大肥鱼')).toBe(false);
  });
});
