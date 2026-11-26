import * as THREE from 'three';
import { chibiCanvas } from './characterSprite';

export const CHARACTER_SPRITE_FILES = [
  'assets/room/dayu-idle-0.png', 'assets/room/dayu-idle-1.png',
  'assets/room/dayu-happy-0.png', 'assets/room/dayu-happy-1.png',
] as const;
export type SpriteLoader = (url: string) => Promise<THREE.Texture>;
export interface SpriteFrames { normal: THREE.Texture[]; happy: THREE.Texture[]; ready: Promise<boolean>; dispose(): void }

/** GLB 烘焙帧优先；任意一帧缺失则整组回退，避免两种形象混切。 */
export function createSpriteFrames(load?: SpriteLoader, timeoutMs = 6000): SpriteFrames {
  let disposed = false;
  const canvasFrames = [0, 1].map((f) => new THREE.CanvasTexture(chibiCanvas(f as 0 | 1, false)));
  const canvasHappy = [0, 1].map((f) => new THREE.CanvasTexture(chibiCanvas(f as 0 | 1, true)));
  const normal: THREE.Texture[] = [...canvasFrames];
  const happy: THREE.Texture[] = [...canvasHappy];
  const loaded: THREE.Texture[] = [];
  const loader = load ?? ((url) => new Promise<THREE.Texture>((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject)));
  const ready = Promise.all(CHARACTER_SPRITE_FILES.map(async (url) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const texture = await Promise.race([loader(url), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('sprite timeout')), timeoutMs);
      })]);
      if (disposed) { texture.dispose(); return null; }
      texture.colorSpace = THREE.SRGBColorSpace;
      loaded.push(texture); return texture;
    } catch { return null; }
    finally { if (timer) clearTimeout(timer); }
  })).then((textures) => {
    if (disposed || textures.some((t) => !t)) {
      loaded.forEach((t) => t.dispose()); loaded.length = 0; return false;
    }
    normal.splice(0, 2, textures[0]!, textures[1]!);
    happy.splice(0, 2, textures[2]!, textures[3]!);
    [...canvasFrames, ...canvasHappy].forEach((t) => t.dispose());
    return true;
  });
  return { normal, happy, ready, dispose() {
    if (disposed) return;
    disposed = true;
    [...canvasFrames, ...canvasHappy, ...loaded].forEach((t) => t.dispose());
  } };
}
