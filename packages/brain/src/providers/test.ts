import type { AppConfig, ProviderConfig } from '@xiaoai/protocol';
import { bytesToB64, pcm16kToWav } from '../util';
import { createProviders, hasKey } from './index';

export interface ConnTestResult { ok: boolean; ms: number; detail: string }

/** 0.3 秒静音 PCM16（ASR 连通测试用，不消耗多少额度）。 */
function silencePcmB64(): string {
  return bytesToB64(new Uint8Array(16000 * 2 * 0.3));
}

function errText(e: unknown): string {
  const msg = (e as Error)?.message || String(e);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return '网络请求失败（Failed to fetch）：多为浏览器跨域(CORS)拦截或网络不通。PC 模拟请走 npm run dev 的 /cloud-proxy 代理；也请检查 Base URL 与本机网络。';
  }
  if (/abort/i.test(msg)) return '请求超时（15 秒）：检查网络或 Base URL';
  return msg.slice(0, 240);
}

/**
 * 单项连通测试：用页面上当前填写的服务商/模型/BaseURL/Key 发一次最小真实请求。
 * LLM 发一条「ping」；ASR 传 0.3s 静音；TTS 合成「你好」（会计费少量额度）；Embedding 编码一个词。
 */
export async function testProvider(
  kind: 'llm' | 'asr' | 'tts' | 'embedding',
  cfg: ProviderConfig,
  full: AppConfig,
): Promise<ConnTestResult> {
  const t0 = Date.now();
  const done = (ok: boolean, detail: string): ConnTestResult => ({ ok, ms: Date.now() - t0, detail });
  if (!hasKey(cfg)) return done(false, '未填写 API Key（掩码表示已保存的旧 key，可直接测试）');
  // 火山双通道：新版豆包语音控制台只需 API Key（v3）；旧版语音技术应用需 APP ID（v1）。
  const providers = createProviders({ ...full, [kind]: cfg } as AppConfig);
  // LLM 流式请求本身无超时：这里加 15 秒看门狗，避免连通测试卡死
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: RequestInit) =>
    origFetch(input, { ...init, signal: init?.signal ?? ctrl.signal })) as typeof fetch;
  try {
    if (kind === 'llm') {
      let out = '';
      for await (const d of providers.chat.stream([{ role: 'user', content: '请只回复两个字：收到' }], { temperature: 0 })) {
        out += d;
        if (out.length > 24) break;
      }
      return done(true, `模型回复：${out.trim().slice(0, 24) || '(空)'}`);
    }
    if (kind === 'asr') {
      const text = await providers.asr.transcribe(silencePcmB64());
      return done(true, `识别接口正常（静音返回：「${text || ''}」）`);
    }
    if (kind === 'tts') {
      const voice = cfg.id === 'volcano' && !full.ttsVoice.startsWith('volcano:')
        ? 'volcano:zh_female_shuangkuaisisi_uranus_bigtts' : full.ttsVoice;
      const audio = await providers.tts.synthesize('你好呀！', voice, full.ttsSpeed);
      const size = audio.data ? Math.round(audio.data.length * 0.75 / 1024) : 0;
      return done(true, audio.url ? '合成成功（返回音频 URL）' : `合成成功（约 ${size} KB 音频）`);
    }
    const vecs = await providers.embed.embed(['大肥鱼']);
    const dim = vecs[0]?.length ?? 0;
    if (!dim) return done(false, '接口返回成功但没有向量数据');
    return done(true, `向量维度 ${dim}`);
  } catch (e) {
    return done(false, errText(e));
  } finally {
    clearTimeout(timer);
    globalThis.fetch = origFetch;
  }
}


