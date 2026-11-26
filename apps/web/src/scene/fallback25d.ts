import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';
import { createSpriteFrames, type SpriteFrames } from './spriteAssets';
import { hitScreenRect, ROOM_LAYOUT, roomDate, type ScreenRect } from './roomLayout';
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
  private sprites: SpriteFrames;
  private hitRects: ScreenRect[] = [];
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
  private weather: WeatherCondition = 'clear';
  private night = 0;
  private rebakeTimer = 0;
  private lastBakeKey = '';
  private disposed = false;
  private windowRect = { minX: -0.4, maxX: 0, minY: 0.1, maxY: 0.6 };


  constructor(renderer: THREE.WebGLRenderer, room: RoomHandles, lights: THREE.Group, bakeCamera: THREE.Camera) {
    this.camera.position.z = 5;
    this.renderer = renderer;
    this.room = room;
    this.lights = lights;
    this.bakeCamera = bakeCamera;
    // 烘焙房间
    const bakeScene = new THREE.Scene();
    bakeScene.background = new THREE.Color(0xe8dfd0);
    bakeScene.add(lights.clone());
    const bakedRoom = room.group.clone(true);
    bakeScene.add(bakedRoom); // 只借用几何和材质；不能转移原场景的灯光或房间。
    this.rt = new THREE.WebGLRenderTarget(800, 480);
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(bakeScene, bakeCamera);
    renderer.setRenderTarget(prevTarget);
    bakeScene.remove(bakedRoom);
    // 投影矩形在构造时就要可用；粒子尚未创建时只计算窗框，不提前重置。
    this.updateHitRects(false);

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

    this.sprites = createSpriteFrames();
    this.sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.44),
      new THREE.MeshBasicMaterial({ map: this.sprites.normal[0], transparent: true, alphaTest: 0.05 }),
    );
    this.sprite.position.set(0.1, -1.05, 0.2);
    this.scene.add(this.sprite);
    void this.sprites.ready.then(() => { if (!this.disposed) this.rebakeTimer = 0.01; });

    // Rain and snow share the actual projected window, not legacy screen constants.
    this.rain = this.makeWeatherParticles(60, 0x9db8e8, 0.03, 0.65, 1.0, 1.4);
    this.rainSpeed = this.weatherSpeeds(60, 1.0, 1.4);
    this.snow = this.makeWeatherParticles(40, 0xf0f6ff, 0.04, 0.85, 0.15, 0.2);
    this.snowSpeed = this.weatherSpeeds(40, 0.15, 0.2);
    this.scene.add(this.rain, this.snow);
    this.applyWeatherVisibility();
    this.setEnvironment(0, 'clear');
    // 显示器光晕
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x7fb2e5, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const monitor = room.interactives.find((i) => i.name === 'monitor');
    const rect = this.hitRects.find((r) => r.name === 'monitor');
    if (rect) {
      this.glow.scale.set((rect.maxX-rect.minX)*4/0.9, (rect.maxY-rect.minY)*2.4/0.6, 1);
      this.glow.position.set((rect.minX+rect.maxX)*2, (rect.minY+rect.maxY)*1.2, 0.15);
    } else if (monitor) {
      const p = new THREE.Box3().setFromObject(monitor.object).getCenter(new THREE.Vector3()).project(bakeCamera);
      this.glow.position.set(p.x*4,p.y*2.4,0.15);
    }
    this.scene.add(this.glow);
  }

  private bakeKey() {
    const preview = (window as any).__roomPreview;
    const d = roomDate();
    return `${Math.floor((d.getHours() + d.getMinutes() / 60) * 2)}|${this.weather}`;
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
    m.opacity = Math.min(0.40, night * 0.24 + dimMap[weather] * (1 - night * 0.4));
    m.color.setHex(night > 0.5 ? 0x0a1230 : 0x33405a);
    if (changed || this.bakeKey() !== this.lastBakeKey) this.rebakeTimer = Math.max(this.rebakeTimer, 0.01);
  }

  private rebake() {
    this.lastBakeKey = this.bakeKey();
    this.updateHitRects();
    this.room.setWeather(this.weather);
    this.room.update(performance.now() / 1000, 0.016, this.night);
    const bakeScene = new THREE.Scene();
    bakeScene.background = new THREE.Color(0xe8dfd0);
    bakeScene.add(this.lights.clone());
    const bakedRoom = this.room.group.clone(true);
    bakeScene.add(bakedRoom);
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(bakeScene, this.bakeCamera);
    this.renderer.setRenderTarget(prevTarget);
    bakeScene.remove(bakedRoom);
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
      const set = happy ? this.sprites.happy : this.sprites.normal;
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
        if (y < this.windowRect.minY*2.4) y = this.windowRect.maxY*2.4;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    if (this.snow.visible) {
      const sp = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.snowSpeed.length; i++) {
        let y = sp.getY(i) - this.snowSpeed[i] * dt;
        if (y < this.windowRect.minY*2.4) y = this.windowRect.maxY*2.4;
        sp.setY(i, y);
        const drift = sp.getX(i) + Math.sin(t * 0.8 + i) * 0.05 * dt;
        sp.setX(i, Math.max(this.windowRect.minX*4, Math.min(this.windowRect.maxX*4, drift)));
      }
      sp.needsUpdate = true;
    }
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.07 * Math.abs(Math.sin(t * 3.1));
  }

  /** 用同一台相机投影真实家具包围盒，布局变化后无需维护另一套手写矩形。 */
  private updateHitRects(resetParticles = true) {
    this.room.group.updateMatrixWorld(true); this.bakeCamera.updateMatrixWorld(true);
    const bounds = new THREE.Box3(), p = new THREE.Vector3();
    const w = ROOM_LAYOUT.window;
    const corners = [new THREE.Vector3(w.x-w.width/2,w.y-w.height/2,w.z),new THREE.Vector3(w.x+w.width/2,w.y+w.height/2,w.z)];
    const projected = corners.map((v) => v.project(this.bakeCamera));
    this.windowRect = { minX: Math.min(...projected.map(v=>v.x)), maxX: Math.max(...projected.map(v=>v.x)), minY: Math.min(...projected.map(v=>v.y)), maxY: Math.max(...projected.map(v=>v.y)) };
    if (resetParticles) {
      this.resetWeatherParticles(this.rain, this.rainSpeed);
      this.resetWeatherParticles(this.snow, this.snowSpeed);
    }
    this.hitRects = this.room.interactives.map(({ name, object }) => {
      bounds.setFromObject(object);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        p.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).project(this.bakeCamera);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      return { name, minX, maxX, minY, maxY };
    }).sort((a, b) => (a.maxX-a.minX)*(a.maxY-a.minY) - (b.maxX-b.minX)*(b.maxY-b.minY));
  }

  hitTest(nx: number, ny: number): string | null {
    const x = nx * 4, y = ny * 2.4;
    if (x > this.spriteX - 0.58 && x < this.spriteX + 0.58 && y > this.sprite.position.y - 0.72 && y < this.sprite.position.y + 0.72) return 'character';
    return hitScreenRect(this.hitRects, nx, ny);
  }

  private weatherSpeeds(count: number, min: number, range: number) {
    return Float32Array.from({length:count}, (_,i) => min + (i*0.618%1)*range);
  }
  private makeWeatherParticles(count: number, color: number, size: number, opacity: number, min: number, range: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
    const points = new THREE.Points(geo,new THREE.PointsMaterial({color,size,transparent:true,opacity,depthWrite:false}));
    this.resetWeatherParticles(points,this.weatherSpeeds(count,min,range));
    return points;
  }
  private resetWeatherParticles(points: THREE.Points, speeds: Float32Array) {
    const p = points.geometry.attributes.position as THREE.BufferAttribute;
    const r = this.windowRect;
    for(let i=0;i<p.count;i++) p.setXYZ(i,(r.minX+(i*0.618%1)*(r.maxX-r.minX))*4,(r.minY+(i*0.382%1)*(r.maxY-r.minY))*2.4,0.1);
    p.needsUpdate=true;
  }

  dispose() {
    this.disposed = true;
    this.rt.dispose();
    this.sprites.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const material = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((v) => v.dispose()); else material?.dispose();
    });
  }
}

