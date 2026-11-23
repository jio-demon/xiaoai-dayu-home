// 生成 README / 使用教程所需的界面截图（PC 模拟模式，Playwright + SwiftShader）。
// 用法：先 `npm run dev`，再 `node tools/docs-screenshots.mjs`；产物在 docs/screenshots/。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const EXE = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.resolve('docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });
const PW = 'demo1234';

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.grantPermissions(['microphone'], { origin: BASE });
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot', name); };

// ---------- 设备页 ----------
const dev = await ctx.newPage();
await dev.setViewportSize({ width: 1280, height: 720 });
dev.on('pageerror', (e) => console.log('[dev pageerror]', String(e).slice(0, 200)));
await dev.goto(`${BASE}/#/device`);
await dev.waitForSelector('.voice-dock', { timeout: 30000 });
await dev.waitForTimeout(5000); // GLB 加载 + 场景稳定

// 首次运行提示 → 设置密码
await shot(dev, 'device-first-run.png');
await dev.click('button.gear');
await dev.waitForSelector('.settings-panel');
await dev.fill('input[placeholder="新密码（≥4位）"]', PW);
await dev.click('.settings-body button.btn:has-text("设置密码")');
await dev.waitForSelector('.pw-msg');
await dev.waitForTimeout(400);
await dev.evaluate(() => { document.querySelector('.settings-panel h3')?.scrollIntoView({ block: 'start' }); });
await dev.waitForTimeout(200);
await shot(dev, 'device-settings-password.png');
// 城市天气：搜索广州并选中
await dev.fill('.city-search input', '广州');
await dev.click('.city-search button:has-text("搜索")');
await dev.waitForSelector('.city-hit', { timeout: 15000 });
await shot(dev, 'device-settings-city.png');
await dev.click('.city-hit');
await dev.waitForTimeout(600);
await dev.click('.btn-close');
await dev.waitForSelector('.topbar-weather', { timeout: 20000 });
await dev.waitForTimeout(3000);

// 夜景（默认雨）→ 白天晴 / 雪 / 夜晴：用页面内置调试钩子切换天气与时间
const setMockTime = (h) => dev.evaluate((hour) => {
  const RealDate = window.__RealDate || Date; window.__RealDate = RealDate;
  RealDate.__base = new RealDate(2026, 5, 15, hour, 0, 0).getTime(); RealDate.__t0 = RealDate.now();
  class MockDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(2026, 5, 15, hour, 0, 0); else super(...a); }
    static now() { return Date.__base + (RealDate.now() - Date.__t0); }
  }
  window.Date = MockDate;
}, h);
await dev.evaluate(() => window.__setWeather('rain'));
await dev.waitForTimeout(1500);
await shot(dev, 'device-night-rain.png');
await setMockTime(12);
await dev.evaluate(() => window.__setWeather('clear'));
await dev.waitForTimeout(3000);
await shot(dev, 'device-day-clear.png');
await dev.evaluate(() => window.__setWeather('snow'));
await dev.waitForTimeout(1800);
await shot(dev, 'device-day-snow.png');
await setMockTime(22);
await dev.evaluate(() => window.__setWeather('clear'));
await dev.waitForTimeout(3000);
await shot(dev, 'device-night-clear.png');

// 待机正面：让角色回到地毯中央面向镜头（仅截图用，不改产品代码）
await dev.evaluate(() => { const l = window.__scene.loco; l.engaged = false; l.phase = 'pause'; l.pauseLeft = 60; l.inner.group.position.set(l.opts.home.x, 0, l.opts.home.z); l.yawTarget = l.faceYaw; });
await dev.waitForTimeout(2500);
await shot(dev, 'device-idle-front.png');

// 唤醒 → 聆听态：headless 下 AudioContext 不出音频帧，MockBridge 会立刻收到 mic off。
// 这里替换 MockBridge.startMic/stopMic：直接进入录音态并周期性发 audioLevel。
await dev.evaluate(async () => {
  const { getMockBridge } = await import('/src/bridge/index.ts');
  const proto = Object.getPrototypeOf(getMockBridge());
  proto.startMic = async function (mode) {
    this.micMode = mode; this.pcmChunks = []; this.recordedB64 = null; this.vadActive = false;
    this.dispatch({ type: 'mic', state: 'on' });
    this.__fakeTimer = setInterval(() => this.dispatch({ type: 'audioLevel', level: 0.35 + Math.random() * 0.4 }), 120);
  };
  proto.stopMic = async function () {
    clearInterval(this.__fakeTimer); this.micMode = null;
    this.dispatch({ type: 'mic', state: 'off' });
  };
});
await dev.click('button.mock-wake');
await dev.waitForSelector('.voice-listening', { timeout: 10000 });
await dev.waitForTimeout(7000); // 角色小跑到镜头前并转身面向镜头
await shot(dev, 'device-listening.png');
// 字幕（演示文案，非真实对话）：注入与实际组件相同的 DOM
await dev.evaluate(() => {
  document.querySelector('.subtitles')?.remove();
  const el = document.createElement('div'); el.className = 'subtitles sub-ai';
  el.innerHTML = '<span class="sub-name">大肥鱼</span><span class="sub-text">欢迎回来～今天广州有点凉，记得多穿一件哦。</span>';
  document.querySelector('.device-root').appendChild(el);
});
await dev.waitForTimeout(300);
await shot(dev, 'device-subtitle.png');
await dev.evaluate(() => document.querySelector('.subtitles')?.remove());
await dev.click('.voice-ring'); // 结束录音回到待机
await dev.waitForTimeout(1500);
// ---------- 管理页 ----------
// 恢复真实时间（前面为拍昼夜切换 mock 过 Date），否则状态页运行时长会算成负数
await dev.evaluate(() => { if (window.__RealDate) window.Date = window.__RealDate; });
const admin = await ctx.newPage();
await admin.setViewportSize({ width: 1440, height: 900 });
admin.on('pageerror', (e) => console.log('[admin pageerror]', String(e).slice(0, 200)));
await admin.goto(`${BASE}/#/admin`);
await admin.waitForSelector('.login-card', { timeout: 15000 });
await shot(admin, 'admin-login.png');
await admin.fill('input[type=password]', PW);
await admin.click('button.btn-primary');
await admin.waitForSelector('.admin-nav', { timeout: 15000 });
await admin.waitForTimeout(2500);
await shot(admin, 'admin-status.png');

await admin.click('.nav-item:has-text("模型与 API")');
await admin.waitForSelector('h3:has-text("大模型（对话）")');
await admin.waitForTimeout(500);
await shot(admin, 'admin-config.png');
// 连通测试：填演示 key（无效），经 dev 代理到达 DeepSeek 返回 401，展示错误提示样式
const llm = admin.locator('section.card', { hasText: '大模型（对话）' });
await llm.locator('input[type="password"]').fill('sk-demo-invalid-key-for-screenshot');
await llm.locator('button:has-text("连通测试")').click();
await llm.locator('.conn-fail, .conn-ok').waitFor({ timeout: 30000 });
await admin.waitForTimeout(300);
await shot(admin, 'admin-conn-test.png');
console.log('conn result:', (await llm.locator('.conn-fail, .conn-ok').innerText()).slice(0, 120));
await llm.locator('input[type="password"]').fill('');

await admin.click('.nav-item:has-text("角色设定")');
await admin.waitForSelector('.persona-area');
await admin.waitForTimeout(400);
await shot(admin, 'admin-persona.png');

// 记忆宫殿 / 卡片 / 历史：注入演示数据（仅存在于本次浏览器 localStorage）
await admin.evaluate(async () => {
  const day = 86400000, now = Date.now();
  const mk = (id, room, type, text, importance, strength, extra = {}) => ({
    id, room, type, text, importance, strength, createdAt: now - 6 * day, lastRecalledAt: now - day,
    recallCount: 3, pinned: false, sourceSessionIds: ['sess_demo_1'], ...extra,
  });
  const cards = [
    mk('m1', 'study', 'preference', '主人喜欢蓝发鲸鱼娘，房间要深蓝色调', 0.8, 0.95, { pinned: true }),
    mk('m2', 'study', 'fact', '主人在做 LX04 音箱改造项目，用 TypeScript', 0.7, 0.72),
    mk('m3', 'kitchen', 'promise', '约定每周五晚上一起看电影', 0.9, 0.88, { pinned: true }),
    mk('m4', 'kitchen', 'promise', '主人说要早点睡，不再熬夜', 0.75, 0.61),
    mk('m5', 'living', 'event', '上周主人的项目通过了验收', 0.85, 0.8),
    mk('m6', 'living', 'fact', '主人养了一只叫「汤圆」的猫', 0.65, 0.55),
    mk('m7', 'bedroom', 'emotion', '主人最近工作压力有点大，需要多关心', 0.8, 0.7),
    mk('m8', 'hall', 'fact', '主人住在广州，窗外常常下雨', 0.5, 0.66),
    mk('m9', 'hall', 'preference', '主人早上喜欢喝一杯热美式', 0.4, 0.45),
    mk('m10', 'attic', 'event', '很久前提过一次想去海边看鲸鱼', 0.3, 0.12, { archived: true }),
  ];
  const sessions = [{
    id: 'sess_demo_1', startedAt: now - day - 600000, endedAt: now - day, summary: '主人聊了工作近况，约定周五晚一起看电影；大肥鱼提醒他早点休息。',
    turns: [
      { role: 'user', text: '这周终于把项目忙完了，好累呀。', ts: now - day - 590000 },
      { role: 'assistant', text: '辛苦啦，浮出水面喘口气吧。我记得你说过想早点睡的，今晚可别再熬夜了哦。', ts: now - day - 580000 },
      { role: 'user', text: '嗯，周五晚上一起看电影放松一下？', ts: now - day - 500000 },
      { role: 'assistant', text: '好呀，那就说定了，周五晚上我潜到沙发旁边陪你。想看什么？', ts: now - day - 490000 },
    ],
  }];
  localStorage.setItem('xiaoai:blob:cards', JSON.stringify(cards));
  localStorage.setItem('xiaoai:blob:sessions', JSON.stringify(sessions));
});
await admin.reload();
await admin.waitForSelector('.admin-nav', { timeout: 15000 });
await admin.click('.nav-item:has-text("记忆宫殿")');
await admin.waitForSelector('.palace-svg');
await admin.waitForTimeout(800);
await shot(admin, 'admin-palace.png');
await admin.click('.nav-item:has-text("记忆卡片")');
await admin.waitForSelector('.mem-item');
await admin.waitForTimeout(400);
await shot(admin, 'admin-cards.png');
await admin.click('.nav-item:has-text("对话历史")');
await admin.waitForSelector('.sess-item');
await admin.click('.sess-head');
await admin.waitForTimeout(400);
await shot(admin, 'admin-history.png');
await admin.click('.nav-item:has-text("固件更新")');
await admin.waitForTimeout(600);
await shot(admin, 'admin-update.png');

await browser.close();
console.log('ALL SCREENSHOTS DONE →', OUT);







