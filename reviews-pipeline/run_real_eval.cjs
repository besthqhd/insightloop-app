const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/BestMM/WorkBuddy/2026-07-26-18-19-49';
const PIPE = path.join(ROOT, 'reviews-pipeline');
const URL = 'http://127.0.0.1:8139/index.html';
const initJs = fs.readFileSync(path.join(PIPE, 'real-data.js'), 'utf-8');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  await page.addInitScript(initJs);
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.style.setProperty('--scale', '1'));

  // ===== Phase B: 评估看板（真实评论 Eval）=====
  await page.click('.tab[data-page="eval"]');
  await page.waitForTimeout(400);
  await page.click('#eval-run-btn');
  try {
    await page.waitForFunction(
      () => { const e = document.getElementById('eval-total'); return e && e.textContent.trim() !== '—'; },
      { timeout: 60000 }
    );
  } catch (e) {
    console.log('eval wait timeout:', e.message);
  }
  await page.waitForTimeout(600);
  const metrics = await page.evaluate(() => ({
    total: document.getElementById('eval-total').textContent.trim(),
    fmt: document.getElementById('eval-fmt').textContent.trim(),
    under: document.getElementById('eval-under').textContent.trim(),
    help: document.getElementById('eval-help').textContent.trim(),
    meta: document.getElementById('eval-meta').textContent.trim(),
  }));
  console.log('EVAL METRICS:', JSON.stringify(metrics));
  // 逐条审计 dump（用于核验 19% 是否由标注错误 vs Mock 真实盲区导致）
  const runs = await page.evaluate(() => (window.__lastEvalRuns || []).map(r => ({
    cat: r.cat, input: r.input, expect: r.expect,
    got: { user_emotion: r.data && r.data.user_emotion, confidence: r.data && r.data.confidence,
           risk_flag: r.data && r.data.risk_flag, problem_source: r.data && r.data.problem_source,
           sub_intents: (r.data && Array.isArray(r.data.sub_intents)) ? r.data.sub_intents.length : 0 },
    fmt: r.fmt, understood: r.understood, helpful: r.helpful,
  })));
  fs.writeFileSync(path.join(PIPE, 'eval-results-real.json'), JSON.stringify(runs, null, 2));
  console.log('saved eval-results-real.json (' + runs.length + ' cases)');
  const el = await page.$('.app-root');
  await el.screenshot({ path: path.join(PIPE, 'eval-dashboard-real.png') });
  console.log('saved eval-dashboard-real.png');

  // ===== Phase C: 反馈中心批量分析 -> 洞察看板 / 机会工作区 =====
  await page.click('.tab[data-page="feedback"]');
  await page.waitForTimeout(500);
  const fbCount = await page.evaluate(() => document.querySelectorAll('#feedback-cards .feedback-card').length);
  console.log('feedback cards rendered:', fbCount);
  await page.click('button[data-ai-cap="batch_analyze"]');
  await page.waitForTimeout(9000); // 等待多智能体分析
  // 洞察看板
  const insightsEl = await page.$('.app-root');
  await insightsEl.screenshot({ path: path.join(PIPE, 'insights-real.png') });
  console.log('saved insights-real.png');
  // 机会工作区
  await page.click('.tab[data-page="opportunities"]');
  await page.waitForTimeout(1200);
  const oppEl = await page.$('.app-root');
  await oppEl.screenshot({ path: path.join(PIPE, 'opportunities-real.png') });
  console.log('saved opportunities-real.png');

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
