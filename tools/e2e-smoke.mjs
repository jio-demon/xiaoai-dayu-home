// E2E 冒烟：真实 Chromium 验证连通测试按钮 + 云代理 + 网页唤醒开关（无 key 时给出明确提示）。
import { chromium } from 'playwright-core';

const EXE = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });

// 1. 设备页初始化配置
await page.goto(BASE + '/#/device');
await page.waitForSelector('.voice-dock', { timeout: 15000 });
console.log('device page OK');

// 2. 管理页首次设置密码
const admin = await ctx.newPage();
await admin.goto(BASE + '/#/admin');
await admin.waitForSelector('input[placeholder*="新密码"]', { timeout: 15000 });
await admin.fill('input[placeholder*="新密码"]', 'test1234');
await admin.fill('input[placeholder="再输入一次"]', 'test1234');
await admin.click('button:has-text("设置并进入")');
await admin.waitForSelector('text=状态与控制', { timeout: 15000 });
console.log('admin setup+login OK');

// 3. 模型与 API → 每项有连通测试按钮
await admin.click('text=模型与 API');
await admin.waitForSelector('h3:has-text("大模型（对话）")');
const btns = await admin.locator('button:has-text("连通测试")').count();
console.log('conn-test buttons:', btns);
if (btns !== 4) throw new Error('expect 4 test buttons, got ' + btns);

// 4. 无 key 测试 → 明确提示
await admin.locator('button:has-text("连通测试")').first().click();
await admin.waitForSelector('.conn-fail', { timeout: 10000 });
console.log('no-key result:', await admin.locator('.conn-fail').first().innerText());

// 5. 填假 key → 走 /cloud-proxy 代理 → 应返回 HTTP 401（证明 CORS 已绕开，请求到达 DeepSeek）
const llmSection = admin.locator('section.card', { hasText: '大模型（对话）' });
await llmSection.locator('input[type="password"]').fill('sk-fake-key-for-e2e-test');
await llmSection.locator('button:has-text("连通测试")').click();
await admin.waitForSelector('.conn-fail, .conn-ok', { timeout: 30000 });
const resText = await llmSection.locator('.conn-fail, .conn-ok').innerText();
console.log('fake-key result:', resText.slice(0, 200));
if (!/401/.test(resText)) throw new Error('expected HTTP 401 via proxy, got: ' + resText);
console.log('CLOUD PROXY OK (reached DeepSeek, 401 as expected with fake key)');

// 6. 截图：连通测试界面
await admin.screenshot({ path: 'docs/preview-conn-test.png', fullPage: false });

// 7. 设备页设置 → 网页语音唤醒开关存在
await page.click('button[aria-label="设置"]');
await page.waitForSelector('text=网页语音唤醒（实验）');
console.log('web-wake toggle present OK');
await page.screenshot({ path: 'docs/preview-web-wake-settings.png' });

await browser.close();
console.log('ALL E2E CHECKS PASSED');
