// 近景截图：临时把相机拉近看脸部细节与头身切分。
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(4000);
// 通过 three devtools hook? 没有——直接改 URL hash 不行。用页面内 eval 拿 scene（若未暴露则跳过）
const ok = await page.evaluate(() => {
  const w = window;
  if (w.__scene) { w.__scene.camera3.position.set(0.1, 1.1, 2.2); w.__scene.camera3.lookAt(0.1, 0.8, 0.75); return true; }
  return false;
});
console.log('scene hook:', ok);
await page.waitForTimeout(300);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-glb-closeup.png' });
await browser.close();
