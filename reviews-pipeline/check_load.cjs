const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:8140/index.html', { waitUntil: 'networkidle' });
  // real-data.js sets window.__EVAL_CASES__ as a global
  const nCases = await page.evaluate(() => (window.__EVAL_CASES__ || []).length);
  const nFb = await page.evaluate(() => (window.__FEEDBACKS__ || []).length);
  // switch to eval page and run evaluation (uses EVAL_CASES -> should be 143)
  await page.evaluate(() => {
    const tab = document.querySelector('[data-page="eval"]') || document.querySelector('a[data-page="eval"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(400);
  const runBtn = await page.$('button[data-ai-cap="run_eval"], #eval-run-btn, .eval-run');
  // click 运行评估 if found
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /运行评估/.test(x.textContent));
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(1500);
  const meta = await page.evaluate(() => {
    const m = document.getElementById('eval-meta');
    return m ? m.textContent : '(no eval-meta)';
  });
  console.log('EVAL_CASES loaded =', nCases);
  console.log('FEEDBACKS loaded =', nFb);
  console.log('run button found/clicked =', clicked);
  console.log('eval-meta after run =', meta);
  console.log('console errors =', errors.length ? errors.slice(0,5) : 'none');
  await browser.close();
})();
