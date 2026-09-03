/* Reproducible Evals runner. Defaults to Mock; real calls require explicit env vars. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const URL = process.env.INSIGHTLOOP_URL || 'http://127.0.0.1:8139/index.html';
const RUNS = path.join(__dirname, 'runs');
const useReal = process.env.INSIGHTLOOP_USE_REAL === '1';
const model = process.env.INSIGHTLOOP_MODEL || (useReal ? 'UNSPECIFIED_REAL_MODEL' : 'mock');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-') }__${model.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
const sha = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unavailable'; } };

if (useReal && !process.env.INSIGHTLOOP_PROXY_URL && !process.env.INSIGHTLOOP_API_KEY) {
  throw new Error('真实模型运行需设置 INSIGHTLOOP_PROXY_URL（推荐）或 INSIGHTLOOP_API_KEY；密钥不会写入运行产物。');
}

(async () => {
  fs.mkdirSync(RUNS, { recursive: true });
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript((cfg) => {
    localStorage.setItem('insightloop_use_real', cfg.useReal ? '1' : '0');
    if (cfg.useReal) localStorage.setItem('insightloop_ai_config', JSON.stringify(cfg));
  }, { useReal, baseUrl: process.env.INSIGHTLOOP_API_BASE_URL || '', model, apiKey: process.env.INSIGHTLOOP_API_KEY || '', proxyUrl: process.env.INSIGHTLOOP_PROXY_URL || '' });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('.tab[data-page="eval"]');
  await page.click('#eval-run-btn');
  await page.waitForFunction(() => document.getElementById('eval-total')?.textContent.trim() !== '—', { timeout: 10 * 60 * 1000 });
  const payload = await page.evaluate(() => ({
    metrics: {
      total: document.getElementById('eval-total')?.textContent.trim(),
      format_stability: document.getElementById('eval-fmt')?.textContent.trim(),
      at_least_one_field_match: document.getElementById('eval-under')?.textContent.trim(),
      actionable_proxy_pass: document.getElementById('eval-help')?.textContent.trim(),
    },
    page_meta: document.getElementById('eval-meta')?.textContent.trim(),
    cases: (window.__lastEvalRuns || []).map(r => ({
      category: r.cat, input: r.input, expect: r.expect, output: r.data || null, status: r.status, error: r.error || null,
      format_stable: r.fmt, at_least_one_field_match: r.understood, actionable_proxy_pass: r.helpful,
    })),
  }));
  const metadata = {
    run_id: runId, executed_at: new Date().toISOString(),
    dataset: { name: '公开竞品评论评测集', case_count: payload.cases.length, data_file: 'reviews-pipeline/real-data.js' },
    model: { mode: useReal ? 'real' : 'mock', name: model, api_base_url: process.env.INSIGHTLOOP_API_BASE_URL || null, proxy_configured: Boolean(process.env.INSIGHTLOOP_PROXY_URL) },
    evaluator: { git_sha: sha(), script: 'reviews-pipeline/run_real_eval.cjs', concurrency: 2 },
    metric_definitions: {
      format_stability: '模型调用结果非 failed 的比例；调用链包含解析与契约校验。',
      at_least_one_field_match: '情绪、风险、多意图、来源、时间中至少一项命中预期的比例。',
      actionable_proxy_pass: '格式成功且置信度非 low，或命中风险升级；不是人工有帮助率。',
    },
    limitations: ['公开竞品评论，不是 InsightLoop 用户数据。', '评测标签并非独立人工金标。', '运行产物不含 API Key。'],
    page_errors: errors,
  };
  const base = path.join(RUNS, runId);
  fs.writeFileSync(`${base}.metadata.json`, JSON.stringify(metadata, null, 2));
  fs.writeFileSync(`${base}.results.json`, JSON.stringify(payload, null, 2));
  await page.screenshot({ path: `${base}.png`, fullPage: false });
  await browser.close();
  console.log(JSON.stringify({ runId, mode: metadata.model.mode, metrics: payload.metrics, files: [`${base}.metadata.json`, `${base}.results.json`, `${base}.png`] }, null, 2));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
