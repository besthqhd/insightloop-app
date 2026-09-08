/* Run the real InsightLoop five-agent pipeline on a versioned user-test dataset. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'real-user-test-v1.json');
const RUNS = path.join(__dirname, 'runs');
const URL = process.env.INSIGHTLOOP_URL || 'http://127.0.0.1:8139/index.html';
const model = process.env.INSIGHTLOOP_MODEL || 'glm-4-flash';
const proxyUrl = process.env.INSIGHTLOOP_PROXY_URL || '';
const apiKey = process.env.INSIGHTLOOP_API_KEY || '';
const baseUrl = process.env.INSIGHTLOOP_API_BASE_URL || '';
const dataset = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runId = `${stamp}__${dataset.dataset_id}__${model.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
const gitSha = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unavailable'; } };

if (!proxyUrl && !apiKey) throw new Error('真实模型运行需设置 INSIGHTLOOP_PROXY_URL 或 INSIGHTLOOP_API_KEY。');

(async () => {
  console.log(`[1/6] load dataset ${dataset.dataset_id}: ${dataset.records.length} records / ${dataset.participant_count} participants`);
  fs.mkdirSync(RUNS, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`); });
  await page.addInitScript(({ records, cfg }) => {
    window.__ANALYSIS_FEEDBACKS__ = records;
    localStorage.setItem('insightloop_use_real', '1');
    localStorage.setItem('insightloop_ai_config', JSON.stringify(cfg));
  }, { records: dataset.records, cfg: { useReal: true, baseUrl, model, apiKey, proxyUrl } });
  console.log(`[2/6] open ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__runAgentPipelineForAudit === 'function');
  console.log(`[3/6] run five-agent pipeline with ${model}`);
  const result = await page.evaluate(async () => {
    const final = await window.__runAgentPipelineForAudit({
      seed: 20260908,
      timeoutMs: 60000,
      maxRetry: 0,
      instruction: '仅依据输入证据分析；保留证据 ID；不要把记录数当参与者人数，不得编造效果或用户规模。',
    });
    return { final, audit: window.__lastAgentPipelineAudit };
  });
  console.log(`[4/6] pipeline finished: ${result.final?.status || 'unknown'}`);
  const metadata = {
    run_id: runId,
    executed_at: new Date().toISOString(),
    dataset: { id: dataset.dataset_id, participant_count: dataset.participant_count, record_count: dataset.record_count, unit: dataset.unit, limitations: dataset.limitations },
    model: { mode: 'real', name: model, proxy_configured: Boolean(proxyUrl), api_base_url: baseUrl || null },
    evaluator: { git_sha: gitSha(), script: 'reviews-pipeline/run_user_test_pipeline.cjs', seed: 20260908, pipeline: '5-agent-serial' },
    page_errors: pageErrors,
    limitations: ['单次真实模型运行，不代表总体模型能力。', '输入是合并转述意见，不是逐字原始评论。', '运行产物不含 API Key。'],
  };
  const base = path.join(RUNS, runId);
  fs.writeFileSync(`${base}.metadata.json`, JSON.stringify(metadata, null, 2));
  fs.writeFileSync(`${base}.results.json`, JSON.stringify(result, null, 2));
  console.log('[5/6] audit JSON saved');
  await page.screenshot({ path: `${base}.png`, fullPage: false });
  await browser.close();
  console.log('[6/6] browser closed');
  console.log(JSON.stringify({ runId, final_status: result.final?.status, files: [`${base}.metadata.json`, `${base}.results.json`, `${base}.png`] }, null, 2));
})().catch(async error => {
  console.error('FATAL', error.stack || error.message);
  process.exitCode = 1;
});
