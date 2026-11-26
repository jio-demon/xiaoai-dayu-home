/** Blender 与 Web 共用的米制布局。修改时同步 tools/assets/blender/layout.json。 */
export const ROOM_LAYOUT = {
  width: 8, depth: 6, height: 3.2,
  bed: { x: -2.75, z: -0.5, width: 1.75, depth: 2.7 },
  window: { x: -0.65, y: 1.95, z: -2.96, width: 2.35, height: 1.55 },
  desk: { x: 2.3, z: -2.25, width: 2.15, depth: 0.9, height: 0.79 },
  rug: { x: 0, z: 0.7, radius: 1.3 },
  wardrobe: { x: 3.65, z: 0.9 },
  shelf: { x: -3.8, z: 1.7 },
  plant: { x: -3.35, z: 2.5 },
  camera: { position: [0.2, 2.9, 6.1], target: [0, 1.05, -0.3], fov: 46 },
  bounds: { minX: -1.55, maxX: 2.6, minZ: -1.35, maxZ: 1.9 },
  engageSpot: { x: -1.05, z: 1.35 },
  home: { x: 0.1, z: 0.75 },
  faceYaw: 0.12,
} as const;

export const INTERACTIVE_NAMES = ['window', 'bed', 'plushie', 'monitor', 'lamp', 'rug', 'radio', 'plant'] as const;
export type InteractiveName = typeof INTERACTIVE_NAMES[number];

export function isInsideWalkBounds(x: number, z: number): boolean {
  const b = ROOM_LAYOUT.bounds;
  return Number.isFinite(x) && Number.isFinite(z) && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

/** 旧版屏幕矩形的归一化坐标；新版由真实相机投影生成，避免手调漂移。 */
export interface ScreenRect { name: string; minX: number; maxX: number; minY: number; maxY: number }
export function hitScreenRect(rects: readonly ScreenRect[], nx: number, ny: number): string | null {
  for (const r of rects) if (nx >= r.minX && nx <= r.maxX && ny >= r.minY && ny <= r.maxY) return r.name;
  return null;
}

/** Deterministic daylight for previews and regression tests; live mode remains the default. */
export function roomDate(now = new Date()): Date {
  const preview = (globalThis as typeof globalThis & { __roomPreview?: { hour?: number } }).__roomPreview;
  return preview && Number.isFinite(preview.hour)
    ? new Date(2026, 0, 1, Math.floor(preview.hour!), Math.round((preview.hour! % 1) * 60))
    : now;
}