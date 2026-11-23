// 验证 Web Speech API 在真实 Chromium 里的行为（无头环境无声卡，预期 network/audio-capture 错误路径）
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ permissions: ['microphone'] });
const page = await ctx.newPage();
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock');
const probe = await page.evaluate(() => new Promise((resolve) => {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return resolve({ supported: false });
  const rec = new Ctor();
  rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = true;
  const events = [];
  const done = () => resolve({ supported: true, events });
  const timer = setTimeout(done, 8000);
  rec.onstart = () => events.push('start');
  rec.onaudiostart = () => events.push('audiostart');
  rec.onspeechstart = () => events.push('speechstart');
  rec.onresult = (e) => events.push('result:' + e.results[0][0].transcript);
  rec.onerror = (e) => { events.push('error:' + e.error); clearTimeout(timer); setTimeout(done, 300); };
  rec.onend = () => { events.push('end'); clearTimeout(timer); setTimeout(done, 300); };
  try { rec.start(); } catch (e) { events.push('throw:' + e.message); done(); }
}));
console.log(JSON.stringify(probe));
await browser.close();
