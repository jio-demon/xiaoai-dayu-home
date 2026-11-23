import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('http://localhost:5173/#/admin');
await page.waitForSelector('input[placeholder*="新密码"]');
await page.fill('input[placeholder*="新密码"]', 'test1234');
await page.fill('input[placeholder="再输入一次"]', 'test1234');
await page.click('button:has-text("设置并进入")');
await page.waitForSelector('text=状态与控制');
await page.click('text=模型与 API');
await page.waitForSelector('text=语音合成 TTS');
const ttsCard = page.locator('section.card', { hasText: '语音合成 TTS' });
await ttsCard.locator('select').first().selectOption('volcano');
await page.waitForSelector('text=APP ID（仅旧版语音技术应用需要；新版留空）');
console.log('new APP ID label OK (optional for v3)');
await page.waitForSelector('option[value="zh_female_shuangkuaisisi_uranus_bigtts"]', { state: 'attached' });
console.log('2.0 uranus voice dropdown OK');
// 模型框应自动为 seed-tts-2.0
const modelVal = await ttsCard.locator('label').filter({ hasText: '模型' }).locator('input').inputValue();
console.log('model field:', modelVal);
if (modelVal !== 'seed-tts-2.0') throw new Error('model not seed-tts-2.0: ' + modelVal);
// 未填 key → 友好提示
await ttsCard.locator('button:has-text("连通测试")').click();
await page.waitForSelector('.conn-fail');
const msg = await ttsCard.locator('.conn-fail').textContent();
console.log('no-key msg:', msg);
if (!/API Key/.test(msg)) throw new Error('unexpected msg');
// 只填假 API Key（不填 APP ID）→ 走 v3，应到达火山服务器返回鉴权错误而非 Failed to fetch
await ttsCard.locator('input[type="password"]').fill('fake-apikey-e2e');
await ttsCard.locator('button:has-text("连通测试")').click();
await page.waitForFunction(() => {
  const el = [...document.querySelectorAll('section.card')].find(s => s.textContent.includes('语音合成 TTS'))?.querySelector('.conn-fail,.conn-ok');
  return el && !/测试中/.test(el.textContent) && /火山|HTTP|Api-Key/i.test(el.textContent);
}, { timeout: 25000 });
const res = await ttsCard.locator('.conn-fail,.conn-ok').textContent();
console.log('v3 cloud result:', res.slice(0, 200));
if (/Failed to fetch/.test(res)) throw new Error('CORS not bypassed!');
console.log('VOLCANO V3 PROXY OK (reached volcano cloud with API-key-only auth)');
await page.screenshot({ path: 'docs/preview-volcano-tts-v3.png', fullPage: false });
await browser.close();
