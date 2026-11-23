import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '@xiaoai/protocol';
import { VolcanoTts } from '../src/providers/volcano';
import { createProviders } from '../src/providers';

const cfg = { id: 'volcano' as const, apiKey: 'test-token', appId: 'test-app', model: 'volcano_tts' };

afterEach(() => vi.unstubAllGlobals());

describe('VolcanoTts', () => {
  it('sends correct auth header, cluster, voice and speech_rate; decodes mp3', async () => {
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      expect(init.headers.Authorization).toBe('Bearer;test-token');
      const body = JSON.parse(init.body);
      expect(body.app).toEqual({ appid: 'test-app', token: 'test-token', cluster: 'volcano_tts' });
      expect(body.audio.voice_type).toBe('zh_female_cancan_mars_bigtts');
      expect(body.audio.encoding).toBe('mp3');
      expect(JSON.parse(body.request.additions).speech_rate).toBe(20); // speed 1.2 → +20
      expect(body.request.reqid).toBeTruthy();
      return new Response(JSON.stringify({ code: 3000, message: 'Success', data: 'QUJD' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const tts = new VolcanoTts(cfg);
    const audio = await tts.synthesize('你好呀', 'volcano:zh_female_cancan_mars_bigtts', 1.2);
    expect(audio).toEqual({ mime: 'audio/mpeg', data: 'QUJD' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('v3 (no appId): X-Api-Key headers, req_params body, chunked JSON concat', async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toContain('/api/v3/tts/unidirectional');
      expect(init.headers['X-Api-Key']).toBe('test-key');
      expect(init.headers['X-Api-Resource-Id']).toBe('seed-tts-2.0');
      expect(init.headers['X-Api-Request-Id']).toBeTruthy();
      const body = JSON.parse(init.body);
      expect(body.req_params.text).toBe('你好呀');
      expect(body.req_params.speaker).toBe('zh_female_shuangkuaisisi_uranus_bigtts');
      expect(body.req_params.audio_params.format).toBe('mp3');
      expect(body.req_params.audio_params.sample_rate).toBe(24000);
      expect(body.req_params.audio_params.speech_rate).toBe(20);
      // chunked 响应：多行 JSON，每行一段 base64 音频块（QUJD='ABC', REVG='DEF'）
      const raw = '{"code":0,"message":"OK","data":"QUJD"}\n{"code":0,"message":"OK","data":"REVG"}\n{"code":20000000,"message":"OK"}\n';
      return new Response(raw, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const tts = new VolcanoTts({ ...cfg, appId: undefined, apiKey: 'test-key', model: undefined });
    const audio = await tts.synthesize('你好呀', 'volcano:zh_female_shuangkuaisisi_uranus_bigtts', 1.2);
    expect(audio.mime).toBe('audio/mpeg');
    expect(atob(audio.data!)).toBe('ABCDEF');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('v3 migrates legacy moon/mars voice ids to uranus', async () => {
    const fetchMock = vi.fn(async (_url: any, init: any) => {
      expect(JSON.parse(init.body).req_params.speaker).toBe('zh_female_sajiaoxuemei_uranus_bigtts');
      return new Response('{"code":0,"data":"QUJD"}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const tts = new VolcanoTts({ ...cfg, appId: undefined, apiKey: 'k', model: undefined });
    await tts.synthesize('hi', 'volcano:zh_female_sajiaoxuemei_moon_bigtts', 1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('v3 quota error surfaces friendly hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":45000030,"message":"quota exceeded for types: seed_tts_lifetime"}', { status: 200 })));
    const tts = new VolcanoTts({ ...cfg, appId: undefined, apiKey: 'k', model: undefined });
    await expect(tts.synthesize('hi', 'volcano:x', 1)).rejects.toThrow(/试用额度用尽/);
  });

  it('business error code surfaces with hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 3001, message: 'invalid voice' }), { status: 200 })));
    const tts = new VolcanoTts(cfg);
    await expect(tts.synthesize('hi', 'volcano:nope', 1)).rejects.toThrow(/音色未授权/);
  });

  it('http error surfaces status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"unauthorized"}', { status: 401 })));
    const tts = new VolcanoTts(cfg);
    await expect(tts.synthesize('hi', 'volcano:x', 1)).rejects.toThrow(/HTTP 401/);
  });

  it('createProviders routes volcano tts and keeps siliconflow asr', () => {
    const p = createProviders({ ...DEFAULT_CONFIG, tts: cfg });
    expect(p.tts).toBeInstanceOf(VolcanoTts);
    expect(p.asr.constructor.name).toBe('SiliconFlowAsr');
  });
});
