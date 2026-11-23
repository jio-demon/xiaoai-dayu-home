import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage();
const fs = await import('node:fs');
for (const [name, url] of [
  ['billing-overview', 'https://docs.volcengine.com/docs/doubao-voice/billing-overview?lang=zh'],
  ['billing-instructions', 'https://docs.volcengine.com/docs/doubao-voice/billing-instructions?lang=zh'],
]) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(7000);
    const txt = await page.evaluate(() => (document.querySelector('article') || document.querySelector('main') || document.body).innerText);
    fs.writeFileSync(`F:/ai/xiaoai/tools/volcano-doc-${name}.txt`, txt);
    console.log(name, txt.length);
  } catch (e) { console.log(name, 'FAIL', e.message); }
}
await browser.close();
