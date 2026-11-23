import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';
import { chibiCanvas } from './characterSprite';
import type { RoomHandles } from './room';
import type { WeatherCondition } from './sky';

/**
 * 2.5D 降级模式：把整个 3D 房间一次性烘焙成背景纹理，
 * 之后每帧只画背景四边形 + 立绘 + 雨滴 + 屏幕光晕（个位数 draw call）。
 */
export class Fallback25D {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-4, 4, 2.4, -2.4, 0.1, 20);
  private sprite: THREE.Mesh;
  private frames: THREE.CanvasTexture[] = [];
  private happyFrames: THREE.CanvasTexture[] = [];
  private rain: THREE.Points;
  private rainSpeed: Float32Array;
  private glow: THREE.Mesh;
  private frameTimer = 0;
  private frameIdx = 0;
  private state: VoiceState = 'idle';
  private petUntil = -1;
  private rt: THREE.WebGLRenderTarget;
  // 2.5D 简化版闲逛：立绘在屏幕下方横向溜达，唤醒后滑到左侧
  private spriteX = 0.1;
  private spriteTargetX = 0.1;
  private wanderTimer = 3;
  private engaged = false;
  private idleSince = 0;
  // 环境联动：烘焙背景 + 色调遮罩（夜/阴雨压暗），雨粒子按天气开关，低频重烘焙
  private renderer: THREE.WebGLRenderer;
  private room: RoomHandles;
  private lights: THREE.Group;
  private bakeCamera: THREE.Camera;
  private tint: THREE.Mesh;
  private snow: THREE.Points;
  private snowSpeed: Float32Array;
  private weather: WeatherCondition = 'rain';
  private night = 1;
  private rebakeTimer = 0;
  private lastBakeKey = '';

  constructor(renderer: THREE.WebGLRenderer, room: RoomHandles, lights: THREE.Group, bakeCamera: THREE.Camera) {
    this.camera.position.z = 5;
    this.renderer = renderer;
    this.room = room;
    this.lights = lights;
    this.bakeCamera = bakeCamera;
    // 烘焙房间
    const bakeScene = new THREE.Scene();
    bakeScene.background = new THREE.Color(0x0b1020);
    bakeScene.add(lights.clone());
    bakeScene.add(room.group.clone(true)); // 克隆烘焙，避免把房间从 3D 主场景抢走
    this.rt = new THREE.WebGLRenderTarget(800, 480);
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(bakeScene, bakeCamera);
    renderer.setRenderTarget(prevTarget);

    const bg = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.8), new THREE.MeshBasicMaterial({ map: this.rt.texture }));
    bg.position.z = -1;
    this.scene.add(bg);
    this.lastBakeKey = this.bakeKey();

    // 昼夜/天气色调遮罩（叠在背景上、立绘下）
    this.tint = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4.8),
      new THREE.MeshBasicMaterial({ color: 0x0a1230, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.tint.position.z = -0.5;
    this.scene.add(this.tint);

    // 立绘（两帧尾巴摆动 + 开心帧）
    for (const f of [0, 1] as const) {
      this.frames.push(new THREE.CanvasTexture(chibiCanvas(f, false)));
      this.happyFrames.push(new THREE.CanvasTexture(chibiCanvas(f, true)));
    }
    this.sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.44),
      new THREE.MeshBasicMaterial({ map: this.frames[0], transparent: true }),
    );
    this.sprite.position.set(0.1, -1.05, 0.2);
    this.scene.add(this.sprite);

    // 雨（窗区域近似屏幕坐标）
    const N = 60;
    const pos = new Float32Array(N * 3);
    this.rainSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = -1.9 + Math.random() * 1.7;
      pos[i * 3 + 1] = 0.35 + Math.random() * 1.2;
      pos[i * 3 + 2] = 0.1;
      this.rainSpeed[i] = 1 + Math.random() * 1.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9db8e8, size: 0.03, transparent: true, opacity: 0.65 }));
    this.scene.add(this.rain);

    // 雪（同窗区域）
    const SN = 40;
    const spos = new Float32Array(SN * 3);
    this.snowSpeed = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      spos[i * 3] = -1.9 + Math.random() * 1.7;
      spos[i * 3 + 1] = 0.35 + Math.random() * 1.2;
      spos[i * 3 + 2] = 0.1;
      this.snowSpeed[i] = 0.15 + Math.random() * 0.2;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.snow = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xf0f6ff, size: 0.04, transparent: true, opacity: 0.85 }));
    this.snow.visible = false;
    this.scene.add(this.snow);
    this.applyWeatherVisibility();
    this.setEnvironment(1, 'rain'); // 初始雨夜氛围，与 3D 默认一致

    // 显示器光晕
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x7fb2e5, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.position.set(1.75, 0.15, 0.15);
    this.scene.add(this.glow);
  }

  private bakeKey() {
    const d = new Date();
    return `${Math.floor(d.getHours() * 2)}|${this.weather}`; // 半小时粒度
  }

  private applyWeatherVisibility() {
    this.rain.visible = this.weather === 'rain' || this.weather === 'drizzle' || this.weather === 'thunder';
    (this.rain.material as THREE.PointsMaterial).opacity = this.weather === 'drizzle' ? 0.4 : 0.65;
    this.snow.visible = this.weather === 'snow';
  }

  /** 昼夜 + 天气：色调遮罩即时生效；背景每半小时/天气变化重烘焙一次。 */
  setEnvironment(night: number, weather: WeatherCondition) {
    this.night = night;
    const changed = weather !== this.weather;
    this.weather = weather;
    if (changed) this.applyWeatherVisibility();
    const dimMap: Record<WeatherCondition, number> = { clear: 0, cloudy: 0.06, overcast: 0.14, fog: 0.12, drizzle: 0.16, rain: 0.22, snow: 0.1, thunder: 0.3 };
    const m = this.tint.material as THREE.MeshBasicMaterial;
    m.opacity = Math.min(0.55, night * 0.32 + dimMap[weather] * (1 - night * 0.4));
    m.color.setHex(night > 0.5 ? 0x0a1230 : 0x33405a);
    if (changed || this.bakeKey() !== this.lastBakeKey) this.rebakeTimer = Math.max(this.rebakeTimer, 0.01);
  }

  private rebake() {
    this.lastBakeKey = this.bakeKey();
    this.room.setWeather(this.weather);
    this.room.update(performance.now() / 1000, 0.016, this.night);
    const bakeScene = new THREE.Scene();
    bakeScene.background = new THREE.Color(0x0b1020);
    bakeScene.add(this.lights.clone());
    bakeScene.add(this.room.group.clone(true));
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(bakeScene, this.bakeCamera);
    this.renderer.setRenderTarget(prevTarget);
  }

  setState(s: VoiceState) {
    this.state = s;
    if (s !== 'idle') { this.engaged = true; this.spriteTargetX = -1.35; }
    else this.idleSince = performance.now() / 1000;
  }
  pet() { this.petUntil = performance.now() / 1000 + 1.6; }

  update(t: number, dt: number) {
    this.frameTimer += dt;
    const happy = performance.now() / 1000 < this.petUntil;
    if (this.frameTimer > (this.state === 'speaking' || happy ? 0.22 : 0.5)) {
      this.frameTimer = 0;
      this.frameIdx = 1 - this.frameIdx;
      const set = happy ? this.happyFrames : this.frames;
      (this.sprite.material as THREE.MeshBasicMaterial).map = set[this.frameIdx];
    }
    // 闲逛 / 走向互动位
    if (this.engaged && this.state === 'idle' && performance.now() / 1000 - this.idleSince > 6) {
      this.engaged = false;
      this.wanderTimer = 1 + Math.random() * 2;
    }
    if (!this.engaged) {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.spriteTargetX = -1.5 + Math.random() * 2.6;
        this.wanderTimer = 4 + Math.random() * 6;
      }
    }
    const dx = this.spriteTargetX - this.spriteX;
    const speed = this.engaged ? 1.6 : 0.45;
    const moving = Math.abs(dx) > 0.03;
    if (moving) this.spriteX += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
    this.sprite.position.x = this.spriteX;
    this.sprite.position.y = -1.05 + Math.sin(t * 1.6) * 0.02
      + (happy ? Math.abs(Math.sin(t * 9)) * 0.05 : 0)
      + (moving ? Math.abs(Math.sin(t * 8)) * 0.035 : 0);
    if (this.rebakeTimer > 0) {
      this.rebakeTimer -= dt;
      if (this.rebakeTimer <= 0) this.rebake();
    } else if (this.bakeKey() !== this.lastBakeKey) {
      this.rebakeTimer = 2; // 半小时节点：延迟 2s 重烘焙，避免整点卡顿
    }
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.rainSpeed.length; i++) {
        let y = pos.getY(i) - this.rainSpeed[i] * dt;
        if (y < 0.3) y = 1.55;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    if (this.snow.visible) {
      const sp = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.snowSpeed.length; i++) {
        let y = sp.getY(i) - this.snowSpeed[i] * dt;
        if (y < 0.3) y = 1.55;
        sp.setY(i, y);
        sp.setX(i, sp.getX(i) + Math.sin(t * 0.8 + i) * 0.05 * dt);
      }
      sp.needsUpdate = true;
    }
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.07 * Math.abs(Math.sin(t * 3.1));
  }

  /** 屏幕归一化坐标(-1..1) → 交互对象名。 */
  hitTest(nx: number, ny: number): string | null {
    const x = nx * 4; const y = ny * 2.4;
    if (x > this.spriteX - 0.65 && x < this.spriteX + 0.75 && y > -1.85 && y < -0.25) return 'character';
    if (x > 1.3 && x < 2.3 && y > -0.2 && y < 0.6) return 'monitor';
    if (x > -2.1 && x < -0.2 && y > 0.3 && y < 1.6) return 'window';
    if (x > -3.6 && x < -1.9 && y > -1.6 && y < 0.1) return 'bed';
    if (x > -3.9 && x < -3.2 && y > 0.2 && y < 1.0) return 'radio';
    if (x > 2.7 && x < 3.5 && y > -0.4 && y < 0.5) return 'lamp';
    if (x > -1.2 && x < 1.2 && y > -2.3 && y < -1.6) return 'rug';
    return null;
  }

  dispose() {
    this.rt.dispose();
    for (const t of [...this.frames, ...this.happyFrames]) t.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

