import type { AudioPayload, ProviderConfig } from '@xiaoai/protocol';
import { bytesToB64, fetchJson, pcm16kToWav, b64ToBytes } from '../util';
import type { AsrProvider, EmbedProvider, TtsProvider } from './types';

const BASE = 'https://api.siliconflow.cn/v1';

/** SiliconFlow：SenseVoice 整句 ASR + CosyVoice TTS + BGE-M3 embedding（免费额度优先）。 */
export class SiliconFlowAsr implements AsrProvider {
  constructor(private cfg: ProviderConfig) {}
  async transcribe(pcm16kBase64: string): Promise<string> {
    const wav = b64ToBytes(pcm16kToWav(pcm16kBase64));
    const form = new FormData();
    form.append('file', new Blob([wav as unknown as BlobPart], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model', this.cfg.model || 'FunAudioLLM/SenseVoiceSmall');
    const j = await fetchJson((this.cfg.baseUrl || BASE).replace(/\/+$/, '') + '/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${this.cfg.apiKey}` }, body: form,
    }, 30000);
    return (j.text || '').trim();
  }
}

export class SiliconFlowTts implements TtsProvider {
  constructor(private cfg: ProviderConfig) {}
  async synthesize(text: string, voice: string, speed: number): Promise<AudioPayload> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch((this.cfg.baseUrl || BASE).replace(/\/+$/, '') + '/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ model: this.cfg.model || 'FunAudioLLM/CosyVoice2-0.5B', input: text, voice, speed, response_format: 'mp3' }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { mime: 'audio/mpeg', data: bytesToB64(bytes) };
    } finally { clearTimeout(t); }
  }
}

export class SiliconFlowEmbed implements EmbedProvider {
  constructor(private cfg: ProviderConfig) {}
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const j = await fetchJson((this.cfg.baseUrl || BASE).replace(/\/+$/, '') + '/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({ model: this.cfg.model || 'BAAI/bge-m3', input: texts }),
    }, 30000);
    return (j.data || []).map((d: any) => d.embedding as number[]);
  }
}

