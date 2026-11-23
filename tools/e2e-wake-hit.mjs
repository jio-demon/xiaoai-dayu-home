// 唤醒词命中 → kws → 录音状态切换（注入 SpeechRecognition mock，验证 useWebWake 逻辑链路）
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ permissions: ['microphone'] });
const page = await ctx.newPage();
await page.addInitScript(() => {
  // 假 SpeechRecognition：start 后 1 秒吐出「大飞鱼」（同音容错测试）
  class FakeRec {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; }
    start() {
      this.onstart && this.onstart();
      setTimeout(() => {
        const ev = { resultIndex: 0, results: [[{ transcript: '大飞鱼' }]] };
        ev.results[0][0] = { transcript: '大飞鱼' };
        this.onresult && this.onresult(ev);
      }, 1000);
    }
    abort() { this.onend && this.onend(); }
    stop() { this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
});
await page.goto('http://localhost:5173/#/admin');
await page.waitForSelector('input[placeholder*="新密码"]');
await page.fill('input[placeholder*="新密码"]', 'test1234');
await page.fill('input[placeholder="再输入一次"]', 'test1234');
await page.click('button:has-text("设置并进入")');
await page.waitForSelector('text=状态与控制');
await page.evaluate(() => localStorage.setItem('xiaoai-web-wake', '1'));
// hash 导航不会重载页面，必须 reload 让 addInitScript 的 FakeRec 生效
await page.goto('http://localhost:5173/#/device');
await page.reload();
await page.waitForSelector('.voice-dock');
// 等聆听提示出现 → 假识别 1 秒后命中「大飞鱼」→ 应进入 listening（录音）状态
await page.waitForSelector('.web-wake-hint', { timeout: 10000 });
console.log('listening hint OK');
// 命中「大飞鱼」→ kws → startRecord：ring 应变 voice-listening（假麦克风持续音，VAD 前）
await page.waitForSelector('.voice-ring.voice-listening', { timeout: 10000 });
console.log('WAKE HIT OK: ring entered listening state via homophone 大飞鱼');
const state = await page.evaluate(() => ({
  ringClass: document.querySelector('.voice-ring')?.className,
  label: document.querySelector('.ring-label')?.textContent,
}));
console.log(JSON.stringify(state));
await page.screenshot({ path: 'docs/preview-wake-hit.png' });
await browser.close();

