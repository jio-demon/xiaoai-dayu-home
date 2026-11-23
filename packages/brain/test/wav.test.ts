import { describe, expect, it } from 'vitest';
import { b64ToBytes, bytesToB64, pcm16kToWav } from '../src/util';

describe('wav util', () => {
  it('b64 往返', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    expect(Array.from(b64ToBytes(bytesToB64(bytes)))).toEqual(Array.from(bytes));
  });
  it('PCM16k 转 WAV 头正确', () => {
    const pcm = new Uint8Array(3200); // 0.1s
    const wav = b64ToBytes(pcm16kToWav(bytesToB64(pcm)));
    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const tag = (o: number) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(12)).toBe('fmt ');
    expect(dv.getUint32(4, true)).toBe(36 + pcm.length);
    expect(dv.getUint16(20, true)).toBe(1); // PCM
    expect(dv.getUint16(22, true)).toBe(1); // mono
    expect(dv.getUint32(24, true)).toBe(16000);
    expect(dv.getUint32(28, true)).toBe(32000);
    expect(dv.getUint16(34, true)).toBe(16);
    expect(tag(36)).toBe('data');
    expect(dv.getUint32(40, true)).toBe(pcm.length);
    expect(wav.length).toBe(44 + pcm.length);
  });
});
