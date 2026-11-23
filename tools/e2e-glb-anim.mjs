// 近景 + 摸头动作截图（验证头身切分动画无裂缝）。
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(4000);
// 先让她进入互动位（站定面向镜头），再把镜头放到她正前方近景
await page.evaluate(() => window.__scene.setCharacterState('listening'));
await page.waitForFunction(() => {
  const l = window.__scene?.loco;
  return l && Math.hypot(l.position.x - (-1.05), l.position.z - 1.35) < 0.08 && !l.isWalking;
}, { timeout: 15000 });
await page.evaluate(() => {
  const s = window.__scene;
  const p = s.loco.position;
  s.camera3.position.set(p.x + 0.15, 1.0, p.z + 1.35);
  s.camera3.lookAt(p.x, 0.72, p.z);
});
// 触发摸头：直接调 pet
await page.evaluate(() => window.__scene.pet());
await page.waitForTimeout(450);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-glb-pet-closeup.png' });
// thinking 状态歪头
await page.evaluate(() => window.__scene.setCharacterState('thinking'));
await page.waitForTimeout(1200);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-glb-thinking.png' });
console.log('done');
await browser.close();
