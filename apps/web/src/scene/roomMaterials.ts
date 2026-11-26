import * as THREE from 'three';
import { woodFloor, wall, blanket, whaleRug } from './textures';

export const ROOM_TEXTURE_FILES = {
  wood: 'assets/room/wood.png', wall: 'assets/room/wall.png',
  bedding: 'assets/room/bedding.png', rug: 'assets/room/rug.png', curtain: 'assets/room/curtain.png',
} as const;
export type RoomTextureKey = keyof typeof ROOM_TEXTURE_FILES;
export type TextureLoader = (url: string) => Promise<THREE.Texture>;

export interface RoomMaterials extends Record<RoomTextureKey, THREE.MeshLambertMaterial> {
  ready: Promise<void>;
  dispose(): void;
}

/** 首帧完全程序化；图片逐张异步替换，失败或超时不影响其他材质。 */
export function createRoomMaterials(load?: TextureLoader, timeoutMs = 6000): RoomMaterials {
  let disposed = false;
  const owned = new Set<THREE.Texture>();
  const make = (canvas: HTMLCanvasElement, rx = 1, ry = 1) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace;
    owned.add(t); return t;
  };
  const materials = {
    wood: new THREE.MeshLambertMaterial({ map: make(woodFloor(), 3, 2) }),
    wall: new THREE.MeshLambertMaterial({ map: make(wall(), 4, 2) }),
    bedding: new THREE.MeshLambertMaterial({ map: make(blanket(), 2, 2) }),
    rug: new THREE.MeshLambertMaterial({ map: make(whaleRug()) }),
    curtain: new THREE.MeshLambertMaterial({ color: 0x91afbf, side: THREE.DoubleSide }),
  };
  const defaultLoad: TextureLoader = (url) => new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
  const loader = load ?? defaultLoad;
  const jobs = (Object.keys(ROOM_TEXTURE_FILES) as RoomTextureKey[]).map(async (key) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const texture = await Promise.race([
        loader(ROOM_TEXTURE_FILES[key]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('texture timeout')), timeoutMs); }),
      ]);
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.copy(materials[key].map?.repeat ?? new THREE.Vector2(1, 1));
      const old = materials[key].map;
      materials[key].map = texture; materials[key].color.setHex(0xffffff);
      materials[key].needsUpdate = true; owned.add(texture);
      if (old) { old.dispose(); owned.delete(old); }
    } catch { /* 保留已经可用的 Canvas / 纯色材质。 */ }
    finally { if (timer) clearTimeout(timer); }
  });
  return {
    ...materials,
    ready: Promise.all(jobs).then(() => undefined),
    dispose() {
      if (disposed) return;
      disposed = true;
      owned.forEach((t) => t.dispose()); owned.clear();
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
