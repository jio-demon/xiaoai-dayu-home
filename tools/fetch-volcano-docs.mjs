// 用 playwright 渲染火山文档（JS SPA），抓音色列表/计费/快速入门正文
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();
const urls = [
  ['voices', 'https://www.volcengine.com/docs/6561/1257544'],
  ['quickstart', 'https://www.volcengine.com/docs/6561/1257543'],
  ['billing', 'https://www.volcengine.com/docs/6561/1257584'],
];
for (const [name, url] of urls) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    const txt = await page.evaluate(() => {
      const el = document.querySelector('article') || document.querySelector('.doc-content') || document.querySelector('main') || document.body;
      return el.innerText;
    });
    const fs = await import('node:fs');
    fs.writeFileSync(`F:/ai/xiaoai/tools/volcano-doc-${name}.txt`, txt);
    console.log(name, 'len', txt.length);
  } catch (e) { console.log(name, 'FAIL', e.message); }
}
await browser.close();
