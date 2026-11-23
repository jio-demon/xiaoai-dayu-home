// 对照截图：加载原始未减面 raw_reference.glb 替换当前角色，看裂痕是否源模型自带。
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(4000);
const ok = await page.evaluate(async () => {
  const w = window;
  if (!w.__scene) return 'no hook';
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const { GLTFLoader } = await import('/node_modules/.vite/deps/three_examples_jsm_loaders_GLTFLoader__js.js');
  const gltf = await new GLTFLoader().loadAsync('/assets/raw_reference.glb');
  gltf.scene.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace; }
  });
  const s = w.__scene;
  if (s.glb) s.glb.group.visible = false;
  gltf.scene.position.copy(s.character.group.position);
  s.scene3.add(gltf.scene);
  s.camera3.position.set(0.1, 1.1, 2.2); s.camera3.lookAt(0.1, 0.8, 0.75);
  return 'ok';
});
console.log('raw load:', ok);
await page.waitForTimeout(500);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/debug-raw-closeup.png' });
await browser.close();
