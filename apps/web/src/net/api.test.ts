import { DEFAULT_CONFIG, type AppConfig } from '@xiaoai/protocol';
import { maskConfig, stripMasked } from './api';

describe('stripMasked / maskConfig', () => {
  it('掩码 key 被视为未修改而丢弃', () => {
    const patch: Partial<AppConfig> = { llm: { id: 'deepseek', apiKey: 'sk-1****abcd', model: 'deepseek-chat' }, persona: '新角色' };
    const out = stripMasked(patch);
    expect(out.llm?.apiKey).toBeUndefined();
    expect(out.llm?.model).toBe('deepseek-chat');
    expect(out.persona).toBe('新角色');
  });
  it('真实新 key 保留', () => {
    const out = stripMasked({ tts: { id: 'siliconflow', apiKey: 'sk-brand-new' } });
    expect(out.tts?.apiKey).toBe('sk-brand-new');
  });
  it('maskConfig 四个 provider 全部掩码', () => {
    const cfg: AppConfig = { ...DEFAULT_CONFIG, llm: { id: 'deepseek', apiKey: 'sk-1234567890abcdef' } };
    const m = maskConfig(cfg);
    expect(m.llm.apiKey).toBe('sk-1****cdef');
    expect(m.asr.apiKey).toBe('');
  });
});
