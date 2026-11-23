import { getBridge, getMockBridge, usesMockBridge } from './index';
import { isDeviceShellPage, waitForNative } from './native';

describe('旧 WebView 原生桥识别', () => {
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;

  afterEach(() => {
    vi.useRealTimers();
    if (originalWindow) globalThis.window = originalWindow;
    else delete (globalThis as any).window;
    if (originalLocation) globalThis.location = originalLocation;
    else delete (globalThis as any).location;
  });

  function setPage(hostname: string, port: string) {
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.location = { protocol: 'http:', hostname, port, host: `${hostname}:${port}` } as Location;
  }

  it('显式创建的模拟桥在原生对象出现后会升级，不再永久缓存 MockBridge', () => {
    setPage('127.0.0.1', '8080');
    const first = getBridge({ allowMock: true });
    expect(first.constructor.name).toBe('MockBridge');
    (window as any).XiaoAiBridge = { getDeviceInfo: () => '{"ip":"192.168.31.149","version":"test"}' };
    const upgraded = getBridge();
    expect(upgraded).not.toBe(first);
    expect(upgraded.constructor.name).toBe('NativeBridge');
    expect(usesMockBridge()).toBe(false);
  });

  it('设备回环页缺少原生桥时拒绝初始化，不偷偷创建 PC 存储', () => {
    setPage('127.0.0.1', '8080');
    expect(() => getBridge()).toThrow('原生桥尚未连接');
    expect(getMockBridge()).toBeNull();
    expect(usesMockBridge()).toBe(false);
  });

  it('只把薄壳自己的回环地址识别为设备页', () => {
    setPage('127.0.0.1', '8080');
    expect(isDeviceShellPage()).toBe(true);
    setPage('localhost', '8080');
    expect(isDeviceShellPage()).toBe(true);
    setPage('127.0.0.1', '5173');
    expect(isDeviceShellPage()).toBe(false);
    setPage('192.168.31.149', '8080');
    expect(isDeviceShellPage()).toBe(false);
  });

  it('等待稍后注入的 XiaoAiBridge，不把首次缺失永久当成 PC', async () => {
    vi.useFakeTimers();
    setPage('127.0.0.1', '8080');
    const pending = waitForNative(1000);
    await vi.advanceTimersByTimeAsync(100);
    (window as any).XiaoAiBridge = { getDeviceInfo: () => '{"ip":"192.168.31.149","version":"test"}' };
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBe(true);
    expect(getBridge().constructor.name).toBe('NativeBridge');
    expect(usesMockBridge()).toBe(false);
  });

  it('原生桥超时未出现时，设备页仍不伪装成 PC 模拟器', async () => {
    vi.useFakeTimers();
    setPage('127.0.0.1', '8080');
    const pending = waitForNative(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBe(false);
    expect(usesMockBridge()).toBe(false);
  });


  it('普通开发地址不等待原生注入', async () => {
    vi.resetModules();
    const fresh = await import('./index');
    setPage('127.0.0.1', '5173');
    await expect(fresh.waitForNative()).resolves.toBe(false);
    expect(fresh.getBridge().constructor.name).toBe('MockBridge');
    expect(fresh.usesMockBridge()).toBe(true);
  });

  it('原生设备信息必须包含字符串 ip/version，坏数据不能伪装成正常设备', async () => {
    setPage('127.0.0.1', '8080');
    (window as any).XiaoAiBridge = { getDeviceInfo: () => '{"ip":123,"version":"test"}' };
    await expect(getBridge().getDeviceInfo()).rejects.toThrow('格式无效');
    (window as any).XiaoAiBridge.getDeviceInfo = () => '{"ip":"192.168.31.87","version":"0.1.0"}';
    await expect(getBridge().getDeviceInfo()).resolves.toEqual({ ip: '192.168.31.87', version: '0.1.0' });
  });
});
