import './testCanvas';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROOM_LAYOUT, INTERACTIVE_NAMES, isInsideWalkBounds, hitScreenRect, roomDate } from './roomLayout';
import { buildCozyRoom } from './cozyRoom';
import { createDefaultRoom } from './sceneManager';

describe('cream sea-salt room', () => {
  it('shares a metric layout with Blender and keeps all walk targets inside bounds', () => {
    expect(ROOM_LAYOUT.width).toBe(8); expect(ROOM_LAYOUT.depth).toBe(6);
    for (const p of [ROOM_LAYOUT.home, ROOM_LAYOUT.engageSpot]) expect(isInsideWalkBounds(p.x,p.z)).toBe(true);
    expect(isInsideWalkBounds(-1.56,0)).toBe(false); expect(isInsideWalkBounds(NaN,0)).toBe(false);
    expect(isInsideWalkBounds(0,1.91)).toBe(false);
  });
  it('builds the new default with eight distinct interactions and bounded geometry', () => {
    const result = createDefaultRoom();
    expect(result.fallbackUsed).toBe(false);
    const room = result.room;
    expect(room.group.name).toContain('Cream_SeaSalt');
    expect(new Set(room.interactives.map(i=>i.name))).toEqual(new Set(INTERACTIVE_NAMES));
    const left = room.group.getObjectByName('wall_left') as THREE.Mesh;
    const right = room.group.getObjectByName('wall_right') as THREE.Mesh;
    const ceiling = room.group.getObjectByName('ceiling') as THREE.Mesh;
    expect(right.material).toBe(left.material);
    expect(ceiling.material).toBe(left.material);
    expect(right.position.x).toBe(-left.position.x);
    expect(ceiling.position.y).toBeGreaterThan(ROOM_LAYOUT.height);
    let triangles=0, drawCalls=0;
    room.group.traverse(o=>{
      const m=o as THREE.Mesh;
      if(m.isMesh || (o as THREE.Points).isPoints) drawCalls+=Array.isArray(m.material)?m.material.length:1;
      if(m.isMesh) triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;
    });
    console.log(`[room geometry] ${triangles} triangles / ${drawCalls} draw calls`);
    expect(triangles).toBeLessThanOrEqual(30000); expect(drawCalls).toBeLessThanOrEqual(150);
    room.setWeather('rain'); room.update(1,.016,1);
    const window=room.interactives.find(i=>i.name==='window')!.object;
    expect(window.children.filter(o=>(o as THREE.Points).isPoints).some(o=>o.visible)).toBe(true);
    room.setWeather('snow'); expect(window.children.filter(o=>(o as THREE.Points).isPoints).filter(o=>o.visible).length).toBe(1);
    room.dispose?.();
  });
  it('projects stable screen rectangles and prioritizes smaller targets', () => {
    const rects=[{name:'bed',minX:-.8,maxX:-.2,minY:-.7,maxY:.2},{name:'plushie',minX:-.6,maxX:-.4,minY:-.1,maxY:.1}];
    expect(hitScreenRect(rects,-.5,0)).toBe('bed');
    const area=(r:typeof rects[number])=>(r.maxX-r.minX)*(r.maxY-r.minY);
    expect(hitScreenRect([...rects].sort((a,b)=>area(a)-area(b)),-.5,0)).toBe('plushie');
    expect(hitScreenRect(rects,.9,.9)).toBeNull();
  });
  it('uses deterministic preview time without changing normal clock behavior', () => {
    (globalThis as any).__roomPreview={hour:22.5};
    expect(roomDate().getHours()).toBe(22); expect(roomDate().getMinutes()).toBe(30);
    delete (globalThis as any).__roomPreview;
    const now=new Date(2025,2,3,8); expect(roomDate(now)).toBe(now);
  });
});
