// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeEvent } from '@xiaoai/protocol';
import { MockBridge } from './mock';

class FakeAudioContext {
  state = 'running';
  sampleRate = 16000;
  destination = {};
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createScriptProcessor() { return { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

function installMic() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  let grant!: (stream: MediaStream) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>(res => { grant = res; }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
  return { stream, track, getUserMedia, grant: (value: MediaStream) => grant(value) };
}

afterEach(() => vi.restoreAllMocks());

describe('MockBridge microphone lifecycle', () => {
  it('does not report a successful stop or mode switch as startup failure', async () => {
    const mic = installMic();
    const bridge = new MockBridge();
    const events: BridgeEvent[] = [];
    bridge.onEvent(e => events.push(e));
    const starting = bridge.startMic('record');
    mic.grant(mic.stream);
    await starting;
    await bridge.stopMic();
    const switching = bridge.startMic('kws');
    mic.grant(mic.stream);
    await switching;
    expect(events).toEqual([{ type: 'mic', state: 'on' }, { type: 'mic', state: 'on' }]);
    await bridge.stopMic();
    expect(mic.track.stop).toHaveBeenCalledTimes(2);
  });

  it('emits off when permission is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
    const bridge = new MockBridge();
    const events: BridgeEvent[] = [];
    bridge.onEvent(e => events.push(e));
    await expect(bridge.startMic('record')).rejects.toThrow('denied');
    expect(events).toEqual([{ type: 'mic', state: 'off' }]);
  });

  it('stops a late stream from a cancelled start without reviving the microphone', async () => {
    const mic = installMic();
    const bridge = new MockBridge();
    const events: BridgeEvent[] = [];
    bridge.onEvent(e => events.push(e));
    const pending = bridge.startMic('record');
    await bridge.stopMic();
    mic.grant(mic.stream);
    await pending;
    expect(mic.track.stop).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
    expect((bridge as any).micStream).toBeNull();
  });

  it('reports an audio setup failure and releases its stream', async () => {
    const mic = installMic();
    Object.defineProperty(window, 'AudioContext', { configurable: true,
      value: class { constructor() { throw new Error('audio unavailable'); } } });
    const bridge = new MockBridge();
    const events: BridgeEvent[] = [];
    bridge.onEvent(e => events.push(e));
    const pending = bridge.startMic('record');
    mic.grant(mic.stream);
    await expect(pending).rejects.toThrow('audio unavailable');
    expect(events).toEqual([{ type: 'mic', state: 'off' }]);
    expect(mic.track.stop).toHaveBeenCalledOnce();
  });
});
