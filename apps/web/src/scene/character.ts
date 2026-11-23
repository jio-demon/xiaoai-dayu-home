import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

/** 占位 Q 版鲸鱼娘（纯几何体拼装）：蓝发+女仆裙+鲸尾，VRM 就绪前的保底形象。 */
export class PlaceholderCharacter {
  group = new THREE.Group();
  private body = new THREE.Group();
  private tail = new THREE.Group();
  private armR = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private mouth: THREE.Mesh;
  private state: VoiceState = 'idle';
  private blinkTimer = 2.5;
  private blinkLeft = 0;
  private petUntil = -1;

  constructor() {
    const skin = lam(0xffe3d3);
    const hair = lam(0x4a7fd4);
    const dress = lam(0x2b2f3a);
    const apron = lam(0xf4f6fb);
    const whale = lam(0x5b8fd6);

    // 腿鞋
    for (const sx of [-0.09, 0.09]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8), apron);
      leg.position.set(sx, 0.11, 0);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dress);
      shoe.scale.set(1, 0.6, 1.3);
      shoe.position.set(sx, 0.03, 0.02);
      this.body.add(leg, shoe);
    }
    // 裙
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 12), dress);
    skirt.position.y = 0.42;
    this.body.add(skirt);
    const apronPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), apron);
    apronPanel.position.set(0, 0.4, 0.225);
    apronPanel.rotation.x = -0.12;
    this.body.add(apronPanel);
    // 上身
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.2, 10), dress);
    torso.position.y = 0.7;
    this.body.add(torso);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.04, 10), apron);
    collar.position.y = 0.79;
    this.body.add(collar);
    const ribbon = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), whale);
    ribbon.position.set(0, 0.76, 0.12);
    this.body.add(ribbon);
    // 手臂
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.24, 8), skin);
    armL.position.set(-0.17, 0.62, 0);
    armL.rotation.z = 0.35;
    this.body.add(armL);
    this.armR.position.set(0.15, 0.76, 0);
    const armRm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.24, 8), skin);
    armRm.position.y = -0.12;
    this.armR.add(armRm);
    this.armR.rotation.z = -0.35;
    this.body.add(this.armR);
    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skin);
    head.position.y = 1.02;
    head.scale.set(1, 0.95, 0.95);
    this.body.add(head);
    // 头发
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), hair);
    hairBack.position.set(0, 1.06, -0.03);
    hairBack.scale.set(1.02, 1.02, 1);
    this.body.add(hairBack);
    const bangs = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
    bangs.position.set(0, 1.05, 0.01);
    this.body.add(bangs);
    for (const sx of [-0.2, 0.2]) {
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), hair);
      strand.position.set(sx, 0.78, -0.06);
      strand.rotation.z = sx > 0 ? -0.12 : 0.12;
      strand.rotation.x = Math.PI;
      this.body.add(strand);
    }
    const ahoge = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 5), hair);
    ahoge.position.set(0.05, 1.34, 0);
    ahoge.rotation.z = -0.4;
    this.body.add(ahoge);
    // 发箍
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI), apron);
    band.position.set(0, 1.16, 0);
    band.rotation.x = -0.35;
    this.body.add(band);
    // 眼睛
    const eyeMat = lam(0x274a86);
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
      eye.position.set(sx, 1.02, 0.215);
      eye.scale.set(0.8, 1.1, 0.5);
      this.eyes.push(eye);
      this.body.add(eye);
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), lam(0xff9d9d));
      blush.position.set(sx * 1.7, 0.95, 0.2);
      blush.scale.set(1.2, 0.6, 0.4);
      this.body.add(blush);
    }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), lam(0xc96a6a));
    this.mouth.position.set(0, 0.93, 0.225);
    this.mouth.scale.set(1.4, 0.7, 0.5);
    this.body.add(this.mouth);
    // 鲸鳍发饰
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), lam(0x7fb2e5));
    fin.position.set(0.2, 1.2, 0.02);
    fin.rotation.z = -0.9;
    this.body.add(fin);

    // 鲸尾
    const peduncle = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), whale);
    peduncle.rotation.x = Math.PI / 2 + 0.5;
    peduncle.position.set(0, 0.1, -0.15);
    this.tail.add(peduncle);
    for (const sx of [-0.09, 0.09]) {
      const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), whale);
      fluke.scale.set(1, 1, 0.35);
      fluke.rotation.x = Math.PI / 2;
      fluke.rotation.z = sx > 0 ? -0.7 : 0.7;
      fluke.position.set(sx, 0.26, -0.34);
      this.tail.add(fluke);
    }
    this.tail.position.set(0, 0.32, -0.2);
    this.group.add(this.tail, this.body);
  }

  setState(s: VoiceState) { this.state = s; }
  pet() { this.petUntil = performance.now() / 1000 + 1.6; }

  update(t: number, dt: number) {
    const petting = performance.now() / 1000 < this.petUntil;
    // 呼吸浮动
    this.body.position.y = Math.sin(t * 1.6) * 0.02 + (petting ? Math.abs(Math.sin(t * 9)) * 0.05 : 0);
    // 尾巴摆动（说话/被摸时更欢）
    const speed = this.state === 'speaking' || petting ? 5 : 2;
    this.tail.rotation.y = Math.sin(t * speed) * (petting ? 0.5 : 0.28);
    // 眨眼
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinkLeft = 0.12; this.blinkTimer = 2 + Math.random() * 3; }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    const eyeY = this.blinkLeft > 0 ? 0.12 : petting ? 0.35 : 1.1;
    for (const e of this.eyes) e.scale.y = eyeY;
    // 说话嘴动
    const talk = this.state === 'speaking' ? 0.7 + Math.abs(Math.sin(t * 12)) * 1.1 : 0.7;
    this.mouth.scale.y = talk;
    // 被摸挥手
    this.armR.rotation.z = petting ? -2.2 + Math.sin(t * 10) * 0.35 : -0.35 + Math.sin(t * 1.6) * 0.05;
    // 思考歪头
    this.body.rotation.z = this.state === 'thinking' ? Math.sin(t * 2) * 0.04 + 0.05 : 0;
  }
}

/** 尝试加载 VRM（/assets/character.vrm）；不存在或失败则返回 null 继续用占位形象。 */
export async function tryLoadVrm(url: string): Promise<any | null> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const ct = head.headers.get('content-type') || '';
    if (!head.ok || ct.includes('text/html')) return null;
    const [{ GLTFLoader }, { VRMLoaderPlugin }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('@pixiv/three-vrm'),
    ]);
    const loader = new GLTFLoader();
    loader.register((parser: any) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    return gltf.userData.vrm ?? null;
  } catch {
    return null;
  }
}
