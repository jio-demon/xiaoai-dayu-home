import type { ProviderConfig } from '@xiaoai/protocol';
import type { ChatMessage, ChatProvider } from './types';

/** DeepSeek 官方 OpenAI 兼容 SSE 流式 chat。 */
export class DeepSeekChat implements ChatProvider {
  constructor(private cfg: ProviderConfig) {}
  async *stream(messages: ChatMessage[], opts?: { temperature?: number }): AsyncIterable<string> {
    const base = (this.cfg.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({ model: this.cfg.model || 'deepseek-chat', messages, stream: true, temperature: opts?.temperature ?? 0.8 }),
    });
    if (!res.ok || !res.body) throw new Error(`DeepSeek HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
        try {
          const j = JSON.parse(payload);
          const d = j.choices?.[0]?.delta?.content;
          if (d) yield d as string;
        } catch { /* 忽略不完整行 */ }
      }
    }
  }
}
