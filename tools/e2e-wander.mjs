// 闲逛 + 唤醒走到镜头左侧 的可视化验证截图
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(4000); // 等 GLB 加载

const getPos = () => page.evaluate(() => {
  const s = window.__scene;
  const l = s.loco;
  return l ? { x: +l.position.x.toFixed(2), z: +l.position.z.toFixed(2), engaged: l.isEngaged, walking: l.isWalking } : null;
});

console.log('t0:', JSON.stringify(await getPos()));
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-wander-1.png' });
// 观察 25 秒内是否移动（闲逛）
let moved = false; const p0 = await getPos();
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  const p = await getPos();
  if (Math.hypot(p.x - p0.x, p.z - p0.z) > 0.4) { moved = true; console.log(`wander moved at ${i}s:`, JSON.stringify(p)); break; }
}
if (!moved) throw new Error('character did not wander in 25s');
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-wander-2.png' });

// 模拟唤醒 → listening：应小跑到镜头左侧 (-1.05, 1.35)
await page.click('button:has-text("模拟唤醒")');
await page.waitForTimeout(1500);
let pw = await getPos();
if (!pw.engaged) {
  // 假麦克风环境下 KWS 可能没触发录音，直接驱动状态验证 locomotion
  console.log('kws did not engage, driving state directly');
  await page.evaluate(() => window.__scene.setCharacterState('listening'));
  await page.waitForTimeout(400);
}
console.log('after wake:', JSON.stringify(await getPos()));
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-engage-walking.png' });
// 等到位（最多 8 秒）
await page.waitForFunction(() => {
  const l = window.__scene?.loco;
  return l && Math.hypot(l.position.x - (-1.05), l.position.z - 1.35) < 0.08;
}, { timeout: 10000 });
await page.waitForTimeout(800);
const pe = await getPos();
console.log('engaged at:', JSON.stringify(pe));
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-engage-left.png' });
console.log('WANDER + ENGAGE OK');
await browser.close();
