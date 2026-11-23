import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }); // 同一 context = 共享 localStorage（同一浏览器两个标签页）
const dev = await ctx.newPage();
await dev.setViewportSize({ width: 800, height: 480 });
await dev.goto('http://localhost:5173/#/device');
await dev.waitForSelector('.voice-dock', { timeout: 20000 });
await dev.waitForTimeout(2500);
await dev.click('button.gear');
await dev.waitForSelector('.settings-panel');
await dev.fill('input[placeholder="新密码（≥4位）"]', 'test1234');
await dev.click('.settings-body button.btn:has-text("设置密码")');
await dev.waitForSelector('.pw-msg');
await dev.click('.btn-close');
console.log('device pw set');

const admin = await ctx.newPage();
await admin.setViewportSize({ width: 1280, height: 800 });
admin.on('console', (m) => { if (m.type() === 'error') console.log('[admin err]', m.text().slice(0, 150)); });
await admin.goto('http://localhost:5173/#/admin');
await admin.waitForSelector('.login-card', { timeout: 15000 });
await admin.fill('input[type=password]', 'test1234');
await admin.click('button.btn-primary');
await admin.waitForSelector('.admin-nav', { timeout: 15000 });
console.log('admin logged in ✓');

// 记录设备当前配置
const before = await dev.evaluate(() => JSON.parse(localStorage.getItem('xiaoai:blob:config')));
console.log('before: wakeWord=', before.wakeWord, 'subtitles=', before.subtitles);

// 管理端设置页：改唤醒词 → 保存
await admin.click('.nav-item:has-text("模型")');
await admin.waitForTimeout(800);
const wake = admin.locator('.admin-page label:has-text("唤醒词") input, .admin-page input[maxlength="8"]').first();
await wake.fill('小鲸鱼');
await admin.click('.admin-page button.btn-primary:has-text("保存")');
await admin.waitForTimeout(1500);
const msg = await admin.evaluate(() => document.querySelector('.admin-page').innerText.match(/已保存[^\n]*/)?.[0] ?? '(no msg)');
console.log('save msg:', msg);

// 设备页应通过 BroadcastChannel 实时收到（不刷新页面）
await dev.waitForTimeout(1500);
const after = await dev.evaluate(() => JSON.parse(localStorage.getItem('xiaoai:blob:config')));
console.log('after: wakeWord=', after.wakeWord);
// 设备 UI 的设置面板里也应显示新唤醒词
await dev.click('button.gear');
await dev.waitForSelector('.settings-panel');
const uiWake = await dev.inputValue('.settings-body input[maxlength="8"]');
console.log('device UI wakeWord:', uiWake);
await dev.screenshot({ path: 'F:/ai/xiaoai/docs/device-synced-wake.png' });
await admin.screenshot({ path: 'F:/ai/xiaoai/docs/admin-saved.png' });
await browser.close();
if (after.wakeWord !== '小鲸鱼' || uiWake !== '小鲸鱼') { console.log('FAIL sync'); process.exit(1); }
console.log('PASS: admin save → device realtime sync');
