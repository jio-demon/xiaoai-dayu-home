import * as THREE from 'three';
import type { RoomHandles } from './room';
import { ROOM_LAYOUT, INTERACTIVE_NAMES, roomDate } from './roomLayout';
import { createRoomMaterials } from './roomMaterials';
import { poster, windowSky, whaleWallpaper } from './textures';
import { skyState, type WeatherCondition } from './sky';

const L = ROOM_LAYOUT;
const lam = (color: number, map?: THREE.Texture) => new THREE.MeshLambertMaterial(map ? { color: 0xffffff, map } : { color });
function box(parent: THREE.Object3D, name: string, size: number[], pos: number[], material: THREE.Material, round = 0): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  if (round > 0) {
    const w = size[0] / 2, h = size[1] / 2, d = size[2] / 2;
    const r = Math.min(round, w * 0.8, h * 0.8, d * 0.8);
    const shape = new THREE.Shape();
    shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
    geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, size[2] - r * 2), bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: r, bevelThickness: r, curveSegments: 3 });
    geo.translate(0, 0, -size[2] / 2 + r);
  } else geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.position.set(pos[0], pos[1], pos[2]); parent.add(mesh); return mesh;
}
function sphere(parent: THREE.Object3D, name: string, pos: number[], scale: number[], material: THREE.Material, segments = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 8), material); m.name = name;
  m.position.set(pos[0], pos[1], pos[2]); m.scale.set(scale[0], scale[1], scale[2]); parent.add(m); return m;
}
function cylinder(parent: THREE.Object3D, name: string, pos: number[], top: number, bottom: number, height: number, material: THREE.Material, segments = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material); m.name = name;
  m.position.set(pos[0], pos[1], pos[2]); parent.add(m); return m;
}
function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g;
}
function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 奶油海盐小屋：原创低模几何，与 Blender 源共享布局；不加载完整房间 GLB。 */
export function buildCozyRoom(): RoomHandles {
  const root = group(new THREE.Group(), 'Dayu_Cream_SeaSalt_Room');
  const materials = createRoomMaterials();
  const oak = lam(0xc9a77c), paleOak = lam(0xddc39d), cream = lam(0xf3ead8);
  const linen = lam(0xece4d5), blue = lam(0x91afbf), brass = lam(0xb99b62);
  const charcoal = lam(0x3f4a50), leafMat = lam(0x6e8967), terracotta = lam(0xba8c70);
  const interactives: RoomHandles['interactives'] = [];
  const addInteractive = (name: string, object: THREE.Object3D) => interactives.push({ name, object });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.width, L.depth), materials.wood);
  floor.name = 'floor'; floor.rotation.x = -Math.PI / 2; root.add(floor);
  box(root, 'wall_back', [8, 3.2, 0.1], [0, 1.6, -3.05], materials.wall);
  box(root, 'wall_left', [0.1, 3.2, 6], [-4.05, 1.6, 0], materials.wall);
  // 封闭原本露出浅色场景底色的右侧与顶面，共用左墙材质和昼夜光照。
  box(root, 'wall_right', [0.1, 3.2, 6], [4.05, 1.6, 0], materials.wall);
  box(root, 'ceiling', [8.2, 0.1, 6], [0, 3.25, 0], materials.wall);
  box(root, 'skirting_back', [8, 0.14, 0.08], [0, 0.07, -2.97], cream);
  box(root, 'skirting_left', [0.08, 0.14, 6], [-3.97, 0.07, 0], cream);
  // 细细的墙裙压线，让大墙面不显得空，也不增加贴图。
  box(root, 'wall_trim', [8, 0.035, 0.045], [0, 0.91, -2.975], paleOak);
  box(root, 'wall_trim_left', [0.045, 0.035, 6], [-3.975, 0.91, 0], paleOak);
  box(root, 'skirting_right', [0.08, 0.14, 6], [3.97, 0.07, 0], cream);
  box(root, 'wall_trim_right', [0.045, 0.035, 6], [3.975, 0.91, 0], paleOak);
  box(root, 'ceiling_trim_left', [0.055, 0.065, 6], [-3.97, 3.17, 0], cream);
  box(root, 'ceiling_trim_right', [0.055, 0.065, 6], [3.97, 3.17, 0], cream);
  box(root, 'ceiling_trim_back', [8, 0.065, 0.055], [0, 3.17, -2.97], cream);

  const win = group(root, 'window', L.window.x, L.window.y, L.window.z);
  const skyCanvas = windowSky(skyState(roomDate(), 'clear'));
  const skyTex = canvasTexture(skyCanvas);
  const glassMat = new THREE.MeshBasicMaterial({ map: skyTex });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(L.window.width, L.window.height), glassMat);
  glass.name = 'weather_glass'; glass.position.z = 0.015; win.add(glass);
  for (const x of [-1.23, 1.23]) box(win, 'frame_side', [0.11, 1.76, 0.12], [x, 0, 0.06], cream);
  for (const y of [-0.83, 0.83]) box(win, 'frame_rail', [2.56, 0.11, 0.12], [0, y, 0.06], cream);
  box(win, 'mullion', [0.055, 1.6, 0.08], [0, 0, 0.07], paleOak);
  box(win, 'crossbar', [2.4, 0.045, 0.08], [0, 0.03, 0.07], paleOak);
  box(win, 'sill', [2.7, 0.09, 0.32], [0, -0.9, 0.13], paleOak, 0.025);
  const rod = cylinder(win, 'curtain_rod', [0, 1.01, 0.23], 0.025, 0.025, 3.25, brass, 8); rod.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.63, 2.05, 10, 1), materials.curtain);
    const p = curtain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 43) * 0.055);
    curtain.geometry.computeVertexNormals(); curtain.position.set(side * 1.43, -0.03, 0.25); curtain.name = 'mist_curtain'; win.add(curtain);
    const sheer = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.72, 6, 1), new THREE.MeshLambertMaterial({ color: 0xfff5df, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }));
    sheer.position.set(side * 0.96, 0.02, 0.17); sheer.name = 'cream_sheer'; win.add(sheer);
    box(win, 'curtain_tie', [0.52, 0.055, 0.07], [side * 1.43, -0.35, 0.31], linen, 0.015);
  }
  addInteractive('window', win);

  const rainCount = 72, snowCount = 36;
  const rainPos = new Float32Array(rainCount * 3), rainSpeed = new Float32Array(rainCount);
  const snowPos = new Float32Array(snowCount * 3), snowSpeed = new Float32Array(snowCount);
  for (let i = 0; i < rainCount; i++) { rainPos[i * 3] = (i * 0.618 % 1 - 0.5) * 2.25; rainPos[i * 3 + 1] = (i * 0.382 % 1 - 0.5) * 1.48; rainPos[i * 3 + 2] = 0.04; rainSpeed[i] = 0.9 + (i % 7) * 0.13; }
  for (let i = 0; i < snowCount; i++) { snowPos[i * 3] = (i * 0.618 % 1 - 0.5) * 2.25; snowPos[i * 3 + 1] = (i * 0.382 % 1 - 0.5) * 1.48; snowPos[i * 3 + 2] = 0.045; snowSpeed[i] = 0.12 + (i % 5) * 0.035; }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xc1d9ec, size: 0.026, transparent: true, opacity: 0.7 })); rain.visible = false; win.add(rain);
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xf7fbff, size: 0.037, transparent: true, opacity: 0.9 })); snow.visible = false; win.add(snow);

  const bed = group(root, 'bed', L.bed.x, 0, L.bed.z);
  box(bed, 'upholstered_base', [1.82, 0.35, 2.76], [0, 0.27, 0], linen, 0.10);
  box(bed, 'oak_plinth', [1.67, 0.13, 2.58], [0, 0.09, 0], oak, 0.035);
  box(bed, 'mattress', [1.72, 0.24, 2.62], [0, 0.53, 0], cream, 0.10);
  box(bed, 'headboard', [1.88, 1.04, 0.17], [0, 0.72, -1.37], linen, 0.10);
  for (const x of [-0.58, 0, 0.58]) box(bed, 'headboard_seam', [0.012, 0.74, 0.015], [x, 0.77, -1.273], paleOak);
  box(bed, 'quilt', [1.76, 0.16, 1.84], [0, 0.69, 0.37], materials.bedding, 0.07);
  box(bed, 'quilt_fold', [1.77, 0.075, 0.30], [0, 0.79, -0.43], linen, 0.03);
  box(bed, 'throw', [1.79, 0.055, 0.43], [0, 0.795, 0.92], blue, 0.02);
  for (const x of [-0.43, 0.43]) { const pillow = box(bed, 'pillow', [0.73, 0.19, 0.48], [x, 0.735, -0.91], cream, 0.085); pillow.rotation.y = x * 0.09; }
  const plush = group(bed, 'plushie', -0.43, 0.84, -0.56);
  sphere(plush, 'whale_body', [0, 0.10, 0], [0.27, 0.17, 0.18], blue);
  sphere(plush, 'whale_belly', [0.015, 0.045, 0.12], [0.21, 0.085, 0.08], linen);
  for (const side of [-1, 1]) { const tail = sphere(plush, 'whale_tail', [side * 0.27, 0.12, -0.05], [0.12, 0.045, 0.10], blue, 8); tail.rotation.y = side * 0.5; }
  sphere(plush, 'eye', [0.13, 0.14, 0.155], [0.018, 0.018, 0.012], charcoal, 8);
  addInteractive('bed', bed); addInteractive('plushie', plush);
  const nightstand = group(root, 'nightstand', -3.55, 0, -2.28);
  box(nightstand, 'cabinet', [0.62, 0.56, 0.58], [0, 0.32, 0], paleOak, 0.045);
  box(nightstand, 'drawer', [0.52, 0.20, 0.035], [0, 0.43, 0.30], cream, 0.015);
  sphere(nightstand, 'knob', [0, 0.43, 0.33], [0.025, 0.025, 0.02], brass, 8);
  cylinder(nightstand, 'bedside_lamp_base', [0, 0.65, 0], 0.10, 0.13, 0.05, brass);
  cylinder(nightstand, 'bedside_lamp_stem', [0, 0.83, 0], 0.018, 0.018, 0.34, brass, 8);
  cylinder(nightstand, 'bedside_lamp_shade', [0, 1.02, 0], 0.14, 0.23, 0.28, linen, 16);
  const bedsideLight = new THREE.PointLight(0xffc780, 0.6, 3.4, 1.7); bedsideLight.position.set(0, 0.98, 0.08); nightstand.add(bedsideLight);

  const desk = group(root, 'desk', L.desk.x, 0, L.desk.z);
  box(desk, 'desktop', [2.15, 0.10, 0.9], [0, 0.79, 0], paleOak, 0.04);
  for (const x of [-0.92, 0.92]) for (const z of [-0.32, 0.32]) box(desk, 'leg', [0.075, 0.75, 0.075], [x, 0.375, z], oak);
  box(desk, 'drawer_unit', [0.52, 0.25, 0.68], [0.68, 0.61, 0], cream, 0.025);
  box(desk, 'drawer_pull', [0.17, 0.025, 0.035], [0.68, 0.62, 0.36], brass, 0.01);
  const monitor = group(desk, 'monitor', -0.22, 0.84, -0.18);
  box(monitor, 'foot', [0.36, 0.035, 0.22], [0, 0.02, 0], charcoal, 0.015);
  box(monitor, 'stand', [0.065, 0.24, 0.065], [0, 0.15, -0.015], brass);
  box(monitor, 'case', [1.05, 0.65, 0.065], [0, 0.51, 0], charcoal, 0.035);
  const screenMat = new THREE.MeshBasicMaterial({ map: canvasTexture(whaleWallpaper()) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.55), screenMat); screen.position.set(0, 0.51, 0.037); monitor.add(screen);
  addInteractive('monitor', monitor);
  box(desk, 'keyboard', [0.57, 0.035, 0.19], [-0.22, 0.86, 0.24], linen, 0.015);
  for (let i = 0; i < 3; i++) box(desk, 'book', [0.30, 0.045, 0.23], [0.62, 0.87 + i * 0.047, -0.17], [blue, cream, terracotta][i], 0.008);
  cylinder(desk, 'mug', [0.48, 0.94, 0.23], 0.065, 0.055, 0.15, cream, 12);
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), cream); mugHandle.position.set(0.55, 0.95, 0.23); desk.add(mugHandle);
  const lamp = group(root, 'lamp', 3.12, 0.84, -2.39);
  cylinder(lamp, 'base', [0, 0.025, 0], 0.12, 0.14, 0.05, brass);
  cylinder(lamp, 'stem', [0, 0.24, 0], 0.018, 0.018, 0.43, brass, 8);
  cylinder(lamp, 'shade', [0, 0.48, 0], 0.12, 0.22, 0.23, linen, 16);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdc9c });
  sphere(lamp, 'bulb', [0, 0.39, 0], [0.055, 0.04, 0.055], bulbMat, 8);
  const lampLight = new THREE.PointLight(0xffc47b, 0.9, 5, 1.6); lampLight.position.set(0, 0.37, 0.08); lamp.add(lampLight); addInteractive('lamp', lamp);
  const chair = group(root, 'chair', 2.13, 0, -1.48);
  box(chair, 'seat', [0.58, 0.12, 0.53], [0, 0.48, 0], blue, 0.06);
  box(chair, 'back', [0.58, 0.46, 0.10], [0, 0.77, 0.23], blue, 0.06);
  for (const x of [-0.22, 0.22]) for (const z of [-0.19, 0.19]) box(chair, 'leg', [0.045, 0.44, 0.045], [x, 0.22, z], oak);

  const rug = new THREE.Mesh(new THREE.CircleGeometry(L.rug.radius, 40), materials.rug);
  rug.name = 'rug'; rug.rotation.x = -Math.PI / 2; rug.scale.y = 0.82; rug.position.set(L.rug.x, 0.018, L.rug.z); root.add(rug); addInteractive('rug', rug);
  const wardrobe = group(root, 'wardrobe', L.wardrobe.x, 0, L.wardrobe.z);
  box(wardrobe, 'body', [0.66, 2.18, 1.55], [0, 1.11, 0], paleOak, 0.045);
  for (const z of [-0.38, 0.38]) {
    box(wardrobe, 'door', [0.035, 1.99, 0.70], [-0.35, 1.13, z], cream, 0.02);
    sphere(wardrobe, 'handle', [-0.39, 1.1, z * 0.22], [0.025, 0.04, 0.025], brass, 8);
  }
  const shelf = group(root, 'shelf', L.shelf.x, 0, L.shelf.z);
  box(shelf, 'back', [0.12, 1.52, 1.3], [0.12, 0.78, 0], paleOak);
  for (const y of [0.12, 0.62, 1.12, 1.57]) box(shelf, 'shelf_board', [0.43, 0.065, 1.34], [-0.03, y, 0], oak);
  for (const z of [-0.64, 0.64]) box(shelf, 'side', [0.43, 1.5, 0.065], [-0.03, 0.81, z], paleOak);
  const bookMats = [blue, cream, terracotta, leafMat];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const h = 0.24 + (i % 3) * 0.045;
    box(shelf, 'book', [0.25, h, 0.09], [-0.075, 0.16 + row * 0.5 + h / 2, -0.48 + i * 0.12], bookMats[(i + row) % 4]);
  }
  const radio = group(shelf, 'radio', -0.04, 1.61, 0.28);
  box(radio, 'case', [0.27, 0.18, 0.36], [0, 0.09, 0], cream, 0.025);
  const speaker = cylinder(radio, 'speaker', [-0.145, 0.09, -0.045], 0.058, 0.058, 0.012, charcoal, 12); speaker.rotation.z = Math.PI / 2;
  sphere(radio, 'dial', [-0.15, 0.10, 0.105], [0.015, 0.023, 0.023], brass, 8);
  addInteractive('radio', radio);
  const plant = group(root, 'plant', L.plant.x, 0, L.plant.z);
  cylinder(plant, 'pot', [0, 0.17, 0], 0.20, 0.145, 0.34, terracotta, 14);
  cylinder(plant, 'soil', [0, 0.343, 0], 0.175, 0.175, 0.012, lam(0x655344), 12);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const leaf = sphere(plant, 'leaf', [Math.cos(a) * 0.13, 0.57 + (i % 3) * 0.09, Math.sin(a) * 0.13], [0.09, 0.31, 0.045], leafMat, 8);
    leaf.rotation.set(Math.sin(a) * 0.45, a, Math.cos(a) * 0.45);
  }
  addInteractive('plant', plant);

  // 一幅小画、床头搁板与暖色串灯：生活感而非满墙海洋主题。
  const art = group(root, 'wall_art', 1.0, 2.12, -2.965);
  box(art, 'frame', [0.75, 0.91, 0.055], [0, 0, 0], oak, 0.015);
  const print = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.81), lam(0xffffff, canvasTexture(poster()))); print.position.z = 0.032; art.add(print);
  box(root, 'bedside_shelf', [1.45, 0.065, 0.24], [-2.75, 2.12, -2.84], paleOak, 0.02);
  for (let i = 0; i < 4; i++) box(root, 'small_book', [0.09, 0.27 + i % 2 * 0.05, 0.16], [-3.18 + i * 0.11, 2.29, -2.84], bookMats[i]);
  cylinder(root, 'small_vase', [-2.35, 2.28, -2.84], 0.06, 0.09, 0.25, cream, 10);
  const bulbs: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const b = sphere(root, 'fairy_light', [-3.45 + i * 0.86, 2.96 - Math.sin(i / 8 * Math.PI) * 0.13, -2.91], [0.027, 0.027, 0.027], new THREE.MeshBasicMaterial({ color: 0xffd59a }), 6); bulbs.push(b);
  }

  let weather: WeatherCondition = 'clear', skyKey = '', flash = 0;
  function refreshSky(force = false) {
    const now = roomDate(), key = `${now.getHours()}:${now.getMinutes()}|${weather}`;
    if (!force && key === skyKey) return;
    skyKey = key;
    const next = windowSky(skyState(now, weather)), ctx = skyCanvas.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, skyCanvas.width, skyCanvas.height); ctx.drawImage(next, 0, 0); skyTex.needsUpdate = true; }
    rain.visible = ['rain', 'drizzle', 'thunder'].includes(weather);
    (rain.material as THREE.PointsMaterial).opacity = weather === 'drizzle' ? 0.4 : 0.7;
    snow.visible = weather === 'snow';
  }
  refreshSky(true);
  function update(t: number, dt: number, night: number) {
    refreshSky();
    if (rain.visible) {
      const p = rainGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rainCount; i++) { let y = p.getY(i) - rainSpeed[i] * dt; if (y < -0.74) y = 0.74; p.setY(i, y); } p.needsUpdate = true;
    }
    if (snow.visible) {
      const p = snowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < snowCount; i++) { let y = p.getY(i) - snowSpeed[i] * dt; if (y < -0.74) y = 0.74; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t + i) * 0.035 * dt); } p.needsUpdate = true;
    }
    if (flash > 0) { flash -= dt; glassMat.color.setScalar(1 + Math.max(0, flash) * 2); }
    else { glassMat.color.setScalar(1); if (weather === 'thunder' && Math.random() < 0.003) flash = 0.18; }
    screenMat.color.setScalar(0.94 + Math.sin(t * 2.1) * 0.035);
    const overcast = ['overcast', 'rain', 'thunder', 'drizzle'].includes(weather);
    lampLight.intensity = 0.45 + night * 0.85 + (overcast && night < 0.5 ? 0.2 : 0);
    bedsideLight.intensity = 0.25 + night * 0.65;
    for (let i = 0; i < bulbs.length; i++) (bulbs[i].material as THREE.MeshBasicMaterial).color.setRGB(1, 0.72 + night * 0.12, 0.43 + Math.sin(t * 1.2 + i) * 0.045);
  }
  if (INTERACTIVE_NAMES.some((name) => !interactives.some((item) => item.name === name))) throw new Error('Incomplete room interactions');
  return { group: root, interactives, update, setWeather(c) { if (c !== weather) { weather = c; refreshSky(true); } }, dispose() { materials.dispose(); } };
}
