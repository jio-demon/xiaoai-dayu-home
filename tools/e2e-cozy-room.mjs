// 奶油海盐小屋：800×480 浏览器回归。天气/API 全部 mock，不访问公网或真实设备。
// node tools/e2e-cozy-room.mjs （自动寻找 Edge/Chrome；必要时启动并清理自己的 Vite）
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = resolve(ROOT, 'docs/screenshots');
mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.ROOM_E2E_BASE || 'http://127.0.0.1:5173';
const candidates = [process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const executablePath = candidates.find(p => p && existsSync(p));
if (!executablePath) throw new Error('未找到 Edge/Chrome；请设置 CHROME_PATH');

async function reachable() {
  try { return (await fetch(BASE, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}
let server = null;
if (!(await reachable())) {
  const viteEntry = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  server = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1'], {
    cwd: resolve(ROOT, 'apps/web'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let log = '';
  server.stdout.on('data', d => { log += d; });
  server.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 80 && !(await reachable()); i++) {
    if (server.exitCode !== null) throw new Error(`Vite 启动失败：${log}`);
    await new Promise(r => setTimeout(r, 250));
  }
  if (!(await reachable())) throw new Error(`Vite 启动超时：${log}`);
}

const browser = await chromium.launch({ executablePath, headless: true, args: [
  '--use-gl=angle', '--use-angle=swiftshader',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
] });
const failures = [];
let weatherCode = '00';
const roomPng = /\/assets\/room\/[^/?]+\.png(?:\?|$)/;
const external = /\/cloud-proxy\/|https?:\/\/(?!127\.0\.0\.1|localhost)/;
async function makePage({ hour = 12, blockAssets = false, mode = '3d' } = {}) {
  const context = await browser.newContext({ viewport: { width: 800, height: 480 }, deviceScaleFactor: 1, permissions: ['microphone'] });
  const errors = [];
  const expectedOfflineResponses = [];
  await context.addInitScript(({ hour, mode }) => {
    window.__roomPreview = { hour };
    localStorage.setItem('xiaoai:blob:config', JSON.stringify({ city: { name: '广州', province: '广东' }, renderMode: mode, brightness: 1, subtitles: true }));
  }, { hour, mode });
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (blockAssets && roomPng.test(url)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'intentional offline asset regression' });
    if (url.includes('/cloud-proxy/wis.qq.com/weather/common')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { observe: { degree: '18', weather_code: weatherCode, weather: weatherCode === '13' ? '雪' : weatherCode === '07' ? '雨' : '晴' } } }) });
    }
    if (url.includes('/cloud-proxy/api.siliconflow.cn/v1/audio/transcriptions')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":""}' });
    }
    if (external.test(url)) {
      // Expected offline responses are not application failures; Chromium still logs their HTTP status.
      expectedOfflineResponses.push(url);
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline deterministic E2E"}' });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', response => {
    if (response.status() === 503 && expectedOfflineResponses.includes(response.url())) expectedOfflineResponses.shift();
  });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // 故意断开的 PNG 会产生浏览器资源错误；应用必须继续渲染，其他错误不允许。
    if ((blockAssets && /Failed to load resource.*404/.test(m.text())) ||
        (/Failed to load resource.*503/.test(m.text()) && expectedOfflineResponses.length > 0)) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', r => {
    if (!(blockAssets && roomPng.test(r.url()))) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  await page.goto(`${BASE}/#/device`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__scene?.glb && window.__scene.roomStats.drawCalls > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page, errors };
}
function check(condition, message) { if (!condition) throw new Error(message); }
async function stats(page) { return page.evaluate(() => ({ ...window.__scene.roomStats, mode: window.__scene.mode, weather: window.__scene.currentWeather })); }
async function screenshot(page, name) { await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' }); }
async function closeCase(c) {
  failures.push(...c.errors);
  await c.context.close();
}
async function setWeather(page, code, condition) {
  weatherCode = code;
  await page.evaluate(c => window.__setWeather(c), condition);
  await page.waitForFunction(c => window.__scene.currentWeather === c, condition);
  await page.waitForTimeout(500);
}

try {
  // 默认新房间 + 实际 GLB + 日光；预算是几何上限，不把 SwiftShader FPS 当 LX04 实测。
  let c = await makePage();
  let s = await stats(c.page);
  check(!s.fallbackUsed && s.triangles <= 30000 && s.drawCalls <= 150, `新房间/预算异常 ${JSON.stringify(s)}`);
  check(await c.page.locator('.topbar-weather').innerText().then(t => t.includes('广州')), 'mock 天气未进入顶栏');
  await screenshot(c.page, 'preview-cozy-day-800x480.png');
  console.log('[day]', JSON.stringify(s));

  await setWeather(c.page, '07', 'rain');
  await c.page.evaluate(() => { window.__roomPreview.hour = 22; });
  await c.page.waitForTimeout(1400);
  check(await c.page.evaluate(() => {
    const w = window.__scene.room.interactives.find(i => i.name === 'window').object;
    return w.children.filter(o => o.isPoints && o.visible).length === 1;
  }), '3D 雨粒子未按窗口开关');
  await screenshot(c.page, 'preview-cozy-rain-night-800x480.png');

  await setWeather(c.page, '13', 'snow');
  check(await c.page.evaluate(() => {
    const ps = window.__scene.room.interactives.find(i => i.name === 'window').object.children.filter(o => o.isPoints);
    return ps.length === 2 && ps.filter(o => o.visible).length === 1 && ps.find(o => o.visible).material.size > 0.03;
  }), '雪天未切换为单独雪粒子');
  await screenshot(c.page, 'preview-cozy-snow-night-800x480.png');

  // 模拟唤醒走真实按钮与麦克风桥；fake audio 不依赖外部 ASR。
  await c.page.click('button:has-text("模拟唤醒")');
  // headless fake audio 可能在按钮返回前就完成 VAD；监听态或已站定都算唤醒成功。
  await c.page.waitForFunction(() => document.querySelector('.voice-ring.voice-listening') || window.__scene.loco.isEngaged, null, { timeout: 10000 });
  await c.page.waitForFunction(() => {
    const l = window.__scene.loco;
    return l?.isEngaged && Math.hypot(l.position.x + 1.05, l.position.z - 1.35) < 0.08 && !l.isWalking;
  }, null, { timeout: 15000 });
  await screenshot(c.page, 'preview-cozy-wake-800x480.png');
  if (await c.page.locator('.voice-ring.voice-listening').count()) await c.page.click('.voice-ring');
  await c.page.waitForFunction(() => !document.querySelector('.voice-ring.voice-listening'), null, { timeout: 10000 });
  await c.page.evaluate(() => window.__scene.setCharacterState('idle'));
  await c.page.waitForFunction(() => !window.__scene.loco.isEngaged, null, { timeout: 12000 });
  console.log('[wake] engage → stop mic → idle wander OK');

  // 点击真实投影角色，而非只调用内部 pet()；字幕证明 onTap 链路也到达。
  const point = await c.page.evaluate(() => {
    const scene = window.__scene, g = scene.glb.group;
    const v = g.position.clone(); v.y += 0.85; v.project(scene.camera3);
    const r = scene.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 };
  });
  await c.page.mouse.click(point.x, point.y);
  await c.page.waitForSelector('.subtitles .sub-text', { timeout: 5000 });
  await screenshot(c.page, 'preview-cozy-pet-800x480.png');
  await closeCase(c);

  // 强制降级仍用同一套家具和四帧立绘；雨雪限制在投影窗框内。
  weatherCode = '07';
  c = await makePage({ hour: 22, mode: '2.5d' });
  await c.page.waitForFunction(() => window.__scene.fallback?.sprites && window.__scene.currentWeather === 'rain');
  await c.page.waitForTimeout(1200);
  s = await stats(c.page);
  check(s.mode === '2.5d' && !s.fallbackUsed, '2.5D 不应误报旧房间 fallback');
  check(await c.page.evaluate(() => {
    const f = window.__scene.fallback;
    return f.rain.visible && !f.snow.visible && f.hitRects.length === 8 && f.sprites.normal.every(t => !t.isCanvasTexture);
  }), '2.5D 烘焙帧/交互矩形/雨粒子异常');
  await screenshot(c.page, 'preview-cozy-25d-rain-800x480.png');
  await c.page.evaluate(() => window.__scene.pet());
  await c.page.waitForTimeout(350);
  check(await c.page.evaluate(() => window.__scene.fallback.sprite.material.map === window.__scene.fallback.sprites.happy[window.__scene.fallback.frameIdx]), '摸头未使用 happy 精灵组');
  await c.page.evaluate(() => window.__scene.setMode('3d'));
  check(await c.page.evaluate(() => window.__scene.mode === '3d' && window.__scene.fallback === null), '切回 3D 未释放 fallback');
  await closeCase(c);

  // 所有房间贴图/精灵均 404：首帧 Canvas 形象与程序化材质必须可用。
  c = await makePage({ blockAssets: true });
  await c.page.waitForTimeout(1000);
  s = await stats(c.page);
  check(!s.fallbackUsed && s.drawCalls > 0, 'PNG 全失败时房间不可用');
  await c.page.evaluate(() => window.__scene.setMode('2.5d'));
  await c.page.waitForTimeout(600);
  check(await c.page.evaluate(() => window.__scene.fallback.sprites.normal.every(t => t.isCanvasTexture)), '精灵失败未整组回退 Canvas');
  await screenshot(c.page, 'preview-cozy-offline-assets-800x480.png');
  await closeCase(c);

  check(failures.length === 0, `浏览器错误：\n${failures.join('\n')}`);
  console.log('COZY ROOM E2E PASSED — 800×480; day/rain/snow/wake/pet/2.5D/offline assets');
} finally {
  await browser.close();
  if (server && server.exitCode === null) {
    if (process.platform === 'win32') spawn('taskkill.exe', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else server.kill('SIGTERM');
  }
}
