// E2E 语音链路：假 key 下验证 唤醒→录音→VAD→ASR(经代理)→错误可见；以及 TTS/ASR/Embedding 连通测试。
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ permissions: ['microphone'] });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });

// 先经管理页首次设置建立配置（与真实用户路径一致）
const admin0 = await ctx.newPage();
await admin0.goto(BASE + '/#/admin');
await admin0.waitForSelector('input[placeholder*="新密码"]', { timeout: 15000 });
await admin0.fill('input[placeholder*="新密码"]', 'test1234');
await admin0.fill('input[placeholder="再输入一次"]', 'test1234');
await admin0.click('button:has-text("设置并进入")');
await admin0.waitForSelector('text=状态与控制');
await admin0.close();

await page.goto(BASE + '/#/device');
await page.waitForSelector('.voice-dock');
await page.waitForFunction(() => !!localStorage.getItem('xiaoai:blob:config'), null, { timeout: 15000 });

// 配置四个假 key（直接写 localStorage，模拟用户已填 key）
await page.evaluate(() => {
  const raw = localStorage.getItem('xiaoai:blob:config');
  const cfg = JSON.parse(raw);
  for (const k of ['llm', 'asr', 'tts', 'embedding']) cfg[k].apiKey = 'sk-fake-e2e';
  localStorage.setItem('xiaoai:blob:config', JSON.stringify(cfg));
});
await page.reload();
await page.waitForSelector('.voice-dock');

// 管理页逐项连通测试（应全部到达云端并返回 401，而非 Failed to fetch）
const admin = await ctx.newPage();
await admin.goto(BASE + '/#/admin');
await admin.waitForSelector('input[placeholder="管理密码"]', { timeout: 15000 });
await admin.fill('input[placeholder="管理密码"]', 'test1234');
await admin.click('button:has-text("登录")');
await admin.waitForSelector('text=状态与控制');
await admin.click('text=模型与 API');
await admin.waitForSelector('h3:has-text("大模型（对话）")');
for (const name of ['大模型（对话）', '语音识别 ASR', '语音合成 TTS', '向量 Embedding']) {
  const sec = admin.locator('section.card', { hasText: name });
  await sec.locator('button:has-text("连通测试")').click();
  await admin.waitForFunction((n) => {
    const cards = [...document.querySelectorAll('section.card')];
    const c = cards.find((x) => x.textContent.includes(n));
    return c && (c.querySelector('.conn-ok') || c.querySelector('.conn-fail'));
  }, name, { timeout: 40000 });
  const txt = await sec.locator('.conn-ok, .conn-fail').innerText();
  console.log(name, '=>', txt.slice(0, 140));
  if (/Failed to fetch/i.test(txt)) throw new Error(name + ' still CORS-blocked!');
}
await admin.screenshot({ path: 'docs/preview-conn-test.png' });

// 设备页：模拟唤醒 → 假麦克风持续音 → VAD 触发 → ASR 请求经代理 → 401 错误 toast 可见
await page.bringToFront();
await page.click('button:has-text("模拟唤醒")');
// 等待错误 toast（ASR 401）或聆听状态变化
await page.waitForSelector('.toast', { timeout: 30000 });
const toast = await page.locator('.toast').innerText();
console.log('voice-chain toast:', toast.slice(0, 160));
if (!/语音识别失败|401/.test(toast)) throw new Error('unexpected toast: ' + toast);
console.log('VOICE CHAIN OK: wake→record→VAD→ASR via proxy, error surfaced');
await page.screenshot({ path: 'docs/preview-voice-error.png' });

await browser.close();
console.log('ALL VOICE E2E PASSED');
