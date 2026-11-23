import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(2000);
await page.click('button.gear');
await page.waitForSelector('.settings-panel');
await page.addStyleTag({ content: `* { gap: 0 !important; row-gap: 0 !important; column-gap: 0 !important; }` });
await page.waitForTimeout(300);
const m = await page.evaluate(() => {
  const b = document.querySelector('.settings-body');
  return { clientH: b.clientHeight, scrollH: b.scrollHeight, canScroll: b.scrollHeight > b.clientHeight + 10 };
});
console.log('metrics:', JSON.stringify(m));
await page.screenshot({ path: 'F:/ai/xiaoai/docs/settings-scroll-top.png' });
await page.evaluate(() => { const b = document.querySelector('.settings-body'); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(300);
const after = await page.evaluate(() => document.querySelector('.settings-body').scrollTop);
console.log('scrollTop after jump:', after);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/settings-scroll-bottom.png' });
await browser.close();
if (!m.canScroll || after < 50) { console.log('FAIL scroll'); process.exit(1); }
console.log('PASS scrollable');
