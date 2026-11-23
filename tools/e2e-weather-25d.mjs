// 2.5D 模式天气/昼夜联动验证 + 管理页城市设置验证
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(3000);
// 设城市（直接写配置走 UI 太慢，这里用设置面板快速路径）
await page.click('button.gear');
await page.fill('.city-search input', '广州');
await page.click('.city-search button:has-text("搜索")');
await page.waitForSelector('.city-hit', { timeout: 15000 });
await page.click('.city-hit');
await page.waitForTimeout(400);
// 切 2.5D
await page.selectOption('.settings-panel select', '2.5d');
await page.waitForTimeout(600);
await page.click('.btn-close');
await page.waitForSelector('.topbar-weather', { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-25d-night.png' });
await page.evaluate(() => window.__setWeather('snow'));
await page.waitForTimeout(3500); // 等重烘焙
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-25d-snow.png' });
console.log('2.5D ok');

// 管理页：登录 → 模型配置 → 城市与天气卡片
await page.goto('http://localhost:5173/#/admin');
await page.waitForTimeout(1200);
const pwInputs = await page.$$('input[type=password]');
if (pwInputs.length >= 2) {
  await pwInputs[0].fill('test1234'); await pwInputs[1].fill('test1234');
  await page.click('button:has-text("设置并进入")');
} else if (pwInputs.length === 1) {
  await pwInputs[0].fill('test1234');
  await page.click('button:has-text("登录")');
}
await page.waitForTimeout(1200);
const nav = await page.$('.nav-item:has-text("模型与 API")');
if (nav) await nav.click();
await page.waitForSelector('h3:has-text("城市与天气")', { timeout: 10000 });
await page.fill('.card:has(h3:text("城市与天气")) input[placeholder="如：广州"]', '杭州');
await page.click('.card:has(h3:text("城市与天气")) button:has-text("搜索")');
await page.waitForSelector('.card:has(h3:text("城市与天气")) .city-hit', { timeout: 15000 });
await page.click('.card:has(h3:text("城市与天气")) .city-hit');
await page.waitForTimeout(300);
const card = await page.$('.card:has(h3:text("城市与天气"))');
await card.screenshot({ path: 'F:/ai/xiaoai/docs/preview-admin-city.png' });
await page.click('button:has-text("保存全部改动")');
await page.waitForTimeout(1000);
console.log('admin city ok');
console.log('ALL OK');
await browser.close();
