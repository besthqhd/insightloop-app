const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/BestMM/WorkBuddy/2026-07-26-18-19-49';
const PIPE = path.join(ROOT, 'reviews-pipeline');
const URL = 'http://127.0.0.1:8141/index.html';
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

  // 点开「AI 分析过程」抽屉先，让状态实时可见
  await page.evaluate(() => {
    const btn = document.querySelector('[data-ai-drawer="batch_analyze"]');
    if (btn) btn.click();
  });

  // 点反馈中心的批量 AI 分析（用 evaluate 触发，绕过视口可见性检查）
  await page.evaluate(() => {
    const btn = document.querySelector('[data-ai-cap="batch_analyze"]');
    if (btn) btn.click();
  });

  // 等 5 个 agent 全 done（最多 30s）
  try {
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll('#agent-drawer-body .agent-card')];
      if (cards.length !== 5) return false;
      return cards.every(c => c.querySelector('.agent-status.done'));
    }, { timeout: 30000 });
    console.log('PIPELINE: all 5 agents done');
  } catch (e) {
    console.log('PIPELINE: TIMEOUT waiting for all done');
  }

  const states = await page.evaluate(() => {
    return [...document.querySelectorAll('#agent-drawer-body .agent-card')].map(c => ({
      name: c.querySelector('.agent-name')?.textContent,
      status: c.querySelector('.agent-status')?.textContent.trim(),
    }));
  });
  console.log('AGENT STATES:', JSON.stringify(states, null, 2));

  // 检查最终是否跳转到洞察看板 + 有聚类摘要
  const onInsights = await page.evaluate(() => !!document.querySelector('.tab[data-page="insights"].active') || location.hash.includes('insights'));
  const summaryText = await page.evaluate(() => {
    const el = document.querySelector('#insights-summary, .insights-summary, [data-edit-cap="batch_analyze"]');
    return el ? el.textContent.slice(0, 120) : '(no insights summary node found)';
  });
  console.log('ON INSIGHTS TAB:', onInsights);
  console.log('SUMMARY SNIPPET:', summaryText);

  await page.screenshot({ path: path.join(PIPE, 'agent-pipeline-real.png'), fullPage: false });
  console.log('saved agent-pipeline-real.png');

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
