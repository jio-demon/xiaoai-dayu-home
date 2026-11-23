import type { AudioPayload, ProviderConfig } from '@xiaoai/protocol';
import { fetchJson, pcm16kToWav } from '../util';
import type { AsrProvider, ChatMessage, ChatProvider, EmbedProvider, TtsProvider } from './types';

const COMPAT = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const NATIVE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

/** 阿里云百炼备选适配器：chat/embedding 走兼容模式，ASR/TTS 走 qwen3-asr/tts-flash。 */
export class DashScopeChat implements ChatProvider {
  constructor(private cfg: ProviderConfig) {}
  async *stream(messages: ChatMessage[], opts?: { temperature?: number }): AsyncIterable<string> {
    const res = await fetch((this.cfg.baseUrl || COMPAT).replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({ model: this.cfg.model || 'qwen-plus', messages, stream: true, temperature: opts?.temperature ?? 0.8 }),
    });
    if (!res.ok || !res.body) throw new Error(`DashScope HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try { const d = JSON.parse(payload).choices?.[0]?.delta?.content; if (d) yield d as string; } catch { /* skip */ }
      }
    }
  }
}

export class DashScopeAsr implements AsrProvider {
  constructor(private cfg: ProviderConfig) {}
  async transcribe(pcm16kBase64: string): Promise<string> {
    const j = await fetchJson(NATIVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: this.cfg.model || 'qwen3-asr-flash',
        input: { messages: [{ role: 'user', content: [{ audio: `data:audio/wav;base64,${pcm16kToWav(pcm16kBase64)}` }] }] },
        parameters: { asr_options: { enable_lid: true, enable_itn: true } },
      }),
    }, 30000);
    const c = j.output?.choices?.[0]?.message?.content;
    return (Array.isArray(c) ? c.map((x: any) => x.text || '').join('') : '').trim();
  }
}

export class DashScopeTts implements TtsProvider {
  constructor(private cfg: ProviderConfig) {}
  async synthesize(text: string, voice: string, _speed: number): Promise<AudioPayload> {
    const j = await fetchJson(NATIVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({ model: this.cfg.model || 'qwen3-tts-flash', input: { text, voice: voice || 'Cherry', language_type: 'Chinese' } }),
    }, 30000);
    const url = j.output?.audio?.url;
    if (!url) throw new Error('DashScope TTS: no audio url in response');
    return { mime: 'audio/wav', url };
  }
}

export class DashScopeEmbed implements EmbedProvider {
  constructor(private cfg: ProviderConfig) {}
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const j = await fetchJson((this.cfg.baseUrl || COMPAT).replace(/\/+$/, '') + '/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({ model: this.cfg.model || 'text-embedding-v4', input: texts }),
    }, 30000);
    return (j.data || []).map((d: any) => d.embedding as number[]);
  }
}
