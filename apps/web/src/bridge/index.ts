import type { BridgeApi } from '@xiaoai/protocol';
import { MockBridge } from './mock';
import { NativeBridge, hasNative, isDeviceShellPage, waitForNative } from './native';

let bridge: (BridgeApi & { emit?: (e: any) => void }) | null = null;
let bridgeIsNative = false;

/**
 * 设备回环页只能使用原生桥。首次渲染时对象尚未出现也不能缓存 MockBridge，
 * 否则会把 SQLite/KWS 悄悄换成浏览器 localStorage/getUserMedia。
 */
export function getBridge(options: { allowMock?: boolean } = {}): BridgeApi {
  const native = hasNative();
  if (!native && !options.allowMock && isDeviceShellPage()) {
    throw new Error('音响原生桥尚未连接，请重新加载界面');
  }
  // 显式创建的 PC 模拟桥也允许在注入对象稍后出现时升级。
  if (!bridge || (native && !bridgeIsNative)) {
    if (bridgeIsNative && !native) throw new Error('原生桥已断开，请重新加载界面');
    bridge = native ? new NativeBridge() : new MockBridge();
    bridgeIsNative = native;
  }
  return bridge;
}
export function getMockBridge(): MockBridge | null {
  return bridge instanceof MockBridge ? bridge : null;
}
/** 只报告已经创建的实际实现，不用 URL 猜测运行模式。 */
export function usesMockBridge(): boolean {
  return bridge instanceof MockBridge;
}
export { hasNative, isDeviceShellPage, waitForNative };
export type { BridgeApi };
