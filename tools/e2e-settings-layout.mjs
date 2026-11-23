// 设置面板布局回归：模拟 Chrome61（无 flex-gap / inset / #RRGGBBAA）验证不再叠字
import { chromium } from 'playwright-core';
const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1210/chrome-win64/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } }); // LX04 分辨率
await page.goto('http://localhost:5173/#/device');
await page.waitForSelector('.voice-dock', { timeout: 20000 });
await page.waitForTimeout(2500);
await page.click('button.gear');
await page.waitForSelector('.settings-panel');
await page.waitForTimeout(600);

// 用 CSS 摘除 gap/inset 模拟旧引擎不支持的效果（回退规则应兜住）
await page.addStyleTag({ content: `* { gap: 0 !important; row-gap: 0 !important; column-gap: 0 !important; }` });
await page.waitForTimeout(300);

// 检查 settings-body 直接子 section 之间、section 内子元素之间是否重叠
const overlaps = await page.evaluate(() => {
  const bad = [];
  const check = (els, label) => {
    const rects = [...els].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.height > 0);
    for (let i = 1; i < rects.length; i++) {
      const prev = rects[i - 1].r, cur = rects[i].r;
      if (cur.top < prev.bottom - 2) bad.push(`${label}[${i}] top=${cur.top.toFixed(0)} < prevBottom=${prev.bottom.toFixed(0)} (${rects[i].e.className || rects[i].e.tagName})`);
    }
  };
  const body = document.querySelector('.settings-body');
  check(body.children, 'section');
  body.querySelectorAll(':scope > section').forEach((s, si) => check(s.children, `sec${si}`));
  return bad;
});
console.log('overlap count:', overlaps.length);
overlaps.slice(0, 10).forEach((o) => console.log(' -', o));
await page.screenshot({ path: 'F:/ai/xiaoai/docs/settings-nogap-check.png' });
await browser.close();
if (overlaps.length) { console.log('FAIL'); process.exit(1); }
console.log('PASS: no overlap without flex-gap');
