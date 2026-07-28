/**
 * InsightLoop · AI 前端联调层 (ai-integration.js)
 * -------------------------------------------------------------
 * 把四页里的「AI 按钮 + 可编辑区」真正接到 ai-contract.js：
 *   - mockModel：按 capability 返回符合固定 JSON 契约的“模型输出”（演示用，可替换为真实 API）
 *   - 三层展示法：①内联状态徽标 ②Agent 追溯抽屉 ③顶栏活动日志
 *   - UI 态：loading / success(partial) / failed / regenerate
 *   - 失败重试 + 模拟异常开关，便于演示“四问”中的异常处理分支
 *
 * 依赖：ai-contract.js 导出的 CAPABILITY / callModel / regenerate / getHistory
 */

import { CAPABILITY, callModel, regenerate, getHistory } from './ai-contract.js';

/* ============================ 能力中文标签 ============================ */
const LABELS = {
  [CAPABILITY.BATCH_ANALYZE]: '批量 AI 分析',
  [CAPABILITY.GENERATE_PRD]: 'AI 生成 PRD',
  [CAPABILITY.GEN_ACCEPTANCE]: '生成验收标准',
  [CAPABILITY.GEN_TRACKING]: '生成埋点方案',
  [CAPABILITY.DECOMPOSE_TASKS]: '拆解为任务',
  [CAPABILITY.AI_REVIEW]: 'AI 复盘结论',
  [CAPABILITY.AI_SUGGEST]: '下轮优化建议',
  [CAPABILITY.AI_SCORE]: 'AI 优先级评分',
};

/* ============================ 模拟异常模式 ============================
 * 0 正常 / 'timeout' 网络超时 / 'badjson' 返回非 JSON 脏文本
 * 由顶栏活动日志里的「模拟异常」下拉控制，便于演示失败/重生分支。
 */
let FAIL_MODE = 0;

/* ============================ 1. Mock 模型 ============================
 * 返回“原始模型输出”（JSON 字符串），让 callModel 走完整的
 * 解析 → 校验 → 兜底 链路，最贴近真实接入。
 */
const MOCK = {
  [CAPABILITY.BATCH_ANALYZE]: () => ({
    summary: '反馈聚类显示「导出报表耗时过长」为最高频且最严重主题，建议优先异步化。',
    themes: [
      { name: '导出报表耗时过长', count: 412, sentiment: 'negative', severity: 'P0', evidence_ids: ['fb_8821', 'fb_2043', 'fb_3155'] },
      { name: '移动端登录偶发失败', count: 286, sentiment: 'negative', severity: 'P1', evidence_ids: ['fb_7712'] },
      { name: '搜索结果不准确', count: 218, sentiment: 'neutral', severity: 'P1', evidence_ids: ['fb_6681'] },
      { name: '批量操作无进度提示', count: 154, sentiment: 'negative', severity: 'P2', evidence_ids: ['fb_5530'] },
      { name: '通知中心加载慢', count: 98, sentiment: 'negative', severity: 'P2', evidence_ids: ['fb_4490'] },
      { name: '深色模式对比度不足', count: 72, sentiment: 'positive', severity: 'P3', evidence_ids: ['fb_3370'] },
    ],
    suggested_opportunities: [
      { title: '导出报表异步化（流式 + 进度）', priority: 8.6, rationale: '412 条负反馈，P95≈118s' },
      { title: '移动端登录失败自愈与重试', priority: 8.2, rationale: '286 条，偶发阻断核心路径' },
    ],
    charts: { sentiment_dist: { negative: 0.38, neutral: 0.33, positive: 0.29 } },
  }),
  [CAPABILITY.GENERATE_PRD]: () => ({
    title: '导出报表异步化（流式 + 进度）',
    problem: '大报表导出为同步阻塞，最长 40s，期间无进度反馈，用户误判失败后重复点击。',
    user_story: '作为运营人员，我希望导出时看到实时进度并可中途取消，以便掌控等待时间。',
    solution: '改为流式生成 + SSE 进度推送；前端分块渲染；支持取消与断点续传。',
    scope: 'Web 端报表中心；首期覆盖 3 类核心报表。',
    acceptance_criteria: ['进度可见且实时', '支持中途取消', '失败可重试', 'P95 < 8s'],
    tracking_plan: ['export_start', 'export_progress', 'export_cancel', 'export_success'],
    task_breakdown: [
      { role: '前端', task: '进度条 + 取消组件', estimate_days: 3 },
      { role: '后端', task: '流式导出接口 + SSE', estimate_days: 5 },
      { role: '测试', task: '压测脚本与回归', estimate_days: 2 },
    ],
    source_insight_id: 'insight_export_slow',
  }),
  [CAPABILITY.GEN_ACCEPTANCE]: () => ({
    format: 'Given-When-Then',
    criteria: [
      { id: 'AC1', given: '用户点击导出且数据量 > 1w 行', when: '系统开始生成', then: '2s 内出现进度条', priority: 'P0' },
      { id: 'AC2', given: '导出进行中', when: '用户点击取消', then: '5s 内停止并释放资源', priority: 'P0' },
      { id: 'AC3', given: '导出失败', when: '系统重试', then: '自动重试 1 次后提示', priority: 'P1' },
      { id: 'AC4', given: '导出完成', when: '返回结果', then: 'P95 < 8s', priority: 'P0' },
    ],
    coverage: 1,
    source_prd_id: 'prd_export_async',
  }),
  [CAPABILITY.GEN_TRACKING]: () => ({
    events: [
      { name: 'export_start', trigger: '点击导出', properties: ['report_id', 'row_count'], purpose: '衡量触发量与数据规模' },
      { name: 'export_progress', trigger: '进度更新', properties: ['percent', 'stage'], purpose: '监控卡顿与中断' },
      { name: 'export_cancel', trigger: '点击取消', properties: ['percent_at_cancel'], purpose: '评估取消率' },
      { name: 'export_success', trigger: '完成', properties: ['duration_ms', 'row_count'], purpose: '计算 P95 与时长' },
    ],
    sampling: '全量',
    notes: '导出为低频高价值事件，建议全量上报。',
  }),
  [CAPABILITY.DECOMPOSE_TASKS]: () => ({
    tasks: [
      { role: '前端', task: '进度条 + 取消组件', estimate_days: 3, depends_on: [] },
      { role: '后端', task: '流式导出接口 + SSE 推送', estimate_days: 5, depends_on: [] },
      { role: '后端', task: '缓存与断点续传', estimate_days: 3, depends_on: ['流式导出接口'] },
      { role: '测试', task: '压测脚本 + 回归', estimate_days: 2, depends_on: ['流式导出接口'] },
    ],
    total_estimate_days: 13,
    critical_path: ['流式导出接口', '缓存与断点续传', '压测脚本'],
  }),
  [CAPABILITY.AI_SCORE]: () => ({
    score: 8.6,
    breakdown: { impact: 9.0, value: 8.5, evidence: 9.2, cost: 8.8 },
    rationale: '高影响、高证据强度、成本可控，优先级居首。',
    sources: ['fb_8821', 'fb_2043', 'metric_p95_118s'],
  }),
  [CAPABILITY.AI_REVIEW]: () => ({
    headline: 'v1.3 导出异步化核心目标全面达成',
    goal_achievement: { completed: 12, total: 14 },
    metric_deltas: [
      { name: '报表 P95', before: 40, after: 7.8, unit: 's', delta_pct: -80.5 },
      { name: '重复点击率', before: 1, after: 0.29, unit: 'ratio', delta_pct: -71 },
      { name: '相关主题负反馈', before: 1, after: 0.66, unit: 'ratio', delta_pct: -34 },
    ],
    hypothesis_validated: true,
    recommendations: ['将异步化复制至「批量操作」', '通知中心预加载缓存', '搜索语义重排巩固留存'],
  }),
  [CAPABILITY.AI_SUGGEST]: () => ({
    suggestions: [
      { title: '批量操作进度条', priority: 6.8, rationale: '复用导出异步化组件，预计再降 12% 重复操作', related_opportunity: '批量操作实时进度条' },
      { title: '通知中心预加载缓存', priority: 6.2, rationale: '降低首屏白屏，提升满意度', related_opportunity: '通知中心预加载缓存' },
      { title: '搜索语义重排', priority: 7.5, rationale: '承接正面情绪上升带来的新用户', related_opportunity: '搜索语义重排 + 相关性加权' },
    ],
    context_iteration: 'v1.3',
  }),
};

/* 确定性伪随机：同一种子产生同一序列，保证「同一次重新生成」结果可复现 */
function seededRand(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/* 确定性扰动：让“重新生成”产出可对比的差异版本（演示用；真实模型由采样温度自然产生差异）。
 * 只扰动数值字段，保持字符串/枚举不变，避免破坏 schema 校验。 */
function jitter(obj, seed) {
  if (seed == null) return obj;
  const rnd = seededRand(seed);
  const walk = (v) => {
    if (typeof v === 'number') {
      const f = 1 + (rnd() * 2 - 1) * 0.12;
      const out = v * f;
      return Math.abs(out) >= 100 ? Math.round(out) : Math.round(out * 100) / 100;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = walk(v[k]); return o; }
    return v;
  };
  return walk(obj);
}

async function mockModel(sysPrompt, ctx, opts) {
  if (FAIL_MODE === 'timeout') throw new Error('TIMEOUT');
  if (FAIL_MODE === 'badjson') return '模型本次未能结构化输出：\n导出太慢了用户都很烦，建议赶紧改。';
  // callModel 以 (sysPrompt, ctx, opts) 调用；capability 在 ctx 中
  const cap = (ctx && ctx.capability) || CAPABILITY.GENERATE_PRD;
  const gen = MOCK[cap] || (() => ({ note: 'ok' }));
  const seed = (ctx && ctx.context && ctx.context.constraints && ctx.context.constraints._seed) || Date.now();
  // 返回“原始字符串”，让 callModel 走 repairJson → validate 完整链路
  return JSON.stringify(jitter(gen(), seed));
}

/* ============================ 2. 多 Agent 追溯流 ============================
 * 与设计稿「洞察看板 · AI 分析过程」一致；任意能力复用同一协同结构。
 */
function agentFlow() {
  return [
    { name: '用户研究 Agent', desc: '聚类反馈、提炼主诉', status: 'done' },
    { name: '数据分析 Agent', desc: '量化影响与趋势', status: 'done' },
    { name: '产品策略 Agent', desc: '评估优先级与机会', status: 'progress' },
    { name: '技术评估 Agent', desc: '评估可行性方案', status: 'wait' },
    { name: '协调 Agent', desc: '汇总结论并生成草案', status: 'done' },
  ];
}

/* ============================ 3. 三层展示法：状态管理 ============================ */
const activities = []; // {ts, cap, status, requestId}
let drawerCap = null;
const capTarget = {};   // capability -> 目标选择器，供“采纳版本”使用
const humanState = {};  // cap -> { adopted: bool, feedback: 'up'|'down'|null } 人工确认/反馈
const resultBars = {};  // cap -> 结果操作条 DOM（采纳/点赞点踩/版本对比）

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function fmtTime(d = new Date()) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* --- ① 内联状态徽标（贴在 AI 触发元素右侧）--- */
function ensureStatusBadge(trigger) {
  let badge = trigger.parentElement.querySelector(':scope > .ai-status');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'ai-status';
    trigger.insertAdjacentElement('afterend', badge);
  }
  return badge;
}
function setInlineStatus(cap, state, text) {
  const trigger = $(`[data-ai-cap="${cap}"]`);
  if (!trigger) return;
  const badge = ensureStatusBadge(trigger);
  badge.className = `ai-status ai-status--${state}`;
  badge.textContent = text;
}

/* --- ③ 顶栏活动日志 --- */
function pushActivity(cap, status, requestId) {
  activities.unshift({ ts: new Date(), cap, status, requestId });
  renderActivity();
}
function renderActivity() {
  const panel = $('#activity-list');
  if (!panel) return;
  if (!activities.length) {
    panel.innerHTML = '<div class="activity-empty">暂无 AI 活动</div>';
    $('#activity-count') && ($('#activity-count').style.display = 'none');
    return;
  }
  $('#activity-count') && ($('#activity-count').style.display = 'inline-flex');
  $('#activity-count') && ($('#activity-count').textContent = activities.length);
  panel.innerHTML = activities.map(a => {
    const st = a.status === 'success' ? ['done', '已生成']
      : a.status === 'partial' ? ['partial', '部分生成']
      : a.status === 'failed' ? ['failed', '生成失败']
      : a.status === 'adopted' ? ['adopted', '已采纳']
      : a.status === 'unadopted' ? ['', '已取消采纳']
      : a.status === 'feedback_up' ? ['up', '👍 点赞']
      : a.status === 'feedback_down' ? ['down', '👎 反馈']
      : a.status === 'feedback_none' ? ['', '已取消反馈']
      : a.status === 'edited' ? ['edited', '已修改']
      : ['', a.status];
    const retry = a.status === 'failed'
      ? `<button class="activity-retry" data-retry="${a.cap}">重试</button>` : '';
    return `<div class="activity-item" data-cap="${a.cap}">
      <div class="activity-main">
        <span class="activity-name">${LABELS[a.cap] || a.cap}</span>
        <span class="activity-pill ${st[0]}">${st[1]}</span>
      </div>
      <div class="activity-sub">${fmtTime(a.ts)} · ${a.requestId}${retry}</div>
    </div>`;
  }).join('');
  $$('.activity-item').forEach(it => it.addEventListener('click', (e) => {
    if (e.target.dataset.retry) return;
    openDrawer(it.dataset.cap);
  }));
  $$('.activity-retry').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    runAI(b.dataset.retry);
  }));
}

/* --- ② Agent 追溯抽屉 --- */
function openDrawer(cap) {
  drawerCap = cap;
  const drawer = $('#agent-drawer');
  if (!drawer) return;
  drawer.classList.add('open');
  $('#agent-drawer-title').textContent = `${LABELS[cap] || cap} · 多智能体追溯`;
  const flow = agentFlow();
  $('#agent-drawer-body').innerHTML = flow.map(a => {
    const s = a.status === 'done' ? 'done' : a.status === 'progress' ? 'progress' : 'wait';
    const stxt = a.status === 'done' ? '已完成' : a.status === 'progress' ? '进行中' : '排队中';
    return `<div class="agent-card">
      <div class="agent-card-left">
        <div class="agent-icon">${a.name[0]}</div>
        <div class="agent-info"><span class="agent-name">${a.name}</span><span class="agent-desc">${a.desc}</span></div>
      </div>
      <span class="agent-status ${s}"><span>●</span> ${stxt}</span>
    </div>`;
  }).join('');
  $('#agent-drawer-error').style.display = 'none';
}
function closeDrawer() { $('#agent-drawer') && $('#agent-drawer').classList.remove('open'); }

function showDrawerError(message) {
  const el = $('#agent-drawer-error');
  if (!el) return;
  el.style.display = 'flex';
  el.querySelector('.agent-error-text').textContent = message;
}

/* --- Toast --- */
function toast(text, type = 'info') {
  const box = $('#toast-container');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = text;
  box.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

/* ============================ 4. 结果渲染 ============================ */
function renderResult(cap, result, targetSel) {
  const data = result.data || {};
  const target = targetSel ? $(targetSel) : null;

  // 机会工作区 4 个按钮：写入/追加到 PRD 编辑器
  if (cap === CAPABILITY.GENERATE_PRD && target) {
    target.value = `# 问题定义\n${data.problem}\n\n# 用户故事\n${data.user_story}\n\n# 方案概述\n${data.solution}\n\n# 范围\n${data.scope}\n\n# 验收标准\n${data.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n# 埋点方案\n${data.tracking_plan.map(e => `- ${e}`).join('\n')}\n\n# 任务拆解\n${data.task_breakdown.map(t => `- [${t.role}] ${t.task} · 预估 ${t.estimate_days}d`).join('\n')}`;
  } else if (cap === CAPABILITY.GEN_ACCEPTANCE && target) {
    const block = `\n\n# 验收标准（AI 生成 · ${data.format}）\n` +
      data.criteria.map(c => `- [${c.id}] ${c.given} → 当${c.when} → 则${c.then}（${c.priority}）`).join('\n');
    target.value += block;
  } else if (cap === CAPABILITY.GEN_TRACKING && target) {
    const block = `\n\n# 埋点方案（AI 生成 · ${data.sampling}）\n` +
      data.events.map(e => `- ${e.name}：触发[${e.trigger}] 属性[${e.properties.join(', ')}] 目的：${e.purpose}`).join('\n');
    target.value += block;
  } else if (cap === CAPABILITY.DECOMPOSE_TASKS && target) {
    const block = `\n\n# 任务拆解（AI 生成 · 共 ${data.total_estimate_days}d）\n` +
      data.tasks.map(t => `- [${t.role}] ${t.task} · 预估 ${t.estimate_days}d` + (t.depends_on.length ? ` · 依赖 ${t.depends_on.join(',')}` : '')).join('\n');
    target.value += block;
  } else if (cap === CAPABILITY.AI_REVIEW && target) {
    target.removeAttribute('data-manually-edited');
    target.innerHTML = `<b>${data.headline}</b>　目标达成 ${data.goal_achievement.completed}/${data.goal_achievement.total}　假设验证：${data.hypothesis_validated ? '成立' : '未成立'}<br>` +
      '指标变化：' + data.metric_deltas.map(m => `${m.name} ${m.before}${m.unit}→${m.after}${m.unit}（${m.delta_pct > 0 ? '+' : ''}${m.delta_pct}%）`).join('；') +
      '<br>建议：' + data.recommendations.map(r => `① ${r}`).join('；');
  } else if (cap === CAPABILITY.AI_SUGGEST && target) {
    target.removeAttribute('data-manually-edited');
    target.innerHTML = data.suggestions.map((s, i) =>
      `${'①②③'[i] || (i + 1)} ${s.title}（优先级 ${s.priority}）：${s.rationale}　[关联：${s.related_opportunity}]`).join('<br>');
  }
}

/* ============================ 5. 统一触发入口 ============================ */
async function runAI(cap, opts = {}) {
  const trigger = $(`[data-ai-cap="${cap}"]`);
  const targetSel = trigger && trigger.dataset.aiTarget;
  const mode = trigger && trigger.dataset.aiMode; // log | panel | textarea
  if (targetSel) capTarget[cap] = targetSel;       // 记录目标，供“采纳版本”使用
  drawerCap = cap;

  const seed = opts.seed || Date.now();

  // 按钮 loading 态
  if (trigger && trigger.tagName === 'BUTTON') {
    trigger.disabled = true;
    trigger.dataset.label = trigger.textContent;
    trigger.textContent = '生成中…';
  }
  setInlineStatus(cap, 'loading', '生成中');
  toast(`正在${LABELS[cap] || cap}…`);

  const params = {
    artifacts: [{ insight: cap, sample: 'mock-artifact' }],
    userInstruction: opts.instruction || '',
    constraints: { tone: '专业', detail: '高', _seed: seed },
    history: [],
  };

  try {
    const result = await regenerate(cap, params, {
      requestModel: mockModel,
      fallbackModel: mockModel,
      key: cap,
      variationSeed: seed,
      adjustConstraints: opts.adjust || {},
    });

    // 渲染结果
    if (result.status !== 'failed' && targetSel) renderResult(cap, result, targetSel);
    if (cap === CAPABILITY.BATCH_ANALYZE && result.status !== 'failed') {
      toast('分析完成 · 聚类出 6 个主题，已跳转洞察看板', 'success');
      const insightsTab = $('.tab[data-page="insights"]');
      insightsTab && insightsTab.click();
      openDrawer(cap);
    }

    // 内联状态
    if (result.status === 'success') setInlineStatus(cap, 'success', '已生成');
    else if (result.status === 'partial') setInlineStatus(cap, 'partial', '部分生成');
    else setInlineStatus(cap, 'failed', '生成失败');

    // 活动日志 + 抽屉
    pushActivity(cap, result.status, result.request_id);
    if (drawerCap === cap) {
      if (result.status === 'failed') showDrawerError(result.error?.message || '生成失败');
      else $('#agent-drawer-error').style.display = 'none';
    }

    // 生成成功后露出“结果操作条”（采纳 / 点赞点踩 / 版本对比）
    if (result.status !== 'failed') ensureResultBar(cap);

    if (result.status === 'failed') {
      toast(result.error?.message || '生成失败，可重试', 'error');
    } else {
      toast(`${LABELS[cap] || cap}完成`, 'success');
    }
  } catch (err) {
    setInlineStatus(cap, 'failed', '生成失败');
    pushActivity(cap, 'failed', 'err');
    toast('生成异常：' + (err.message || err), 'error');
  } finally {
    if (trigger && trigger.tagName === 'BUTTON') {
      trigger.disabled = false;
      trigger.textContent = trigger.dataset.label || trigger.textContent;
    }
  }
}

/* ============================ 5.5 生成内容版本对比（亮点功能） ============================
 * 每个 AI 能力在 regenerate 时都会留存带 seed 的版本（ai-contract.historyStore）。
 * 这里把它们接出来：列表 / 单版本预览 / 双版本对比 / 采纳最优，体现“AI 重生 + 人在回路”。
 */

/* 把版本数据格式化为纯文本，用于对比预览（<pre>）与“采纳”回填 */
function formatVersionText(cap, d) {
  if (!d) return '（无内容）';
  if (cap === CAPABILITY.GENERATE_PRD)
    return `# 问题定义\n${d.problem}\n\n# 用户故事\n${d.user_story}\n\n# 方案概述\n${d.solution}\n\n# 范围\n${d.scope}\n\n# 验收标准\n${d.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n# 埋点方案\n${d.tracking_plan.map(e => `- ${e}`).join('\n')}\n\n# 任务拆解\n${d.task_breakdown.map(t => `- [${t.role}] ${t.task} · 预估 ${t.estimate_days}d`).join('\n')}`;
  if (cap === CAPABILITY.GEN_ACCEPTANCE)
    return `# 验收标准（${d.format}）\n` + d.criteria.map(c => `- [${c.id}] ${c.given} → 当${c.when} → 则${c.then}（${c.priority}）`).join('\n');
  if (cap === CAPABILITY.GEN_TRACKING)
    return `# 埋点方案（${d.sampling}）\n` + d.events.map(e => `- ${e.name}：触发[${e.trigger}] 属性[${e.properties.join(', ')}] 目的：${e.purpose}`).join('\n');
  if (cap === CAPABILITY.DECOMPOSE_TASKS)
    return `# 任务拆解（共 ${d.total_estimate_days}d）\n` + d.tasks.map(t => `- [${t.role}] ${t.task} · 预估 ${t.estimate_days}d` + (t.depends_on && t.depends_on.length ? ` · 依赖 ${t.depends_on.join(',')}` : '')).join('\n');
  if (cap === CAPABILITY.AI_REVIEW)
    return `${d.headline}\n目标达成 ${d.goal_achievement.completed}/${d.goal_achievement.total}　假设验证：${d.hypothesis_validated ? '成立' : '未成立'}\n指标变化：` + d.metric_deltas.map(m => `${m.name} ${m.before}${m.unit}→${m.after}${m.unit}（${m.delta_pct > 0 ? '+' : ''}${m.delta_pct}%）`).join('；') + `\n建议：` + d.recommendations.map(r => `① ${r}`).join('；');
  if (cap === CAPABILITY.AI_SUGGEST)
    return d.suggestions.map((s, i) => `${'①②③'[i] || (i + 1)} ${s.title}（优先级 ${s.priority}）：${s.rationale}　[关联：${s.related_opportunity}]`).join('\n');
  if (cap === CAPABILITY.AI_SCORE)
    return `评分 ${d.score}（影响 ${d.breakdown.impact} / 价值 ${d.breakdown.value} / 证据 ${d.breakdown.evidence} / 成本 ${d.breakdown.cost}）\n${d.rationale}\n证据：${d.sources.join(', ')}`;
  if (cap === CAPABILITY.BATCH_ANALYZE)
    return `摘要：${d.summary}\n主题：\n` + d.themes.map(t => `- ${t.name}（${t.count} 条 · ${t.severity} · ${t.sentiment}）证据：${(t.evidence_ids || []).join(',')}`).join('\n') + `\n机会建议：` + (d.suggested_opportunities || []).map(o => `- ${o.title}（优先级 ${o.priority}）${o.rationale}`).join('\n');
  return JSON.stringify(d, null, 2);
}

/* ============================ 5.6 结果操作条：人工确认 / 点赞点踩 / 版本对比 ============================
 * 每个 AI 能力生成结果后，在触发按钮旁出现一条操作条：
 *   - 采纳：人工确认该结果为最终版（点亮“已采纳”，写入活动日志）——“人在回路”签核
 *   - 👍 / 👎：对结果质量反馈，回写活动日志，支撑“采纳率/人工修改率”健康指标
 *   - 版本对比：打开既有版本对比弹窗（5.5）
 * 状态按 cap 持久在 humanState，操作条重渲染不丢失。
 */
function ensureResultBar(cap) {
  const trigger = $(`[data-ai-cap="${cap}"]`);
  if (!trigger) return;
  let bar = resultBars[cap];
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'ai-result-bar';
    trigger.insertAdjacentElement('afterend', bar);
    resultBars[cap] = bar;
  }
  const st = humanState[cap] || (humanState[cap] = {});
  bar.innerHTML = `
    <span class="rb-tip">对此结果：</span>
    <button type="button" class="rb-btn rb-adopt ${st.adopted ? 'on' : ''}">${st.adopted ? '✓ 已采纳' : '采纳'}</button>
    <span class="rb-sep"></span>
    <button type="button" class="rb-btn rb-up ${st.feedback === 'up' ? 'on' : ''}" title="有用">👍</button>
    <button type="button" class="rb-btn rb-down ${st.feedback === 'down' ? 'on' : ''}" title="没用">👎</button>
    <span class="rb-sep"></span>
    <button type="button" class="rb-btn rb-ver">版本对比 (${getHistory(cap).length})</button>`;
  bar.querySelector('.rb-adopt').onclick = () => toggleAdopt(cap);
  bar.querySelector('.rb-up').onclick = () => toggleFeedback(cap, 'up');
  bar.querySelector('.rb-down').onclick = () => toggleFeedback(cap, 'down');
  bar.querySelector('.rb-ver').onclick = () => openVersionModal(cap);
  return bar;
}

/* 人工确认 / 取消确认 */
function toggleAdopt(cap) {
  const st = humanState[cap] || (humanState[cap] = {});
  st.adopted = !st.adopted;
  const bar = resultBars[cap];
  if (bar) {
    const b = bar.querySelector('.rb-adopt');
    b.classList.toggle('on', st.adopted);
    b.textContent = st.adopted ? '✓ 已采纳' : '采纳';
  }
  if (st.adopted) setInlineStatus(cap, 'adopted', '已采纳');
  else setInlineStatus(cap, getHistory(cap).length ? 'success' : 'idle', getHistory(cap).length ? '已生成' : '待生成');
  pushActivity(cap, st.adopted ? 'adopted' : 'unadopted', '人工');
  toast(st.adopted ? `已确认采纳「${LABELS[cap] || cap}」` : '已取消采纳', 'success');
}

/* 点赞 / 点踩（再次点击取消） */
function toggleFeedback(cap, dir) {
  const st = humanState[cap] || (humanState[cap] = {});
  st.feedback = st.feedback === dir ? null : dir;
  const bar = resultBars[cap];
  if (bar) {
    bar.querySelector('.rb-up').classList.toggle('on', st.feedback === 'up');
    bar.querySelector('.rb-down').classList.toggle('on', st.feedback === 'down');
  }
  const a = st.feedback === 'up' ? 'feedback_up' : st.feedback === 'down' ? 'feedback_down' : 'feedback_none';
  pushActivity(cap, a, '人工');
  toast(st.feedback === 'up' ? '已点赞，感谢反馈' : st.feedback === 'down' ? '已反馈「没用」，将用于优化' : '已取消反馈', 'info');
}

let verState = { cap: null, mode: 'single', selA: 0, selB: 1 };

function openVersionModal(cap) {
  const hist = getHistory(cap);
  verState = { cap, mode: 'single', selA: Math.max(0, hist.length - 1), selB: Math.max(0, hist.length - 2) };
  const modal = $('#version-modal');
  if (!modal) return;
  modal.classList.add('open', 'mode-single');
  modal.classList.remove('mode-compare');
  $$('.seg-btn').forEach(x => x.classList.toggle('active', x.dataset.mode === 'single'));
  renderVersionList();
}

function closeVersionModal() { const m = $('#version-modal'); if (m) m.classList.remove('open'); }

function renderVersionList() {
  const cap = verState.cap;
  const hist = getHistory(cap);
  const listEl = $('#ver-list');
  if (!listEl) return;
  if (!hist.length) {
    listEl.innerHTML = '<div class="activity-empty">暂无版本，先点击 AI 生成 / 重新生成</div>';
    renderPreview();
    return;
  }
  listEl.innerHTML = hist.map((v, i) => {
    const no = hist.length - i;
    const active = verState.mode === 'single' && verState.selA === i;
    const st = v.status === 'success' ? ['done', '已生成'] : v.status === 'partial' ? ['partial', '部分'] : ['failed', '失败'];
    return `<div class="ver-item ${active ? 'active' : ''}" data-i="${i}">
      <div class="ver-item-main"><span class="ver-no">v${no}</span>
        <span class="ver-meta">seed #${String(v.seed || '').slice(-4)} · ${fmtTime(new Date(v.ts))}</span></div>
      <span class="activity-pill ${st[0]}">${st[1]}</span>
    </div>`;
  }).join('');
  $$('#ver-list .ver-item').forEach(el => el.addEventListener('click', () => {
    verState.selA = +el.dataset.i;
    renderVersionList();
  }));
  renderPreview();
}

function fillCompareSelects() {
  const hist = getHistory(verState.cap);
  const optsHtml = hist.map((v, i) => `<option value="${i}">v${hist.length - i} · seed #${String(v.seed || '').slice(-4)}</option>`).join('');
  const sa = $('#ver-sel-a'), sb = $('#ver-sel-b');
  if (sa) { sa.innerHTML = optsHtml; sa.value = String(verState.selA); }
  if (sb) { sb.innerHTML = optsHtml; sb.value = String(verState.selB); }
}

function renderPreview() {
  const cap = verState.cap;
  const hist = getHistory(cap);
  const a = hist[verState.selA];
  const pa = $('#ver-preview-a');
  if (pa && a) pa.textContent = formatVersionText(cap, a.data);
  const labelA = $('#ver-a-label'); if (labelA && a) labelA.textContent = `v${hist.length - verState.selA}`;
  if (verState.mode === 'compare') {
    const b = hist[verState.selB];
    const pb = $('#ver-preview-b');
    if (pb) pb.textContent = b ? formatVersionText(cap, b.data) : '';
    const labelB = $('#ver-b-label'); if (labelB && b) labelB.textContent = `v${hist.length - verState.selB}`;
  }
  const adopt = $('#ver-adopt');
  if (adopt) adopt.disabled = !a || verState.mode === 'compare';
}

function adoptVersion() {
  const cap = verState.cap;
  const hist = getHistory(cap);
  const v = hist[verState.selA];
  if (!v) return;
  const targetSel = capTarget[cap];
  const target = targetSel ? $(targetSel) : null;
  if (target) {
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      target.value = formatVersionText(cap, v.data);
    } else {
      renderResult(cap, { data: v.data }, targetSel); // 面板类复用渲染
    }
    toast(`已采纳 v${hist.length - verState.selA}`, 'success');
  } else {
    toast('该能力无编辑区，仅可查看对比', 'info');
  }
  // 联动“人工确认”：版本对比里的采纳即视为对该能力结果的最终确认
  const st = humanState[cap] || (humanState[cap] = {});
  if (!st.adopted) {
    st.adopted = true;
    const bar = resultBars[cap];
    if (bar) { const b = bar.querySelector('.rb-adopt'); b.classList.add('on'); b.textContent = '✓ 已采纳'; }
    setInlineStatus(cap, 'adopted', '已采纳');
    pushActivity(cap, 'adopted', '人工');
  }
  closeVersionModal();
}

/* ============================ 5.7 双击编辑：让 AI 结论 / 复盘面板可被人工修正 ============================
 * 闭合 UX 审计项「用户能否修改错误结果」。双击进入编辑、失焦保存，
 * 自动标注「已人工修改」并写入活动日志。AI 重新生成时会在 renderResult 重置为未编辑态。
 */
function initInlineEdit() {
  $$('[data-editable]').forEach(el => {
    const cap = el.dataset.editCap;
    el.addEventListener('dblclick', () => enterEdit(el, cap));
    el.addEventListener('focusout', () => exitEdit(el, cap));
    // 粘贴时转为纯文本，避免富文本污染面板内容
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  });
}

function enterEdit(el, cap) {
  if (el.isContentEditable) return;
  el.dataset.original = el.innerHTML;
  el.contentEditable = 'true';
  el.classList.add('editing');
  el.focus();
  // 光标置于末尾
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function exitEdit(el, cap) {
  if (!el.isContentEditable) return;
  el.contentEditable = 'false';
  el.classList.remove('editing');
  if (el.innerHTML !== el.dataset.original) {
    el.dataset.manuallyEdited = '1';
    pushActivity(cap, 'edited', '人工');
    toast('已保存人工修改', 'success');
  } else {
    delete el.dataset.manuallyEdited;
  }
}

/* ============================ 6. 初始化绑定 ============================ */
function init() {
  // 绑定所有 [data-ai-cap] 触发元素
  $$('[data-ai-cap]').forEach(btn => {
    btn.addEventListener('click', () => runAI(btn.dataset.aiCap));
  });

  // 绑定「查看 Agent 追溯」类按钮（仅打开抽屉，不重新调用）
  $$('[data-ai-drawer]').forEach(b => {
    b.addEventListener('click', () => openDrawer(b.dataset.aiDrawer));
  });

  // 顶栏活动铃铛开关
  const bell = $('#activity-bell');
  bell && bell.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#activity-panel').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    const p = $('#activity-panel'); p && p.classList.remove('open');
  });
  $('#activity-panel') && $('#activity-panel').addEventListener('click', (e) => e.stopPropagation());

  // 抽屉关闭
  $('#agent-drawer-close') && $('#agent-drawer-close').addEventListener('click', closeDrawer);
  // 抽屉内重新生成
  $('#agent-drawer-regen') && $('#agent-drawer-regen').addEventListener('click', () => {
    if (drawerCap) runAI(drawerCap, { seed: Date.now() });
  });
  // 抽屉内失败重试
  $('#agent-drawer-retry') && $('#agent-drawer-retry').addEventListener('click', () => {
    $('#agent-drawer-error').style.display = 'none';
    if (drawerCap) runAI(drawerCap);
  });
  // 抽屉内「版本对比」入口
  $('#agent-drawer-versions') && $('#agent-drawer-versions').addEventListener('click', () => {
    if (drawerCap) openVersionModal(drawerCap);
  });

  /* ── 版本对比弹窗控制 ── */
  $('#ver-close') && $('#ver-close').addEventListener('click', closeVersionModal);
  $('#ver-close-2') && $('#ver-close-2').addEventListener('click', closeVersionModal);
  $('#ver-adopt') && $('#ver-adopt').addEventListener('click', adoptVersion);
  $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    const modal = $('#version-modal');
    modal.classList.toggle('mode-single', m === 'single');
    modal.classList.toggle('mode-compare', m === 'compare');
    $$('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
    verState.mode = m;
    if (m === 'compare') fillCompareSelects();
    const adopt = $('#ver-adopt'); if (adopt) adopt.disabled = (m === 'compare');
    renderPreview();
  }));
  const sa = $('#ver-sel-a'); sa && sa.addEventListener('change', e => { verState.selA = +e.target.value; renderPreview(); });
  const sb = $('#ver-sel-b'); sb && sb.addEventListener('change', e => { verState.selB = +e.target.value; renderPreview(); });

  // 模拟异常下拉
  const failSel = $('#fail-mode');
  failSel && failSel.addEventListener('change', () => { FAIL_MODE = failSel.value; });

  renderActivity();
  initInlineEdit();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { runAI, openDrawer, pushActivity };
