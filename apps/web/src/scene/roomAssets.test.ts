import './testCanvas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createRoomMaterials, ROOM_TEXTURE_FILES } from './roomMaterials';
import { createSpriteFrames, CHARACTER_SPRITE_FILES } from './spriteAssets';

afterEach(()=>vi.useRealTimers());
const texture=()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
describe('progressive room textures',()=>{
  it('starts with five procedural maps and replaces each successful load independently',async()=>{
    const pending=new Map<string,(t:THREE.Texture)=>void>();
    const mats=createRoomMaterials(url=>new Promise(resolve=>pending.set(url,resolve)));
    expect(Object.values(ROOM_TEXTURE_FILES).every(url=>pending.has(url))).toBe(true);
    const first=mats.wood.map; expect(first).toBeInstanceOf(THREE.CanvasTexture);
    const loaded=texture(); pending.get(ROOM_TEXTURE_FILES.wood)!(loaded);
    await vi.waitFor(()=>expect(mats.wood.map).toBe(loaded));
    expect(mats.wall.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(loaded.repeat.x).toBe(3); expect(loaded.colorSpace).toBe(THREE.SRGBColorSpace);
    mats.dispose();
    for(const resolve of pending.values())resolve(texture());
    await mats.ready;
  });
  it('times out a stalled texture without blocking another material',async()=>{
    vi.useFakeTimers(); const replacement=texture();
    const mats=createRoomMaterials(url=>url.endsWith('wall.png')?Promise.resolve(replacement):new Promise(()=>{}),25);
    await vi.advanceTimersByTimeAsync(30); await mats.ready;
    expect(mats.wall.map).toBe(replacement); expect(mats.wood.map).toBeInstanceOf(THREE.CanvasTexture);
    mats.dispose();
  });
  it('keeps Canvas fallback on rejection and disposes late arrivals',async()=>{
    const mats=createRoomMaterials(()=>Promise.reject(new Error('offline')));
    await mats.ready; expect(mats.rug.map).toBeInstanceOf(THREE.CanvasTexture);
    let late:THREE.Texture|undefined; const disposed=vi.fn();
    const second=createRoomMaterials(()=>new Promise(resolve=>{late=texture();late.addEventListener('dispose',disposed);resolve(late);}));
    second.dispose(); await second.ready; expect(disposed).toHaveBeenCalled(); mats.dispose();
  });
});
describe('GLB-baked sprite replacement',()=>{
  it('replaces all four frames only after every frame succeeds',async()=>{
    const sprites=createSpriteFrames(async()=>texture());
    expect(sprites.normal[0]).toBeInstanceOf(THREE.CanvasTexture);
    expect(await sprites.ready).toBe(true);
    expect(sprites.normal.every(t=>!(t instanceof THREE.CanvasTexture))).toBe(true);
    expect(sprites.happy.every(t=>!(t instanceof THREE.CanvasTexture))).toBe(true);
    sprites.dispose();
  });
  it('retains one coherent Canvas set on partial failure',async()=>{
    const sprites=createSpriteFrames(async url=>url.endsWith('happy-1.png')?Promise.reject(new Error('missing')):texture());
    expect(await sprites.ready).toBe(false);
    expect([...sprites.normal,...sprites.happy].every(t=>t instanceof THREE.CanvasTexture)).toBe(true);
    sprites.dispose();
  });
  it('loads expected paths and safely handles disposal before completion',async()=>{
    const urls:string[]=[]; const sprites=createSpriteFrames(async url=>{urls.push(url);return texture();});
    expect(urls).toEqual([...CHARACTER_SPRITE_FILES]); sprites.dispose(); expect(await sprites.ready).toBe(false);
  });
});
describe('shipped PNG budgets', () => {
  it('ships exactly five 512-square textures under 2 MiB and four transparent sprites under 512 KiB', () => {
    const read=(url:string)=>readFileSync(resolve(process.cwd(),'public',url));
    const dimensions=(png:Buffer)=>[png.readUInt32BE(16),png.readUInt32BE(20)];
    let textureBytes=0;
    for(const url of Object.values(ROOM_TEXTURE_FILES)) {
      const png=read(url); expect(dimensions(png)).toEqual([512,512]); textureBytes+=png.length;
    }
    let spriteBytes=0;
    for(const url of CHARACTER_SPRITE_FILES) {
      const png=read(url); expect(dimensions(png)).toEqual([320,400]);
      expect(png[25]).toBe(3); // indexed-color PNG
      // Decode the actual tRNS chunk: a missing palette index silently becomes opaque black.
      let offset = 8, transparency: Buffer | undefined;
      while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        if (png.toString('ascii', offset + 4, offset + 8) === 'tRNS') transparency = png.subarray(offset + 8, offset + 8 + length);
        offset += length + 12;
      }
      expect(transparency?.length).toBe(256);
      expect(transparency?.[255]).toBe(0);
      spriteBytes+=png.length;
    }
    console.log(`[room assets] textures=${textureBytes} bytes; sprites=${spriteBytes} bytes`);
    expect(textureBytes).toBeLessThanOrEqual(2*1024*1024);
    expect(spriteBytes).toBeLessThanOrEqual(512*1024);
  });
});
