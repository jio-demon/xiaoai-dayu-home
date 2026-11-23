import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';

/** 可漫游角色统一接口：占位几何 / 混元 GLB / VRM 都包一层。 */
export interface RoamCharacter {
  group: THREE.Object3D;
  setState(s: VoiceState): void;
  pet(): void;
  update(t: number, dt: number): void;
}

export interface LocomotionOpts {
  /** 闲逛范围（已避开家具的地板矩形） */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 唤醒/对话时走到的“镜头前左侧”站位 */
  engageSpot: { x: number; z: number };
  /** 朝向镜头时的 yaw（模型正面为 +z） */
  faceYaw?: number;
  home: { x: number; z: number };
  walkSpeed?: number;
  engageSpeed?: number;
  /** 秒级时钟，默认 performance.now；测试可注入 */
  now?: () => number;
}

const TWO_PI = Math.PI * 2;
const wrapAngle = (a: number) => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

/**
 * 角色 locomotion：待机随机溜达（挑点→转身→小碎步走过去→停下发呆），
 * 一旦进入 listening/thinking/speaking 立刻小跑到镜头左侧站位面向用户，
 * 回到 idle 数秒后恢复闲逛。位移/朝向由本类接管，呼吸蹦跳等姿态动画仍由内层角色负责。
 */
export class Locomotion {
  private state: VoiceState = 'idle';
  private phase: 'pause' | 'walk' = 'pause';
  private pauseLeft: number;
  private target = new THREE.Vector2();
  private yaw: number;
  private yawTarget: number;
  private engaged = false;
  private idleSince = 0;
  private walkBlend = 0;
  private stepPhase = Math.random() * TWO_PI;
  private addY = 0;
  private addZ = 0;
  private addS = 0;
  private readonly faceYaw: number;
  private readonly walkSpeed: number;
  private readonly engageSpeed: number;
  private readonly now: () => number;

  constructor(private inner: RoamCharacter, private opts: LocomotionOpts) {
    this.yaw = this.faceYaw = opts.faceYaw ?? 0;
    this.yawTarget = this.yaw;
    this.walkSpeed = opts.walkSpeed ?? 0.5;
    this.engageSpeed = opts.engageSpeed ?? 1.05;
    this.now = opts.now ?? (() => performance.now() / 1000);
    this.pauseLeft = 1.5 + Math.random() * 3;
    this.target.set(opts.home.x, opts.home.z);
    inner.group.position.set(opts.home.x, 0, opts.home.z);
    inner.group.rotation.y = this.yaw;
  }

  get position() { return this.inner.group.position; }
  get isEngaged() { return this.engaged; }
  /** 是否真的在移动（engaged 站定后 phase 仍是 walk，但不再位移） */
  get isWalking() { return this.walkBlend > 0.1; }

  setState(s: VoiceState) {
    this.state = s;
    this.inner.setState(s);
    if (s !== 'idle') {
      // 唤醒/对话：马上走向镜头左侧
      this.engaged = true;
      this.phase = 'walk';
      this.target.set(this.opts.engageSpot.x, this.opts.engageSpot.z);
    } else {
      this.idleSince = this.now();
    }
  }

  pet() { this.inner.pet(); }

  private pickWanderTarget() {
    const b = this.opts.bounds;
    const p = this.inner.group.position;
    // 最多试 8 次，找一个离当前位置 0.5~2.2m 的新落脚点，避免原地打转
    for (let i = 0; i < 8; i++) {
      const x = b.minX + Math.random() * (b.maxX - b.minX);
      const z = b.minZ + Math.random() * (b.maxZ - b.minZ);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 0.5 && d < 2.2) { this.target.set(x, z); return; }
    }
    this.target.set((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  }

  update(t: number, dt: number) {
    const g = this.inner.group;
    // idle 停留 6 秒后才离开互动位，避免一句话间隙来回跑
    if (this.engaged && this.state === 'idle' && this.now() - this.idleSince > 6) {
      this.engaged = false;
      this.phase = 'pause';
      this.pauseLeft = 0.8 + Math.random() * 2;
    }

    if (!this.engaged && this.phase === 'pause') {
      this.pauseLeft -= dt;
      this.yawTarget = this.faceYaw + Math.sin(t * 0.35) * 0.3; // 发呆时东张西望
      if (this.pauseLeft <= 0) { this.pickWanderTarget(); this.phase = 'walk'; }
    }

    let walking = false;
    if (this.phase === 'walk') {
      const dx = this.target.x - g.position.x;
      const dz = this.target.y - g.position.z;
      const dist = Math.hypot(dx, dz);
      const speed = this.engaged ? this.engageSpeed : this.walkSpeed;
      const step = speed * dt;
      if (dist <= Math.max(step, 0.02)) {
        // 最后一步直接吸附到目标点，避免“永远差半步”原地踏步
        g.position.x = this.target.x;
        g.position.z = this.target.y;
        if (this.engaged) {
          this.yawTarget = this.faceYaw; // 站定面向镜头
        } else {
          this.phase = 'pause';
          this.pauseLeft = 2.5 + Math.random() * 5;
        }
      } else {
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
        this.yawTarget = Math.atan2(dx, dz);
        walking = true;
      }
    }

    // 平滑转身（角速度上限 ~3.2rad/s，小碎步转身不突兀）
    const dy = wrapAngle(this.yawTarget - this.yaw);
    this.yaw = wrapAngle(this.yaw + dy * Math.min(1, dt * 5));

    // 内层姿态动画约定：每帧绝对写入姿态（y 以地面 0 为基准、yaw 为相对摇摆量）。
    // 先复位再跑内层，最后叠加本类的朝向与走路弹跳，杜绝任何逐帧累积。
    g.position.y = 0;
    g.rotation.y = 0;
    this.inner.update(t, dt);
    g.rotation.y += this.yaw;

    // 走路姿态：小弹跳 + 左右轻摆 + 微微前倾。
    // 每帧记录自己叠加的量并在下一帧先扣除，兼容“绝对写入”与“+= 累积”两种内层实现。
    g.position.y -= this.addY;
    g.rotation.z -= this.addZ;
    g.scale.x /= 1 + this.addS; g.scale.y /= 1 - this.addS; g.scale.z /= 1 + this.addS;
    this.walkBlend += ((walking ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 7);
    this.addY = this.addZ = this.addS = 0;
    if (this.walkBlend > 0.005) {
      this.stepPhase += dt * (this.engaged ? 11 : 7.5);
      const w = this.walkBlend;
      this.addY = Math.abs(Math.sin(this.stepPhase)) * 0.045 * w;
      this.addZ = Math.sin(this.stepPhase) * 0.05 * w;
      this.addS = Math.sin(this.stepPhase * 2) * 0.015 * w;
      g.position.y += this.addY;
      g.rotation.z += this.addZ;
      g.rotation.x = 0.05 * w;
      g.scale.set(g.scale.x * (1 + this.addS), g.scale.y * (1 - this.addS), g.scale.z * (1 + this.addS));
    } else {
      g.rotation.x = 0;
    }
  }
}
