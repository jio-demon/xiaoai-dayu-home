import * as THREE from 'three';
import type { VoiceState } from '@xiaoai/protocol';

/**
 * 混元生成的静态雕塑 GLB（无骨骼/形态键）→ 程序化“纸片人”动画。
 * 资产由 tools/assets/hunyuan/build_glb.py 生成：root > body / head 两个节点，
 * head 平移原点在颈部，可独立歪头/点头；材质 unlit 保留手绘上色。
 */
export class GlbCharacter {
  group = new THREE.Group();
  private body: THREE.Object3D | null = null;
  private head: THREE.Object3D | null = null;
  private state: VoiceState = 'idle';
  private petUntil = -1;
  private swayPhase = Math.random() * Math.PI * 2;
  private headTilt = 0;
  private headNod = 0;
  private squash = 0;

  constructor(scene: THREE.Object3D) {
    this.group.add(scene);
    this.body = scene.getObjectByName('body') ?? null;
    this.head = scene.getObjectByName('head') ?? null;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.frustumCulled = false; // 顶点动画幅度小，避免包围盒误剔除
        const mat = m.material as THREE.MeshBasicMaterial;
        if (mat && 'map' in mat && mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      }
    });
  }

  setState(s: VoiceState) { this.state = s; }
  pet() { this.petUntil = performance.now() / 1000 + 1.8; }

  update(t: number, dt: number) {
    const petting = performance.now() / 1000 < this.petUntil;
    const speaking = this.state === 'speaking';
    const thinking = this.state === 'thinking';
    const listening = this.state === 'listening';

    // 呼吸起伏 + 被摸蹦跳
    const breath = Math.sin(t * 1.7 + this.swayPhase) * 0.018;
    const hop = petting ? Math.abs(Math.sin(t * 8)) * 0.09 : 0;
    const talkBounce = speaking ? Math.abs(Math.sin(t * 6.5)) * 0.02 : 0;
    this.group.position.y = breath + hop + talkBounce;

    // 重心摇摆（被摸时大幅扭动）。yaw 是相对值，绝对朝向由外层 Locomotion 在内层更新后叠加
    const swayAmp = petting ? 0.14 : speaking ? 0.05 : 0.025;
    const swaySpd = petting ? 7 : 1.1;
    this.group.rotation.z = Math.sin(t * swaySpd + this.swayPhase) * swayAmp;
    this.group.rotation.y = Math.sin(t * 0.6 + this.swayPhase) * 0.06 + (petting ? Math.sin(t * 7) * 0.12 : 0);

    // 说话时轻微压扁回弹（squash & stretch）
    const targetSquash = speaking ? 0.02 + Math.abs(Math.sin(t * 6.5)) * 0.025 : 0;
    this.squash += (targetSquash - this.squash) * Math.min(1, dt * 10);
    this.group.scale.set(1 + this.squash * 0.6, 1 - this.squash, 1 + this.squash * 0.6);

    // 头部：思考歪头 / 聆听前倾 / 说话点头 / 被摸蹭头
    let tiltTarget = 0, nodTarget = 0;
    if (thinking) { tiltTarget = 0.22 + Math.sin(t * 2) * 0.04; nodTarget = 0.05; }
    else if (listening) { tiltTarget = Math.sin(t * 1.4) * 0.05; nodTarget = 0.12; }
    else if (speaking) { nodTarget = Math.sin(t * 5) * 0.06; }
    else if (petting) { tiltTarget = Math.sin(t * 8) * 0.18; nodTarget = 0.1; }
    else { tiltTarget = Math.sin(t * 0.8 + this.swayPhase) * 0.03; }
    const k = Math.min(1, dt * 6);
    this.headTilt += (tiltTarget - this.headTilt) * k;
    this.headNod += (nodTarget - this.headNod) * k;
    if (this.head) {
      this.head.rotation.z = this.headTilt;
      this.head.rotation.x = this.headNod;
    }
    // 身体微微反向补偿，动作更自然
    if (this.body) this.body.rotation.z = -this.headTilt * 0.15;
  }
}

/** 尝试加载混元 GLB（/assets/character.glb）；不存在或失败返回 null。 */
export async function tryLoadGlb(url: string): Promise<GlbCharacter | null> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const ct = head.headers.get('content-type') || '';
    if (!head.ok || ct.includes('text/html')) return null;
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    return new GlbCharacter(gltf.scene);
  } catch {
    return null;
  }
}
