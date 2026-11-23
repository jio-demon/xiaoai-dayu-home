import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';
import { buildRoom, type RoomHandles } from './room';
import { PlaceholderCharacter, tryLoadVrm } from './character';
import { GlbCharacter, tryLoadGlb } from './glbCharacter';
import { Fallback25D } from './fallback25d';
import { Locomotion, type RoamCharacter } from './locomotion';
import { skyState, roomLighting, rgbHex, type WeatherCondition } from './sky';

/** 闲逛范围：避开床(x<-1.9)、书桌(z<-1.7且x>1.2)、衣柜(x>3.2)、书架/绿植(x<-3.2) */
const LOCO_OPTS = {
  bounds: { minX: -1.55, maxX: 2.6, minZ: -1.35, maxZ: 1.9 },
  engageSpot: { x: -1.05, z: 1.35 }, // 唤醒后走到镜头前左侧（地毯左缘）
  home: { x: 0.1, z: 0.75 },
  faceYaw: 0.12, // 面向镜头略偏，正对 camera(0.2, 2.9, 6.1)
};

export interface SceneOpts {
  mode: '3d' | '2.5d';
  onTap: (name: string) => void;
  onFps?: (fps: number) => void;
  onDegrade?: () => void;
}



/** 场景管理：3D 实时渲染 / 2.5D 烘焙降级、点击射线、FPS 监测与自动降级。 */
export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene3 = new THREE.Scene();
  private camera3: THREE.PerspectiveCamera;
  private lights = new THREE.Group();
  private ambient: THREE.AmbientLight;
  private dir: THREE.DirectionalLight;
  private room: RoomHandles;
  private character = new PlaceholderCharacter();
  private vrm: any = null;
  private glb: GlbCharacter | null = null;
  private loco: Locomotion | null = null;
  private fallback: Fallback25D | null = null;
  private mode: '3d' | '2.5d';
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private fpsEma = 60;
  private lowSince = 0;
  private degraded = false;
  private fpsReport = 0;
  private resizeObs: ResizeObserver | null = null;
  private voiceState: VoiceState = 'idle';
  private weather: WeatherCondition = 'rain';
  private lightTimer = 1; // 立即采样一次

  constructor(private canvas: HTMLCanvasElement, private opts: SceneOpts) {
    this.mode = opts.mode;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene3.background = new THREE.Color(0x0b1020);
    this.camera3 = new THREE.PerspectiveCamera(46, 800 / 480, 0.1, 40);
    this.camera3.position.set(0.2, 2.9, 6.1);
    this.camera3.lookAt(0, 1.05, -0.3);

    this.ambient = new THREE.AmbientLight(0x9fb4d8, 0.75);
    this.dir = new THREE.DirectionalLight(0xbfd4ff, 0.5);
    this.dir.position.set(-2, 3.5, 2);
    this.lights.add(this.ambient, this.dir);
    this.scene3.add(this.lights);

    this.room = buildRoom();
    this.scene3.add(this.room.group);
    this.applyEnvironment(0);
    this.character.group.position.set(0.1, 0, 0.75);
    this.scene3.add(this.character.group);
    this.loco = new Locomotion(this.character, LOCO_OPTS);

    canvas.addEventListener('pointerdown', this.onTap);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(canvas.parentElement ?? canvas);
    } else {
      window.addEventListener('resize', this.resize);
    }
    this.setMode(opts.mode);
    void this.loadCharacterAsset();
    this.clock.start();
    this.loop();
  }

  /** 角色资产优先级：VRM（带骨骼表情）> 混元 GLB（程序化动画）> 几何占位形象。 */
  private async loadCharacterAsset() {
    const vrm = await tryLoadVrm('assets/character.vrm');
    if (this.disposed) return;
    if (vrm) {
      this.vrm = vrm;
      const prevPos = this.loco?.position.clone();
      const adapter: RoamCharacter = {
        group: vrm.scene,
        setState: () => {},
        pet: () => this.vrm?.expressionManager?.setValue('happy', 1),
        update: (_t, dt) => this.vrm?.update(dt),
      };
      this.loco = new Locomotion(adapter, LOCO_OPTS);
      if (prevPos) this.loco.position.set(prevPos.x, 0, prevPos.z);
      this.scene3.add(vrm.scene);
      this.character.group.visible = false;
      if (vrm.lookAt) vrm.lookAt.target = this.camera3;
      return;
    }
    const glb = await tryLoadGlb('assets/character.glb');
    if (this.disposed || !glb) return;
    this.glb = glb;
    const prevPos = this.loco?.position.clone();
    const prevState = this.voiceState;
    this.loco = new Locomotion(glb, LOCO_OPTS);
    if (prevPos) this.loco.position.set(prevPos.x, 0, prevPos.z);
    this.loco.setState(prevState);
    this.scene3.add(glb.group);
    this.character.group.visible = false;
  }

  private resize = () => {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
  };

  setMode(mode: '3d' | '2.5d') {
    this.mode = mode;
    if (mode === '2.5d' && !this.fallback) {
      this.fallback = new Fallback25D(this.renderer, this.room, this.lights, this.camera3);
    } else if (mode === '3d' && this.fallback) {
      this.fallback.dispose();
      this.fallback = null;
    }
  }

  setCharacterState(s: VoiceState) {
    this.voiceState = s;
    if (this.loco) this.loco.setState(s);
    else { this.character.setState(s); this.glb?.setState(s); }
    this.fallback?.setState(s);
    if (this.vrm?.expressionManager) {
      const happy = s === 'speaking' ? 0.5 : 0;
      this.vrm.expressionManager.setValue('happy', happy);
    }
  }

  pet() {
    if (this.loco) this.loco.pet();
    else { this.character.pet(); this.glb?.pet(); }
    this.fallback?.pet();
    if (this.vrm?.expressionManager) this.vrm.expressionManager.setValue('happy', 1);
  }

  private onTap = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    let name: string | null = null;
    if (this.mode === '2.5d' && this.fallback) {
      name = this.fallback.hitTest(nx, ny);
    } else {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera3);
      const targets: THREE.Object3D[] = [this.character.group, ...this.room.interactives.map((i) => i.object)];
      if (this.vrm) targets.push(this.vrm.scene);
      if (this.glb) targets.push(this.glb.group);
      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o) {
          if (o === this.character.group || (this.vrm && o === this.vrm.scene) || (this.glb && o === this.glb.group)) { name = 'character'; break; }
          const found = this.room.interactives.find((i) => i.object === o);
          if (found) { name = found.name; break; }
          o = o.parent;
        }
      }
    }
    if (name) {
      if (name === 'character') this.pet();
      this.opts.onTap(name);
    }
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.lightTimer += dt;
    if (this.lightTimer >= 1) { this.lightTimer = 0; this.applyEnvironment(dt); }
    this.room.update(t, dt, this.lastNight);
    if (this.mode === '3d') {
      if (this.loco) {
        this.loco.update(t, dt);
      } else if (this.vrm) {
        this.vrm.update(dt);
        this.vrm.scene.position.y = Math.sin(t * 1.6) * 0.02;
      } else if (this.glb) {
        this.glb.update(t, dt);
      } else {
        this.character.update(t, dt);
      }
      this.renderer.render(this.scene3, this.camera3);
    } else if (this.fallback) {
      this.fallback.update(t, dt);
      this.renderer.render(this.fallback.scene, this.fallback.camera);
    }
    // FPS 与自动降级
    const fps = dt > 0 ? 1 / dt : 60;
    this.fpsEma = this.fpsEma * 0.95 + fps * 0.05;
    this.fpsReport += dt;
    if (this.fpsReport >= 1) { this.fpsReport = 0; this.opts.onFps?.(Math.round(this.fpsEma)); }
    if (this.mode === '3d' && !this.degraded) {
      if (this.fpsEma < 20) {
        if (this.lowSince === 0) this.lowSince = t;
        else if (t - this.lowSince > 4) { this.degraded = true; this.opts.onDegrade?.(); }
      } else this.lowSince = 0;
    }
  };

  private lastNight = 1;
  /** 现实时间 + 天气 → 房间光照（每秒采样，颜色平滑过渡由 minute 级纹理承担）。 */
  private applyEnvironment(_dt: number) {
    const s = skyState(new Date(), this.weather);
    this.lastNight = s.night;
    const l = roomLighting(s);
    this.ambient.color.setHex(rgbHex(l.ambientColor));
    this.ambient.intensity = l.ambientIntensity;
    this.dir.color.setHex(rgbHex(l.dirColor));
    this.dir.intensity = l.dirIntensity;
    this.fallback?.setEnvironment(s.night, this.weather);
  }

  /** 城市天气联动入口：DeviceApp 拉到实况后调用。 */
  setWeather(c: WeatherCondition) {
    if (c === this.weather) return;
    this.weather = c;
    this.room.setWeather(c);
    this.lightTimer = 1;
    this.fallback?.setEnvironment(this.lastNight, c);
  }

  get currentWeather() { return this.weather; }

  get fps() { return Math.round(this.fpsEma); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onTap);
    this.resizeObs?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.fallback?.dispose();
    this.scene3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}

