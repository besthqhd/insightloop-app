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

import { CAPABILITY, callModel, regenerate, getHistory, useRealModel, callRealModel } from './ai-contract.js?v=1.9';

/* ============================ 能力中文标签 ============================ */
const LABELS = {
  [CAPABILITY.BATCH_ANALYZE]: '批量 AI 分析',
  [CAPABILITY.ANALYZE_FEEDBACK]: '反馈 AI 分析',
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
  /* 单条反馈 PM 视角分类：原型阶段不接真实模型，按「能判断才填、不能判断一律待确认」演示 */
  [CAPABILITY.ANALYZE_FEEDBACK]: (ctx) => {
    const txt = (ctx && ctx.context && ctx.context.artifacts && ctx.context.artifacts[0] && ctx.context.artifacts[0].feedback_text) || '';
    const ref = (ctx && ctx.context && ctx.context.constraints && ctx.context.constraints.reference_date) || new Date().toISOString().slice(0, 10);

    // 攻击性 / 客诉风险
    const angry = /(垃圾|太差|愤怒|投诉|退款|骗|傻|滚|起诉|威胁|弃用|拉黑|再也不|曝光|投诉电话|消协|315|垃圾软件|坑钱)/i.test(txt);
    const neg = /(慢|崩溃|卡|报错|失败|烦|差|bug|错误|无法|不能|打不开|超时|等不及|白屏|转好几秒|反复重试)/i.test(txt);
    const emotion = angry ? 'angry' : neg ? 'negative' : (txt ? 'neutral' : '待确认');
    const risk_flag = angry ? 'escalate' : 'none';

    // 时间还原：相对时间 -> 绝对日期（结合 reference_date）
    const fbTime = normFeedbackTime(txt, ref);

    // 多意图拆分：按方面命中多个组 -> 拆成 sub_intents
    const sub = extractSubIntents(txt);

    // 把握度：攻击性 / 无内容 / 无明显方面 -> low；命中方面且有时间 -> high；否则 medium
    let confidence = 'low';
    if (txt && sub.length >= 1) confidence = fbTime !== '待确认' ? 'high' : 'medium';
    if (angry) confidence = 'low';

    const pending = [];
    if (!/导出|搜索|登录|通知|深色|批量|报表|下载|查找|红点|消息|对比度|护眼|删除|进度/.test(txt)) pending.push('问题来源');
    pending.push('用户类型');

    return {
      problem_source: sub.length >= 1 ? sub[0].problem_source : '待确认',
      user_type: '待确认',
      user_emotion: emotion,
      feedback_time: fbTime,
      feedback_content: txt.slice(0, 90) || '（空反馈）',
      confidence,
      notes: '原型 mock：未接入真实模型；' + pending.join('、') + ' 常规标为「待确认」。' +
        (sub.length >= 2 ? `检测到 ${sub.length} 个意图，已在 sub_intents 拆分。` : '') +
        (risk_flag === 'escalate' ? ' 命中攻击性/客诉风险，已置 risk_flag=escalate。' : ''),
      sub_intents: sub,
      risk_flag,
    };
  },
};

/* 相对时间 -> 绝对日期（结合 reference_date）。用本地日期分量计算，避免 UTC 时区导致的差一天 */
function normFeedbackTime(txt, ref) {
  const base = new Date(ref + 'T00:00:00');
  if (isNaN(base.getTime())) return '待确认';
  const sub = (days) => {
    const d = new Date(base);
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  if (/(前天)/.test(txt)) return sub(2);
  if (/(昨天|昨日)/.test(txt)) return sub(1);
  if (/(今天|今日)/.test(txt)) return ref;
  if (/(上周|一个星期前|一周前)/.test(txt)) return sub(7);
  let m = txt.match(/(\d+)\s*天前/); if (m) return sub(parseInt(m[1], 10));
  m = txt.match(/(\d+)\s*周前/); if (m) return sub(parseInt(m[1], 10) * 7);
  m = txt.match(/(\d+)\s*个月前|(\d+)\s*月前/); if (m) return sub(parseInt(m[1], 10) * 30);
  if (/(上个月|上月)/.test(txt)) return sub(30);
  if (/(月初|月底|3月|最近|周一|早上|晚上)/.test(txt)) return '待确认';
  return '待确认';
}

/* 多意图拆分：按方面命中多个组 */
function extractSubIntents(txt) {
  const ASPECTS = [
    { key: '导出/报表', re: /导出|报表|下载|超时失败|等.*分钟|数据量大/ },
    { key: '搜索', re: /搜索|查找|结果不准确|不相关|混进/ },
    { key: '登录', re: /登录|注册|网络错误|重试.*成功|提示.*错误/ },
    { key: '通知', re: /通知|红点|消息|漏看|转好几秒/ },
    { key: '深色模式', re: /深色|对比度|护眼|颜色|文字看不清/ },
    { key: '批量操作', re: /批量|删除|进度提示|卡死/ },
  ];
  const matched = ASPECTS.filter(a => a.re.test(txt));
  if (matched.length < 2) return [];
  return matched.map(a => ({
    aspect: a.key,
    problem_source: a.key,
    feedback_content: txt.length > 60 ? `（涉及「${a.key}」的诉求，详见原反馈）` : txt,
  }));
}

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
const inFlight = new Set(); // 防重复提交：同一能力正在请求时忽略再次点击
let drawerCap = null;
const capTarget = {};   // capability -> 目标选择器，供“采纳版本”使用
const humanState = {};  // cap -> { adopted: bool, feedback: 'up'|'down'|null } 人工确认/反馈
const resultBars = {};  // cap -> 结果操作条 DOM（采纳/点赞点踩/版本对比）
const editsState = {};  // cap -> 人工修改后的面板 HTML（双击编辑持久化）

/* ====================== 本地持久化（刷新不丢） ======================
 * 把「人工确认/反馈 + 双击编辑内容 + 活动日志」存进 localStorage，
 * 刷新或重开页面后原样还原，让 demo 呈现真实工作台的连续性。
 * 与 AI 密钥（insightloop_ai_config）互不干扰，也不进仓库。
 */
const STATE_PERSIST_KEY = 'insightloop_human_v1';

function persistLocalState() {
  try {
    localStorage.setItem(STATE_PERSIST_KEY, JSON.stringify({
      human: humanState,
      edits: editsState,
      activities: activities.map(a => ({ ts: a.ts, cap: a.cap, status: a.status, requestId: a.requestId })),
    }));
  } catch { /* 配额/隐私模式静默失败 */ }
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STATE_PERSIST_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj.human) Object.assign(humanState, obj.human);
    if (obj.edits) Object.assign(editsState, obj.edits);
    if (Array.isArray(obj.activities)) {
      activities.length = 0;
      obj.activities.forEach(a => activities.push({
        ts: a.ts ? new Date(a.ts) : new Date(),
        cap: a.cap, status: a.status, requestId: a.requestId,
      }));
    }
  } catch { /* 损坏数据忽略 */ }
}

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
function setInlineStatus(cap, state, text, triggerEl) {
  const trigger = triggerEl || $(`[data-ai-cap="${cap}"]`);
  if (!trigger) return;
  const badge = ensureStatusBadge(trigger);
  badge.className = `ai-status ai-status--${state}`;
  badge.textContent = text;
}

/* --- ③ 顶栏活动日志 --- */
function pushActivity(cap, status, requestId) {
  activities.unshift({ ts: new Date(), cap, status, requestId });
  renderActivity();
  persistLocalState();
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

  // AI 重新生成 / 采纳版本会覆盖面板内容，旧的人工编辑缓存作废，避免刷新后错盖
  if (editsState[cap]) { delete editsState[cap]; persistLocalState(); }

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
    const ga = data.goal_achievement || {};
    const headline = data.headline || 'AI 复盘结论';
    const completed = ga.completed != null ? ga.completed : '?';
    const total = ga.total != null ? ga.total : '?';
    const deltas = Array.isArray(data.metric_deltas) ? data.metric_deltas : [];
    const recs = Array.isArray(data.recommendations) ? data.recommendations : [];
    target.innerHTML = '<b>' + headline + '</b>　目标达成 ' + completed + '/' + total + '　假设验证：' + (data.hypothesis_validated ? '成立' : '未成立') + '<br>' +
      '指标变化：' + deltas.map(m => (m.name || '') + ' ' + (m.before != null ? m.before : '?') + (m.unit || '') + '→' + (m.after != null ? m.after : '?') + (m.unit || '') + '（' + (m.delta_pct > 0 ? '+' : '') + (m.delta_pct != null ? m.delta_pct : '?') + '%）').join('；') +
      '<br>建议：' + recs.map(r => '① ' + r).join('；');
  } else if (cap === CAPABILITY.AI_SUGGEST && target) {
    target.removeAttribute('data-manually-edited');
    const sugs = Array.isArray(data.suggestions) ? data.suggestions : [];
    target.innerHTML = sugs.map((s, i) =>
      ('①②③'[i] || (i + 1)) + ' ' + (s.title || '') + '（优先级 ' + (s.priority != null ? s.priority : '?') + '）：' + (s.rationale || '') + '　[关联：' + (s.related_opportunity || '') + ']').join('<br>');
  }
}

/* ============================ 5. 统一触发入口 ============================ */
async function runAI(cap, opts = {}) {
  // 防重复提交：同一能力正在生成时，忽略本次点击，避免并发请求与重复提交
  if (inFlight.has(cap)) {
    toast(`「${LABELS[cap] || cap}」正在生成中，请稍候…`, 'info');
    return;
  }
  const triggerEl = opts.trigger || $(`[data-ai-cap="${cap}"]`);
  const targetSel = triggerEl && triggerEl.dataset.aiTarget;
  const mode = triggerEl && triggerEl.dataset.aiMode; // log | panel | textarea
  if (targetSel) capTarget[cap] = targetSel;       // 记录目标，供“采纳版本”使用
  drawerCap = cap;

  const seed = opts.seed || Date.now();

  // 按钮 loading 态
  if (triggerEl && triggerEl.tagName === 'BUTTON') {
    triggerEl.disabled = true;
    triggerEl.dataset.label = triggerEl.textContent;
    triggerEl.textContent = '生成中…';
  }
  setInlineStatus(cap, 'loading', '生成中', triggerEl);
  toast(`正在${LABELS[cap] || cap}…`);

  // 单条反馈分析：把该条反馈原文作为强类型上下文传入，模型据此抽取
  let artifacts = [{ insight: cap, sample: 'mock-artifact' }];
  const extraConstraints = { tone: '专业', detail: '高', _seed: seed };
  if (cap === CAPABILITY.ANALYZE_FEEDBACK) {
    const card = triggerEl && triggerEl.closest('.feedback-card');
    const quote = card ? (card.querySelector('.feedback-quote')?.textContent || '') : '';
    artifacts = [{ feedback_text: quote }];
    // 时间还原需要“今天”锚点：把当前日期作为 reference_date 注入上下文
    extraConstraints.reference_date = todayISO();
  }

  const params = {
    artifacts,
    userInstruction: opts.instruction || '',
    constraints: extraConstraints,
    history: [],
  };

  const forceFail = FAIL_MODE && String(FAIL_MODE) !== '0';
  const modelFn = forceFail ? mockModel : (useRealModel() ? callRealModel : mockModel);
  inFlight.add(cap);
  try {
    const result = await regenerate(cap, params, {
      requestModel: modelFn,
      fallbackModel: modelFn,
      key: cap,
      variationSeed: seed,
      adjustConstraints: opts.adjust || {},
    });

    // 渲染结果
    if (result.status !== 'failed' && targetSel) renderResult(cap, result, targetSel);
    if (cap === CAPABILITY.ANALYZE_FEEDBACK) {
      renderFeedbackAnalysis(result, triggerEl);
    } else if (cap === CAPABILITY.BATCH_ANALYZE && result.status !== 'failed') {
      toast('分析完成 · 聚类出 6 个主题，已跳转洞察看板', 'success');
      const insightsTab = $('.tab[data-page="insights"]');
      insightsTab && insightsTab.click();
      openDrawer(cap);
    }

    // 内联状态
    if (result.status === 'success') setInlineStatus(cap, 'success', '已生成', triggerEl);
    else if (result.status === 'partial') setInlineStatus(cap, 'partial', '部分生成', triggerEl);
    else setInlineStatus(cap, 'failed', '生成失败', triggerEl);

    // 活动日志 + 抽屉
    if (result.status === 'failed') openDrawer(cap); // 演示：失败也展开追溯抽屉并展示错误兜底
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
    setInlineStatus(cap, 'failed', '生成失败', triggerEl);
    pushActivity(cap, 'failed', 'err');
    toast('生成异常：' + (err.message || err), 'error');
  } finally {
    inFlight.delete(cap);
    if (triggerEl && triggerEl.tagName === 'BUTTON') {
      triggerEl.disabled = false;
      triggerEl.textContent = triggerEl.dataset.label || triggerEl.textContent;
    }
  }
}

/* ============================ 5.4 反馈 AI 分析弹窗（PM 视角结构化抽取） ============================ */
const MANUAL_FB_KEY = 'insightloop_fb_manual_v1';
function loadManualFb() {
  try { return JSON.parse(localStorage.getItem(MANUAL_FB_KEY) || '{}'); } catch { return {}; }
}
function saveManualFb(obj) {
  try { localStorage.setItem(MANUAL_FB_KEY, JSON.stringify(obj)); } catch {}
}

/* ============================ 5.4.1 反馈决策 / 客诉告警 状态 ============================ */
const FB_DECISION_KEY = 'insightloop_fb_decision_v1';
function loadFbDecisions() { try { return JSON.parse(localStorage.getItem(FB_DECISION_KEY) || '{}'); } catch { return {}; } }
function saveFbDecision(fbId, decision, extra) {
  try { const o = loadFbDecisions(); o[fbId] = Object.assign({ decision, ts: Date.now() }, extra || {}); localStorage.setItem(FB_DECISION_KEY, JSON.stringify(o)); } catch {}
}
const escalatedFb = new Set();
let complaintCount = 0;
(function initComplaintBell() {
  const dec = loadFbDecisions();
  for (const k in dec) if (dec[k].decision === 'escalated') { escalatedFb.add(k); complaintCount++; }
  renderComplaintBell();
})();
function renderComplaintBell() {
  const bell = $('#complaint-bell');
  const cnt = $('#complaint-count');
  if (!bell) return;
  bell.style.display = complaintCount > 0 ? 'inline-flex' : 'none';
  if (cnt) cnt.textContent = complaintCount;
}
function markCardDecision(fbId, label, cls) {
  const card = document.querySelector('.feedback-card[data-fb-id="' + fbId + '"]');
  if (!card) return;
  const tagWrap = card.querySelector('.feedback-tags');
  if (!tagWrap) return;
  let tag = card.querySelector('.fb-decision-tag');
  if (!tag) { tag = document.createElement('span'); tagWrap.appendChild(tag); }
  tag.className = 'fb-decision-tag ' + (cls || '');
  tag.textContent = label;
}
function raiseComplaintAlert(fbId) {
  if (escalatedFb.has(fbId)) return;
  escalatedFb.add(fbId);
  complaintCount += 1;
  renderComplaintBell();
  pushActivity(CAPABILITY.ANALYZE_FEEDBACK, 'escalated', 'req_complaint_' + fbId);
}

/* 把单条分析结果渲染进 #fb-ai-modal；失败/无法识别时引导人工处理 */
function renderFeedbackAnalysis(result, triggerEl) {
  const modal = $('#fb-ai-modal');
  if (!modal) return;
  const body = $('#fb-ai-body');
  if (!body) return;
  const card = triggerEl && triggerEl.closest('.feedback-card');
  const fbId = card ? (card.dataset.fbId || '') : '';
  const quote = card ? (card.querySelector('.feedback-quote')?.textContent || '') : '';

  // 优先展示人工已填写结果（人工处理入口填的）
  const manual = fbId ? loadManualFb()[fbId] : null;
  const d = manual || (result && result.data) || {};
  const source = manual ? '人工填写' : (result ? result.status : 'unknown');
  const isEscalate = d.risk_flag === 'escalate';
  const isLow = (d.confidence === 'low') && !manual;
  const subIntents = Array.isArray(d.sub_intents) ? d.sub_intents : [];

  // 攻击性/客诉风险 -> 顶栏铃铛 + 活动日志（仅对模型结果去重触发一次）
  if (isEscalate && !manual && fbId) raiseComplaintAlert(fbId);

  if (result && result.status === 'failed' && !manual) {
    body.innerHTML =
      '<div class="fb-ai-fail">⚠️ 模型未能完成分析：' + escapeHtml(result.error?.message || '生成失败') +
      '<br>你可以点击下方「人工处理」手动补全这条反馈的结构化信息。</div>';
  } else {
    const row = (label, val) => {
      const pend = String(val).trim() === '待确认' || /待确认/.test(String(val));
      return '<div class="fb-ai-row"><span class="fb-ai-k">' + label + '</span>' +
        '<span class="fb-ai-v' + (pend ? ' pending' : '') + '">' + escapeHtml(String(val || '—')) + '</span></div>';
    };
    const conf = d.confidence || '—';
    const confCls = conf === 'high' ? 'high' : conf === 'medium' ? 'mid' : 'low';

    let subHtml = '';
    if (subIntents.length) {
      subHtml = '<div class="fb-ai-sub"><div class="fb-ai-k" style="margin-bottom:6px">多意图拆分（' + subIntents.length + '）</div>' +
        subIntents.map((s, i) => '<div class="fb-ai-sub-item"><b>' + (i + 1) + '. ' + escapeHtml(s.aspect || '意图') + '</b>：' + escapeHtml(s.feedback_content || '') + '</div>').join('') +
        '</div>';
    }
    const riskHtml = isEscalate
      ? '<div class="fb-ai-risk">⚠️ 客诉风险：该反馈含攻击性 / 高风险情绪（如退款、投诉、威胁），已触发客诉告警，建议优先跟进。</div>'
      : '';

    body.innerHTML =
      '<div class="fb-ai-quote">' + escapeHtml(quote || '（无原文）') + '</div>' +
      riskHtml +
      row('问题来源', d.problem_source) +
      row('用户类型', d.user_type) +
      row('用户情绪', d.user_emotion) +
      row('反馈时间', d.feedback_time) +
      row('反馈内容', d.feedback_content) +
      (subHtml ? subHtml : '') +
      '<div class="fb-ai-row"><span class="fb-ai-k">把握度</span><span class="fb-ai-conf ' + confCls + '">' + conf + '</span></div>' +
      (d.notes ? '<div class="fb-ai-notes">备注：' + escapeHtml(d.notes) + '</div>' : '') +
      '<div class="fb-ai-source">数据来源：' + escapeHtml(source) + '</div>' +
      '<div class="fb-ai-actions" id="fb-ai-actions"></div>';

    // 动态操作按钮：根据状态呈现不同处置动作
    const actions = $('#fb-ai-actions');
    if (actions) {
      if (subIntents.length) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline fb-ai-action';
        b.textContent = '拆分为机会草稿 (' + subIntents.length + ')';
        b.onclick = () => splitSubIntentsToOpps(subIntents, quote);
        actions.appendChild(b);
      }
      if (isEscalate) {
        const b = document.createElement('button');
        b.className = 'btn btn-outline fb-ai-action fb-ai-action-warn';
        b.textContent = '转客诉工单';
        b.onclick = () => openComplaintTicket(fbId, quote);
        actions.appendChild(b);
      }
      if (isLow) {
        const c = document.createElement('button');
        c.className = 'btn btn-outline fb-ai-action';
        c.textContent = '补采（索取更多信息）';
        c.onclick = () => openCollectModal(fbId);
        actions.appendChild(c);
        const r = document.createElement('button');
        r.className = 'btn btn-outline fb-ai-action fb-ai-action-warn';
        r.textContent = '驳回（标记无效反馈）';
        r.onclick = () => rejectFeedback(fbId);
        actions.appendChild(r);
      }
    }
  }

  // 绑定弹窗底部按钮（每次重建后重新绑定）
  const retry = $('#fb-ai-retry');
  const human = $('#fb-ai-human');
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) closeBtn.onclick = () => modal.classList.remove('open');
  if (retry) retry.onclick = () => { modal.classList.remove('open'); runAI(CAPABILITY.ANALYZE_FEEDBACK, { trigger: triggerEl }); };
  if (human) human.onclick = () => openFeedbackHumanModal(fbId, d, triggerEl);

  modal.classList.add('open');
}

/* 多意图 -> 机会工作区草稿 */
function splitSubIntentsToOpps(subs, quote) {
  if (!subs || !subs.length) return;
  let created = 0;
  subs.forEach((s) => {
    const title = (s.aspect || '反馈') + ' 反馈';
    const desc = (s.feedback_content || '') + (quote ? '\n（原反馈：' + quote.slice(0, 50) + (quote.length > 50 ? '…' : '') + '）' : '');
    if (typeof window.createDraftOpportunity === 'function') {
      window.createDraftOpportunity(title, desc, '来自反馈拆分');
      created++;
    }
  });
  if (created) {
    if (typeof window.switchTab === 'function') window.switchTab('opportunities');
    toast('已将 ' + created + ' 个意图转为机会草稿', 'success');
  } else {
    toast('机会工作区未就绪，无法创建草稿', 'error');
  }
}

/* 低 confidence -> 补采 / 驳回 */
function openCollectModal(fbId) {
  const html =
    '<div class="modal-form-row"><label>补采问题</label><textarea id="fb-collect-q" placeholder="向用户追询的问题，例如：请问导出大概在多少条数据时开始超时？"></textarea></div>' +
    '<div class="modal-actions"><button class="btn-ghost" id="fb-collect-cancel">取消</button><button class="btn-primary" id="fb-collect-save">生成补采任务</button></div>';
  showModal('补采 · 索取更多信息', html);
  $('#fb-collect-cancel').onclick = () => { const m = $('#generic-modal'); if (m) m.remove(); };
  $('#fb-collect-save').onclick = () => {
    const q = $('#fb-collect-q').value.trim();
    saveFbDecision(fbId, 'collect', { question: q });
    const m = $('#generic-modal'); if (m) m.remove();
    markCardDecision(fbId, '补采中', 'collecting');
    toast('已生成补采任务，等待用户补充信息', 'success');
  };
}
function rejectFeedback(fbId) {
  if (!confirm('确认将该反馈标记为「无效反馈 / 驳回」吗？\n驳回后将在卡片上标注，不再进入机会转化。')) return;
  saveFbDecision(fbId, 'reject', {});
  markCardDecision(fbId, '已驳回', 'rejected');
  toast('已驳回该反馈', 'info');
}
function openComplaintTicket(fbId, quote) {
  saveFbDecision(fbId, 'escalated', { quote });
  markCardDecision(fbId, '客诉', 'rejected');
  toast('已转客诉工单，建议优先跟进', 'error');
  if (typeof window.switchTab === 'function') window.switchTab('feedback');
}

/* 人工处理入口：模型无法识别 / 用户不满意时，由人工补全结构化字段 */
function openFeedbackHumanModal(fbId, preset, triggerEl) {
  const p = preset || {};
  const html =
    '<div class="modal-form-row"><label>问题来源</label><input type="text" id="fbh-source" value="' + escapeHtml(p.problem_source || '') + '" placeholder="如：导出报表 / 搜索（未知填 待确认）"></div>' +
    '<div class="modal-form-row"><label>用户类型</label><input type="text" id="fbh-type" value="' + escapeHtml(p.user_type || '') + '" placeholder="如：付费版 / 企业版（未知填 待确认）"></div>' +
    '<div class="modal-form-row"><label>用户情绪</label><input type="text" id="fbh-emotion" value="' + escapeHtml(p.user_emotion || '') + '" placeholder="positive / neutral / negative / angry / 待确认"></div>' +
    '<div class="modal-form-row"><label>反馈时间</label><input type="text" id="fbh-time" value="' + escapeHtml(p.feedback_time || '') + '" placeholder="绝对日期 YYYY-MM-DD 或 待确认"></div>' +
    '<div class="modal-form-row"><label>反馈内容</label><textarea id="fbh-content" placeholder="一句话凝练用户真实诉求">' + escapeHtml(p.feedback_content || '') + '</textarea></div>' +
    '<div class="modal-form-row"><label>客诉风险</label><select id="fbh-risk"><option value="none"' + (p.risk_flag !== 'escalate' ? ' selected' : '') + '>none（无）</option><option value="escalate"' + (p.risk_flag === 'escalate' ? ' selected' : '') + '>escalate（转客诉）</option></select></div>' +
    '<div class="modal-actions"><button class="btn-ghost" id="fbh-cancel">取消</button><button class="btn-primary" id="fbh-save">保存为人工填写</button></div>';
  showModal('人工处理 · 补全反馈信息', html);
  $('#fbh-cancel').onclick = () => { const m = $('#generic-modal'); if (m) m.remove(); };
  $('#fbh-save').onclick = () => {
    const val = {
      problem_source: $('#fbh-source').value.trim() || '待确认',
      user_type: $('#fbh-type').value.trim() || '待确认',
      user_emotion: $('#fbh-emotion').value.trim() || '待确认',
      feedback_time: $('#fbh-time').value.trim() || '待确认',
      feedback_content: $('#fbh-content').value.trim() || '（人工填写，无内容）',
      confidence: 'high',
      risk_flag: $('#fbh-risk').value,
      notes: '由人工在「人工处理」入口补全，覆盖模型结果。',
    };
    if (fbId) { const all = loadManualFb(); all[fbId] = val; saveManualFb(all); }
    const m = $('#generic-modal'); if (m) m.remove();
    renderFeedbackAnalysis({ status: 'success', data: val }, triggerEl);
    toast('已保存人工填写结果', 'success');
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function todayISO() {
  try {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  } catch { return ''; }
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
  persistLocalState();
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
  persistLocalState();
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
    editsState[cap] = el.innerHTML; // 持久化：记录人工修改后内容
    pushActivity(cap, 'edited', '人工');
    persistLocalState();
    toast('已保存人工修改', 'success');
  } else {
    delete el.dataset.manuallyEdited;
    delete editsState[cap];
    persistLocalState();
  }
}

/* 还原双击编辑：把持久化的面板内容写回，并标注「已人工修改」 */
function restoreEdits() {
  for (const cap in editsState) {
    const el = $(`[data-editable][data-edit-cap="${cap}"]`);
    if (!el) continue;
    el.innerHTML = editsState[cap];
    el.dataset.manuallyEdited = '1';
    el.classList.add('edited');
  }
}

/* 还原人工确认/反馈：重建结果操作条并点亮状态，跨会话保留「人在回路」签核 */
function restoreHuman() {
  for (const cap in humanState) {
    const st = humanState[cap];
    if (!st || (!st.adopted && !st.feedback)) continue;
    ensureResultBar(cap);
    const bar = resultBars[cap];
    if (bar) {
      if (st.adopted) {
        const b = bar.querySelector('.rb-adopt');
        b.classList.add('on'); b.textContent = '✓ 已采纳';
      }
      if (st.feedback) {
        bar.querySelector('.rb-up').classList.toggle('on', st.feedback === 'up');
        bar.querySelector('.rb-down').classList.toggle('on', st.feedback === 'down');
      }
    }
    if (st.adopted) setInlineStatus(cap, 'adopted', '已采纳');
  }
}

/* ============================ 6. 初始化绑定 ============================ */
function init() {
  // 先回填 localStorage 中的人工态 / 编辑内容 / 活动日志
  loadLocalState();

  // 绑定所有 [data-ai-cap] 触发元素（把按钮本身作为 trigger 传入，便于分析单条反馈）
  $$('[data-ai-cap]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); runAI(btn.dataset.aiCap, { trigger: btn }); });
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
  // 一键演示容错：强制脏JSON 异常并触发批量分析，现场展示三层兜底
  const demoBtn = $('#fail-demo-btn');
  demoBtn && demoBtn.addEventListener('click', () => {
    FAIL_MODE = 'badjson';
    if (failSel) failSel.value = 'badjson';
    toast('已模拟「脏JSON」异常，正在触发批量分析以演示三层容错兜底…', 'info');
    runAI(CAPABILITY.BATCH_ANALYZE);
  });

  // 还原持久化内容（顺序：编辑内容 → 人工态 → 活动日志）
  restoreEdits();
  restoreHuman();
  renderActivity();
  initInlineEdit();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { runAI, openDrawer, pushActivity };
