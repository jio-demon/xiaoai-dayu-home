export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** 16kHz mono PCM16 base64 -> WAV base64（云 ASR 上传格式）。 */
export function pcm16kToWav(pcmB64: string): string {
  const pcm = b64ToBytes(pcmB64);
  const header = new DataView(new ArrayBuffer(44));
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) header.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); header.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE');
  w(12, 'fmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, 16000, true); header.setUint32(28, 32000, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  w(36, 'data'); header.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header.buffer), 0); out.set(pcm, 44);
  return bytesToB64(out);
}

export async function fetchJson(url: string, init: RequestInit, timeoutMs = 30000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
