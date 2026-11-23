import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(2000);
// 直接改 MockBridge 的 config：设一个已知密码 hash（test1234）
const sha = await page.evaluate(async () => {
  const enc = new TextEncoder().encode('test1234');
  const d = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
});
await page.evaluate((hash) => {
  const raw = localStorage.getItem('xiaoai:blob:config');
  const cfg = raw ? JSON.parse(raw) : {};
  cfg.adminPasswordHash = hash;
  localStorage.setItem('xiaoai:blob:config', JSON.stringify(cfg));
}, sha);
await page.reload();
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(2500);

// 打开真机伺服的管理页（跨源，正是用户场景）
const admin = await browser.newPage({ viewport: { width: 1280, height: 800 } });
admin.on('console', (m) => { if (m.type() === 'error') console.log('[admin console.error]', m.text().slice(0, 160)); });
await admin.goto('http://192.168.31.149:8080/#/admin');
await admin.waitForSelector('.login-card', { timeout: 15000 });
await admin.fill('input[type=password]', 'test1234');
await admin.click('button.btn-primary');
await admin.waitForSelector('.admin-nav', { timeout: 15000 });
console.log('logged in OK');
// 进设置页
await admin.click('text=模型与语音');
await admin.waitForTimeout(800);
const navTexts = await admin.evaluate(() => [...document.querySelectorAll('.nav-item')].map((b) => b.textContent));
console.log('nav:', JSON.stringify(navTexts));
await admin.screenshot({ path: 'F:/ai/xiaoai/docs/admin-real-config.png' });
await browser.close();
