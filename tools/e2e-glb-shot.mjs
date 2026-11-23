// 截图验证混元 GLB 角色渲染效果（正面 + 摸头动作）。
import { chromium } from 'playwright-core';
const EXE = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 300)); });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(4000); // 等 GLB 加载
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-glb-character.png' });
// 点击角色（画布中央偏下）触发摸头
const canvas = await page.locator('canvas').first().boundingBox();
if (canvas) {
  await page.mouse.click(canvas.x + canvas.width * 0.52, canvas.y + canvas.height * 0.55);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-glb-pet.png' });
}
console.log('screenshots done');
await browser.close();
