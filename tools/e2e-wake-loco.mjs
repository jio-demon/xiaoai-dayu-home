// 最终验证：真实唤醒链路 → 角色小跑到镜头左侧站定 + 截图；idle 后恢复闲逛
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ permissions: ['microphone'] });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(3500);
await page.click('button:has-text("模拟唤醒")');
await page.waitForFunction(() => {
  const l = window.__scene?.loco;
  return l && l.isEngaged && Math.hypot(l.position.x - (-1.05), l.position.z - 1.35) < 0.08 && !l.isWalking;
}, { timeout: 15000 });
console.log('wake → walk to camera-left OK');
await page.waitForTimeout(500);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-wake-engage.png' });
// 结束聆听（再点麦克风停止）→ idle → 6 秒后应离开互动位继续溜达
await page.evaluate(() => window.__scene.setCharacterState('idle'));
await page.waitForFunction(() => window.__scene?.loco?.isEngaged === false, { timeout: 12000 });
console.log('idle grace → resume wander OK');
await browser.close();
