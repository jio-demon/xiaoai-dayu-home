/** jsdom has Canvas elements but no raster backend. Keep geometry tests real;
 * pixel appearance is verified separately in Chromium (tools/e2e-cozy-room.mjs).
 * This helper is imported only by scene tests, never by the application bundle.
 */
const gradient = () => ({ addColorStop() {} });
const context = (canvas: HTMLCanvasElement) => new Proxy({
  canvas,
  createLinearGradient: gradient,
  createRadialGradient: gradient,
  createPattern: () => ({}),
  measureText: (text: string) => ({ width: text.length * 8 }),
  toDataURL: () => 'data:image/png;base64,',
  getImageData: (_x: number, _y: number, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4), width, height,
  }),
}, {
  get(target, property) {
    if (property in target) return Reflect.get(target, property);
    return () => undefined;
  },
  set(target, property, value) { return Reflect.set(target, property, value); },
});
const original = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: unknown) {
  if (kind === '2d') return context(this) as unknown as CanvasRenderingContext2D;
  return original.call(this, kind as 'webgl', options) as unknown as CanvasRenderingContext2D;
} as typeof original;
