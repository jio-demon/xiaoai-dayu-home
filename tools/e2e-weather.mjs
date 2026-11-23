// 城市天气 + 昼夜同步 可视化验证：设置广州 → 顶栏天气；__setWeather 切换窗外雨/雪/晴；截图
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(3500);

// 打开设置 → 搜索广州 → 选第一个候选
await page.click('button.gear');
await page.waitForSelector('.settings-panel');
await page.fill('.city-search input', '广州');
await page.click('.city-search button:has-text("搜索")');
await page.waitForSelector('.city-hit', { timeout: 15000 });
const hitText = await page.textContent('.city-hit');
console.log('city hit:', hitText);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-city-settings.png' });
await page.click('.city-hit');
await page.waitForTimeout(500);
await page.click('.btn-close');

// 顶栏天气出现（等实况到达）
await page.waitForSelector('.topbar-weather', { timeout: 20000 });
const wtext = await page.textContent('.topbar-weather');
console.log('topbar weather:', wtext);
if (!wtext.includes('广州')) throw new Error('topbar missing city');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-weather-live.png' });

// 强制切换天气验证窗外联动（当前是晚上，雨天有雨粒子）
const shot = async (cond, name) => {
  await page.evaluate((c) => window.__setWeather(c), cond);
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => window.__scene.currentWeather);
  if (state !== cond) throw new Error(`weather not applied: ${state} != ${cond}`);
  await page.screenshot({ path: `F:/ai/xiaoai/docs/${name}` });
  console.log(cond, 'ok');
};
await shot('rain', 'preview-window-rain.png');
await shot('snow', 'preview-window-snow.png');
await shot('clear', 'preview-window-clear-night.png');

// 白天效果：临时把系统时间函数 mock 到中午（Date 覆盖仅影响页面内 skyState 采样）
await page.evaluate(() => {
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) { if (args.length === 0) { super(2026, 5, 15, 12, 0, 0); } else super(...args); }
    static now() { return new RealDate(2026, 5, 15, 12, 0, 0).getTime(); }
  }
  window.Date = MockDate;
});
await page.evaluate(() => window.__setWeather('clear'));
await page.waitForTimeout(2500); // 等分钟 key 变化重绘 + 光照采样
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-window-day.png' });
console.log('day clear ok');
await page.evaluate(() => window.__setWeather('rain'));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'F:/ai/xiaoai/docs/preview-window-day-rain.png' });
console.log('WEATHER + DAYCYCLE OK');
await browser.close();
