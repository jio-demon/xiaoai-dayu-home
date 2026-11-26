// @vitest-environment jsdom
import './testCanvas';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Fallback25D } from './fallback25d';
import { buildCozyRoom } from './cozyRoom';

describe('initial 2.5D mode', () => {
  it('constructs projected interactions and weather before the first frame', () => {
    const room = buildCozyRoom();
    const originalParent = new THREE.Group();
    const lights = new THREE.Group();
    originalParent.add(room.group, lights);
    lights.add(new THREE.AmbientLight());
    const camera = new THREE.PerspectiveCamera(46, 800 / 480, 0.1, 40);
    camera.position.set(0.2, 2.9, 6.1); camera.lookAt(0, 1.05, -0.3);
    const renderer = {
      getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(), render: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
    const fallback = new Fallback25D(renderer, room, lights, camera);
    // White-box regression: inspect the actual buffers and projected rectangles.
    const internals = fallback as unknown as {
      hitRects: unknown[]; rain: THREE.Points; snow: THREE.Points;
      windowRect: { minX: number; maxX: number; minY: number; maxY: number };
    };
    expect(internals.hitRects).toHaveLength(8);
    expect(room.group.parent).toBe(originalParent);
    expect(lights.parent).toBe(originalParent);
    fallback.setEnvironment(1, 'rain');
    expect(internals.rain.visible).toBe(true);
    expect(internals.snow.visible).toBe(false);
    // GPU attributes use float32; allow one representable rounding step at the window edge.
    const epsilon = 1e-6;
    const positions = internals.rain.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getX(i) / 4).toBeGreaterThanOrEqual(internals.windowRect.minX - epsilon);
      expect(positions.getX(i) / 4).toBeLessThanOrEqual(internals.windowRect.maxX + epsilon);
      expect(positions.getY(i) / 2.4).toBeGreaterThanOrEqual(internals.windowRect.minY - epsilon);
      expect(positions.getY(i) / 2.4).toBeLessThanOrEqual(internals.windowRect.maxY + epsilon);
    }
    fallback.update(1, 0.016);
    expect(renderer.render).toHaveBeenCalled();
    fallback.dispose(); room.dispose?.();
  });
});
