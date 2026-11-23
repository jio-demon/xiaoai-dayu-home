import * as THREE from 'three';
import { blanket, poster, windowSky, wall, whaleRug, whaleWallpaper, woodFloor } from './textures';
import { skyState, type SkyState, type WeatherCondition } from './sky';

export interface RoomHandles {
  group: THREE.Group;
  interactives: { name: string; object: THREE.Object3D }[];
  update(t: number, dt: number, night: number): void;
  /** 城市天气联动：窗外雨雪/闪电随实况切换。 */
  setWeather(c: WeatherCondition): void;
}

function tex(c: HTMLCanvasElement, rx = 1, ry = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lam = (color: number, map?: THREE.Texture) => new THREE.MeshLambertMaterial(map ? { color, map } : { color });

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** 低模房间：参考图2的雨夜蓝色卧室（床+鲸鱼玩偶、书桌+鲸鱼壁纸显示器、雨窗、鲸鱼地毯、衣柜、书架、绿植）。 */
export function buildRoom(): RoomHandles {
  let weather: WeatherCondition = 'rain'; // 初始参考图2雨夜氛围；实况到达后切换
  const group = new THREE.Group();
  const interactives: { name: string; object: THREE.Object3D }[] = [];
  const wood = lam(0xffffff, tex(woodFloor(), 3, 2));
  const wallMat = lam(0xffffff, tex(wall(), 4, 2));
  const darkWood = lam(0x6b4f3a);
  const white = lam(0xe8ecf4);

  // 地板与墙
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), wood);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  group.add(box(8, 3.2, 0.1, wallMat, 0, 1.6, -3.05));
  group.add(box(0.1, 3.2, 6, wallMat, -4.05, 1.6, 0));
  group.add(box(8, 0.12, 0.12, lam(0x3a4560), 0, 0.06, -2.99));
  group.add(box(0.12, 0.12, 6, lam(0x3a4560), -3.99, 0.06, 0));

  // 雨窗
  const win = new THREE.Group();
  win.position.set(-1.0, 1.9, -2.98);
  const skyCanvas = windowSky(skyState(new Date(), weather));
  const skyTex = tex(skyCanvas);
  const glassMat = new THREE.MeshBasicMaterial({ map: skyTex });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), glassMat);
  glass.position.z = 0.01;
  win.add(glass);
  const frameMat = lam(0x3a4a6a);
  win.add(box(2.4, 0.1, 0.1, frameMat, 0, 0.8, 0.03));
  win.add(box(2.4, 0.1, 0.1, frameMat, 0, -0.8, 0.03));
  win.add(box(0.1, 1.7, 0.1, frameMat, -1.15, 0, 0.03));
  win.add(box(0.1, 1.7, 0.1, frameMat, 1.15, 0, 0.03));
  win.add(box(0.05, 1.5, 0.06, frameMat, 0, 0, 0.03));
  win.add(box(2.2, 0.05, 0.06, frameMat, 0, 0, 0.03));
  win.add(box(2.5, 0.08, 0.22, frameMat, 0, -0.86, 0.08));
  // 雨滴粒子
  const RAIN = 110;
  const rainPos = new Float32Array(RAIN * 3);
  const rainSpeed = new Float32Array(RAIN);
  for (let i = 0; i < RAIN; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 2.1;
    rainPos[i * 3 + 1] = (Math.random() - 0.5) * 1.4;
    rainPos[i * 3 + 2] = 0.05;
    rainSpeed[i] = 1.2 + Math.random() * 1.6;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9db8e8, size: 0.025, transparent: true, opacity: 0.7 }));
  win.add(rain);
  // 雪花粒子（更慢、横向飘）
  const SNOW = 70;
  const snowPos = new Float32Array(SNOW * 3);
  const snowSpeed = new Float32Array(SNOW);
  const snowPhase = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 2.1;
    snowPos[i * 3 + 1] = (Math.random() - 0.5) * 1.4;
    snowPos[i * 3 + 2] = 0.05;
    snowSpeed[i] = 0.18 + Math.random() * 0.25;
    snowPhase[i] = Math.random() * Math.PI * 2;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xf0f6ff, size: 0.035, transparent: true, opacity: 0.85 }));
  snow.visible = false;
  win.add(snow);
  group.add(win);
  interactives.push({ name: 'window', object: win });
  let flash = 0;

  // 床 + 鲸鱼玩偶
  const bed = new THREE.Group();
  bed.position.set(-2.75, 0, -0.5);
  bed.add(box(1.7, 0.35, 2.7, darkWood, 0, 0.18, 0));
  bed.add(box(1.6, 0.22, 2.6, white, 0, 0.46, 0));
  bed.add(box(1.62, 0.12, 1.75, lam(0xffffff, tex(blanket(), 2, 2)), 0, 0.58, 0.4));
  bed.add(box(0.95, 0.16, 0.5, lam(0xf4f6fb), 0, 0.62, -0.95));
  bed.add(box(1.7, 0.9, 0.12, darkWood, 0, 0.6, -1.35));
  const plush = new THREE.Group();
  const plushMat = lam(0x7fb2e5);
  const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), plushMat);
  p1.scale.set(1.25, 0.9, 1);
  p1.position.set(-0.35, 0.78, -0.7);
  const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 8), plushMat);
  t1.rotation.z = Math.PI / 2;
  t1.position.set(-0.66, 0.8, -0.7);
  const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), lam(0x9fc6ee));
  p2.scale.set(1.25, 0.9, 1);
  p2.position.set(0.35, 0.72, -0.45);
  plush.add(p1, t1, p2);
  bed.add(plush);
  group.add(bed);
  interactives.push({ name: 'bed', object: bed });
  interactives.push({ name: 'plushie', object: plush });

  // 书桌 + 显示器
  const desk = new THREE.Group();
  desk.position.set(2.3, 0, -2.25);
  desk.add(box(2.0, 0.08, 0.9, darkWood, 0, 0.78, 0));
  for (const [lx, lz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) desk.add(box(0.08, 0.78, 0.08, lam(0x4a3828), lx, 0.39, lz));
  const monitor = new THREE.Group();
  monitor.position.set(-0.15, 0.82, -0.18);
  monitor.add(box(0.3, 0.04, 0.18, lam(0x22262e), 0, 0.02, 0));
  monitor.add(box(0.06, 0.22, 0.06, lam(0x22262e), 0, 0.14, 0));
  monitor.add(box(1.0, 0.62, 0.05, lam(0x22262e), 0, 0.5, 0));
  const screenMat = new THREE.MeshBasicMaterial({ map: tex(whaleWallpaper()) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.54), screenMat);
  screen.position.set(0, 0.5, 0.03);
  monitor.add(screen);
  desk.add(monitor);
  desk.add(box(0.52, 0.03, 0.18, lam(0x30343e), -0.15, 0.83, 0.22));
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10), lam(0xd8b46a));
  mug.position.set(0.55, 0.87, 0.15);
  desk.add(mug);
  group.add(desk);
  interactives.push({ name: 'monitor', object: monitor });

  // 台灯
  const lampG = new THREE.Group();
  lampG.position.set(3.05, 0.82, -2.35);
  lampG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.04, 10), lam(0x30343e)));
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), lam(0x30343e));
  arm.position.y = 0.2;
  lampG.add(arm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 10, 1, true), lam(0xd8b46a));
  shade.position.y = 0.42;
  lampG.add(shade);
  const lampLight = new THREE.PointLight(0xffd9a0, 0.9, 5.5, 1.6);
  lampLight.position.set(0, 0.36, 0.05);
  lampG.add(lampLight);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9c4 }));
  bulb.position.y = 0.37;
  lampG.add(bulb);
  group.add(lampG);
  interactives.push({ name: 'lamp', object: lampG });

  // 椅子
  const chair = new THREE.Group();
  chair.position.set(2.15, 0, -1.45);
  chair.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 12), lam(0x3f6fd8)));
  chair.children[0].position.y = 0.48;
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 6), lam(0x4a3828));
    leg.position.set(Math.cos(i * Math.PI / 2 + 0.4) * 0.17, 0.24, Math.sin(i * Math.PI / 2 + 0.4) * 0.17);
    chair.add(leg);
  }
  group.add(chair);

  // 鲸鱼地毯
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), lam(0xffffff, tex(whaleRug())));
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1, 0.78, 1);
  rug.position.set(0, 0.015, 0.7);
  group.add(rug);
  interactives.push({ name: 'rug', object: rug });

  // 衣柜
  const wardrobe = new THREE.Group();
  wardrobe.position.set(3.65, 0, 0.9);
  wardrobe.add(box(0.7, 2.2, 1.6, lam(0x5a4632), 0, 1.1, 0));
  wardrobe.add(box(0.02, 2.0, 0.02, lam(0x3a2c1e), -0.36, 1.1, 0));
  const knob1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), lam(0xd8b46a));
  knob1.position.set(-0.37, 1.1, -0.12);
  const knob2 = knob1.clone();
  knob2.position.z = 0.12;
  wardrobe.add(knob1, knob2);
  group.add(wardrobe);

  // 书架 + 收音机 + 小熊
  const shelf = new THREE.Group();
  shelf.position.set(-3.8, 0, 1.7);
  shelf.add(box(0.36, 1.5, 1.3, lam(0x5a4632), 0, 0.75, 0));
  const bookColors = [0xd86a6a, 0x6ad88f, 0x6a9fd8, 0xd8c46a, 0xb06ad8];
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 5; i++) {
      const b = box(0.22, 0.28, 0.06, lam(bookColors[(s + i) % 5]), 0.02, 0.32 + s * 0.45, -0.45 + i * 0.16);
      b.rotation.x = (Math.random() - 0.5) * 0.06;
      shelf.add(b);
    }
  }
  const radio = new THREE.Group();
  radio.position.set(0, 1.58, 0.3);
  radio.add(box(0.24, 0.14, 0.12, lam(0xd8b46a), 0, 0.07, 0));
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), lam(0x30343e));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.06, 0.07, 0.07);
  radio.add(dial);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 4), lam(0x888e99));
  ant.position.set(-0.09, 0.24, 0);
  ant.rotation.z = 0.4;
  radio.add(ant);
  shelf.add(radio);
  interactives.push({ name: 'radio', object: radio });
  const bear = new THREE.Group();
  bear.position.set(0, 1.58, -0.35);
  const bearMat = lam(0xa8794f);
  const bb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), bearMat);
  bb.position.y = 0.09;
  const bh = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), bearMat);
  bh.position.y = 0.22;
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), bearMat);
  e1.position.set(-0.05, 0.28, 0);
  const e2 = e1.clone(); e2.position.x = 0.05;
  bear.add(bb, bh, e1, e2);
  shelf.add(bear);
  group.add(shelf);

  // 绿植
  const plant = new THREE.Group();
  plant.position.set(-3.35, 0, 2.5);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.24, 10), lam(0xb06a4a));
  pot.position.y = 0.12;
  plant.add(pot);
  const leafMat = lam(0x4a9e5c);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), leafMat);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.08, 0.45, Math.sin(a) * 0.08);
    leaf.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35);
    plant.add(leaf);
  }
  group.add(plant);
  interactives.push({ name: 'plant', object: plant });

  // 海报 + 小串灯
  const post = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), lam(0xffffff, tex(poster())));
  post.position.set(0.9, 2.05, -2.99);
  group.add(post);
  const bulbs: THREE.Mesh[] = [];
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), bulbMat.clone());
    b.position.set(-3.4 + i * 0.85, 2.95 - Math.sin((i / 8) * Math.PI) * 0.12, -2.95);
    bulbs.push(b);
    group.add(b);
  }

  const baseGlass = new THREE.Color(0xffffff);
  // 天空纹理按「分钟 + 天气」节流重绘（低算力设备友好）
  let skyMinuteKey = '';
  function refreshSky(force = false) {
    const now = new Date();
    const key = `${now.getHours()}:${now.getMinutes()}|${weather}`;
    if (!force && key === skyMinuteKey) return;
    skyMinuteKey = key;
    const s: SkyState = skyState(now, weather);
    const c2 = windowSky(s);
    const ctx = skyCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, skyCanvas.width, skyCanvas.height);
    ctx.drawImage(c2, 0, 0);
    skyTex.needsUpdate = true;
    const raining = weather === 'rain' || weather === 'drizzle' || weather === 'thunder';
    rain.visible = raining;
    (rain.material as THREE.PointsMaterial).opacity = weather === 'drizzle' ? 0.4 : 0.7;
    (rain.material as THREE.PointsMaterial).size = weather === 'drizzle' ? 0.018 : 0.025;
    snow.visible = weather === 'snow';
  }
  refreshSky(true);

  function setWeather(c: WeatherCondition) {
    if (c === weather) return;
    weather = c;
    refreshSky(true);
  }

  function update(t: number, dt: number, night: number) {
    refreshSky();
    // 雨（仅雨天更新粒子）
    if (rain.visible) {
      const pos = rainGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < RAIN; i++) {
        let y = pos.getY(i) - rainSpeed[i] * dt;
        if (y < -0.72) { y = 0.72; pos.setX(i, (Math.random() - 0.5) * 2.1); }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    // 雪
    if (snow.visible) {
      const sp = snowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < SNOW; i++) {
        let y = sp.getY(i) - snowSpeed[i] * dt;
        if (y < -0.72) { y = 0.72; sp.setX(i, (Math.random() - 0.5) * 2.1); }
        sp.setY(i, y);
        sp.setX(i, sp.getX(i) + Math.sin(t * 0.8 + snowPhase[i]) * 0.06 * dt);
      }
      sp.needsUpdate = true;
    }
    // 闪电（仅雷雨）
    if (flash > 0) {
      flash -= dt;
      glassMat.color.setScalar(1 + Math.max(0, flash) * 2.2);
    } else {
      glassMat.color.copy(baseGlass);
      if (weather === 'thunder' && Math.random() < 0.003 + night * 0.002) flash = 0.18;
    }
    // 显示器闪烁
    const flick = 0.88 + 0.12 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1));
    screenMat.color.setScalar(flick);
    // 台灯与串灯
    const overcast = weather === 'overcast' || weather === 'rain' || weather === 'thunder' || weather === 'drizzle';
    lampLight.intensity = 0.45 + night * 0.75 + (overcast && night < 0.5 ? 0.2 : 0);
    for (let i = 0; i < bulbs.length; i++) {
      (bulbs[i].material as THREE.MeshBasicMaterial).color.setScalar(0.75 + 0.25 * Math.sin(t * 1.5 + i));
    }
  }

  return { group, interactives, update, setWeather };
}

