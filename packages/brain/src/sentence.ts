/** 流式 LLM 输出按句切分，供逐句 TTS，降低首句出声延迟。 */
const END = /[。！？!?；;\n]/;
const SOFT = /[，,、]/;

export class SentenceSplitter {
  private buf = '';
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    for (;;) {
      const m = END.exec(this.buf);
      if (m) {
        const end = m.index + 1;
        const s = this.buf.slice(0, end).trim();
        this.buf = this.buf.slice(end);
        if (s) out.push(s);
        continue;
      }
      if (this.buf.length > 60) {
        let cut = -1;
        for (let i = Math.min(this.buf.length - 1, 60); i >= 20; i--) if (SOFT.test(this.buf[i])) { cut = i + 1; break; }
        if (cut > 0) { const s = this.buf.slice(0, cut).trim(); this.buf = this.buf.slice(cut); if (s) out.push(s); continue; }
      }
      break;
    }
    return out;
  }
  flush(): string | null {
    const s = this.buf.trim();
    this.buf = '';
    return s || null;
  }
}

