import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';
import { Locomotion, type RoamCharacter } from './locomotion';

function makeInner(): RoamCharacter & { updates: number } {
  const g = new THREE.Group();
  return {
    group: g,
    updates: 0,
    setState(_s: VoiceState) {},
    pet() {},
    update(_t: number, _dt: number) { this.updates++; },
  };
}

const OPTS = {
  bounds: { minX: -1.55, maxX: 2.6, minZ: -1.35, maxZ: 1.9 },
  engageSpot: { x: -1.05, z: 1.35 },
  home: { x: 0.1, z: 0.75 },
  faceYaw: 0.12,
};

function run(loco: Locomotion, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) loco.update(t, dt);
}

describe('Locomotion', () => {
  it('starts at home and eventually wanders within bounds', () => {
    const inner = makeInner();
    const loco = new Locomotion(inner, OPTS);
    expect(loco.position.x).toBeCloseTo(OPTS.home.x);
    expect(loco.position.z).toBeCloseTo(OPTS.home.z);
    let moved = false;
    for (let t = 0; t < 40; t += 1 / 60) {
      loco.update(t, 1 / 60);
      const p = loco.position;
      expect(p.x).toBeGreaterThanOrEqual(OPTS.bounds.minX - 0.01);
      expect(p.x).toBeLessThanOrEqual(OPTS.bounds.maxX + 0.01);
      expect(p.z).toBeGreaterThanOrEqual(OPTS.bounds.minZ - 0.01);
      expect(p.z).toBeLessThanOrEqual(OPTS.bounds.maxZ + 0.01);
      if (Math.hypot(p.x - OPTS.home.x, p.z - OPTS.home.z) > 0.3) moved = true;
    }
    expect(moved).toBe(true);
    expect(inner.updates).toBeGreaterThan(0);
  });

  it('listening walks to engage spot and faces camera', () => {
    const inner = makeInner();
    const loco = new Locomotion(inner, OPTS);
    // 先让她溜达到别处
    run(loco, 15);
    loco.setState('listening');
    expect(loco.isEngaged).toBe(true);
    run(loco, 8);
    expect(loco.position.x).toBeCloseTo(OPTS.engageSpot.x, 1);
    expect(loco.position.z).toBeCloseTo(OPTS.engageSpot.z, 1);
    expect(Math.abs(inner.group.rotation.y - OPTS.faceYaw!)).toBeLessThan(0.15);
    expect(loco.isWalking).toBe(false);
  });

  it('stays engaged through thinking/speaking, resumes wandering after idle grace', () => {
    const inner = makeInner();
    const clock = { t: 0 };
    const loco = new Locomotion(inner, { ...OPTS, now: () => clock.t });
    loco.setState('listening');
    run(loco, 6);
    loco.setState('thinking');
    run(loco, 2);
    loco.setState('speaking');
    run(loco, 3);
    expect(loco.isEngaged).toBe(true);
    expect(loco.position.x).toBeCloseTo(OPTS.engageSpot.x, 1);
    loco.setState('idle');
    run(loco, 3); // 6 秒宽限期内不动
    expect(loco.isEngaged).toBe(true);
    clock.t += 7; // 推进假时钟越过宽限期
    run(loco, 1);
    expect(loco.isEngaged).toBe(false);
  });

  it('walking adds bob but settles back to ground when stopped', () => {
    const inner = makeInner();
    const loco = new Locomotion(inner, OPTS);
    loco.setState('speaking');
    run(loco, 10); // 到位并停稳
    expect(Math.abs(inner.group.position.y)).toBeLessThan(0.05);
    expect(Math.abs(inner.group.rotation.x)).toBeLessThan(0.02);
  });
});
