import { describe, expect, it } from 'vitest';
import { cloudUrl } from './cloudProxy';

// vitest node 环境无 location：cloudUrl 原样返回；有 location 时按规则改写。
describe('cloudUrl', () => {
  it('no location returns url unchanged', () => {
    expect(cloudUrl('https://api.deepseek.com/chat/completions')).toBe('https://api.deepseek.com/chat/completions');
  });
  it('rewrites https cloud hosts when location present', () => {
    (globalThis as any).location = { protocol: 'http:', origin: 'http://localhost:5173' };
    expect(cloudUrl('https://api.deepseek.com/v1/chat/completions'))
      .toBe('http://localhost:5173/cloud-proxy/api.deepseek.com/v1/chat/completions');
    expect(cloudUrl('https://api.siliconflow.cn/v1/audio/speech'))
      .toBe('http://localhost:5173/cloud-proxy/api.siliconflow.cn/v1/audio/speech');
    expect(cloudUrl('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'))
      .toBe('http://localhost:5173/cloud-proxy/dashscope.aliyuncs.com/compatible-mode/v1/embeddings');
  });
  it('rewrites LAN http gateways with port (self-hosted OpenAI-compatible)', () => {
    (globalThis as any).location = { protocol: 'http:', origin: 'http://localhost:5173', host: 'localhost:5173' };
    expect(cloudUrl('http://192.168.31.2:3065/v1/chat/completions'))
      .toBe('http://localhost:5173/cloud-proxy/192.168.31.2:3065/v1/chat/completions');
    // 页面自身地址与 localhost 不代理
    expect(cloudUrl('http://localhost:5173/api/x')).toBe('http://localhost:5173/api/x');
    expect(cloudUrl('http://127.0.0.1:3065/v1/models')).toBe('http://127.0.0.1:3065/v1/models');
    delete (globalThis as any).location;
  });
  it('rewrites portless LAN IP http to :80 proxy', () => {
    (globalThis as any).location = { protocol: 'http:', origin: 'http://192.168.1.50:8080', host: '192.168.1.50:8080', hostname: '192.168.1.50' };
    expect(cloudUrl('http://192.168.31.2/v1/chat/completions'))
      .toBe('http://192.168.1.50:8080/cloud-proxy/192.168.31.2:80/v1/chat/completions');
    // 页面自身主机不代理
    expect(cloudUrl('http://192.168.1.50/api/x')).toBe('http://192.168.1.50/api/x');
    delete (globalThis as any).location;
  });
  it('skips relative urls and https pages do not proxy http targets', () => {
    (globalThis as any).location = { protocol: 'http:', origin: 'http://localhost:5173', host: 'localhost:5173' };
    expect(cloudUrl('/api/config')).toBe('/api/config');
    expect(cloudUrl('https://localhost:9000/x')).toBe('https://localhost:9000/x');
    (globalThis as any).location = { protocol: 'https:', origin: 'https://example.com', host: 'example.com' };
    expect(cloudUrl('http://192.168.31.2:3065/v1/models')).toBe('http://192.168.31.2:3065/v1/models');
    delete (globalThis as any).location;
  });
});

