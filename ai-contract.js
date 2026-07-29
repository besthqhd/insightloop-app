/**
 * InsightLoop · AI 接入层契约 (ai-contract.js)
 * -------------------------------------------------------------
 * 解决接入模型时必处理的四个问题：
 *   1) 输入内容如何组织        -> buildContext()
 *   2) prompt 如何约束输出格式 -> SYSTEM_PROMPT + SCHEMAS（强制固定 JSON）
 *   3) 模型失败/输出异常怎么办  -> callModel() 的状态机（重试/降级/解析修复/校验）
 *   4) 用户如何修改/重新生成   -> regenerate() + 版本历史 + 可编辑草稿
 *
 * 设计原则（来自用户要求）：
 *   - 模型“不只输出一段总结”，而是按 capability 返回固定 JSON。
 *   - 任何异常都不得让页面崩溃，必须渲染出可继续操作的结果。
 * 本文件为纯逻辑层，不依赖任何 UI 框架，可被 index.html 直接 import。
 */

/* ============================ 0. 能力枚举 ============================ */
// 与设计稿中四处 AI 入口一一对应
export const CAPABILITY = {
  BATCH_ANALYZE: 'batch_analyze',        // 反馈中心：批量 AI 分析
  ANALYZE_FEEDBACK: 'analyze_feedback',  // 反馈中心：单条反馈智能体分类（PM 视角）
  GENERATE_PRD: 'generate_prd',          // 机会工作区：AI 生成 PRD
  GEN_ACCEPTANCE: 'gen_acceptance',      // 机会工作区：生成验收标准
  GEN_TRACKING: 'gen_tracking',          // 机会工作区：生成埋点方案
  DECOMPOSE_TASKS: 'decompose_tasks',    // 机会工作区：拆解为任务
  AI_SCORE: 'ai_score',                  // 机会工作区：AI 优先级评分
  AI_REVIEW: 'ai_review',                // 上线效果：AI 复盘结论
  AI_SUGGEST: 'ai_suggest',              // 上线效果：下轮优化建议
};

/* ====================== 1. 固定 JSON Schema 定义 ======================
 * 每个能力一份“最小契约”。模型必须且只能返回这些字段，
 * 多余字段被忽略，缺失/非法字段由 validate() 兜底或标记为 partial。
 */
export const SCHEMAS = {
  /* 单条反馈 PM 视角结构化抽取：任何信息不足字段一律填 '待确认'，严禁编造 */
  [CAPABILITY.ANALYZE_FEEDBACK]: {
    required: ['problem_source', 'user_type', 'user_emotion', 'feedback_time', 'feedback_content'],
    fields: {
      problem_source: 'string',   // 问题来源模块/功能，信息不足填 '待确认'
      user_type: 'string',        // 用户类型/角色，信息不足填 '待确认'
      user_emotion: 'enum(positive|neutral|negative|angry|待确认)',
      feedback_time: 'string',    // 已还原的绝对日期 YYYY-MM-DD；相对时间需结合“今天”还原；无线索填 '待确认'
      feedback_content: 'string', // 凝练后的用户真实诉求/问题
      confidence: 'enum(high|medium|low)', // 模型对整体判断的把握度
      notes: 'string',            // 说明哪些字段因信息不足标为待确认及原因
      // ── v1.9 增强字段 ──
      sub_intents: 'array<{aspect:string, problem_source:string, feedback_content:string}>', // 多意图拆分；单意图为空数组
      risk_flag: 'enum(none|escalate)', // 攻击性/客诉风险：escalate 表示需转客诉告警
    },
  },
  [CAPABILITY.BATCH_ANALYZE]: {
    required: ['summary', 'themes', 'suggested_opportunities'],
    fields: {
      summary: 'string',
      themes: 'array<{name:string, count:number, sentiment:enum(positive|neutral|negative), severity:enum(P0|P1|P2|P3), evidence_ids:array<string>}>',
      suggested_opportunities: 'array<{title:string, priority:number, rationale:string}>',
      charts: 'object<{sentiment_dist:{negative:number,neutral:number,positive:number}}>', // 可选
    },
  },
  [CAPABILITY.GENERATE_PRD]: {
    required: ['title', 'problem', 'user_story', 'solution', 'acceptance_criteria'],
    fields: {
      title: 'string',
      problem: 'string',
      user_story: 'string',
      solution: 'string',
      scope: 'string',
      acceptance_criteria: 'array<string>',
      tracking_plan: 'array<string>',
      task_breakdown: 'array<{role:enum(前端|后端|测试|设计|数据), task:string}>',
      source_insight_id: 'string',
    },
  },
  [CAPABILITY.AI_REVIEW]: {
    required: ['headline', 'goal_achievement', 'metric_deltas'],
    fields: {
      headline: 'string',
      goal_achievement: 'object<{completed:number, total:number}>',
      metric_deltas: 'array<{name:string, before:number, after:number, unit:string, delta_pct:number}>',
      hypothesis_validated: 'boolean',
      recommendations: 'array<string>',
    },
  },
  [CAPABILITY.GEN_ACCEPTANCE]: {
    required: ['criteria', 'format'],
    fields: {
      format: 'enum(Given-When-Then|Checklist)',
      criteria: 'array<{id:string, given:string, when:string, then:string, priority:enum(P0|P1|P2|P3)}>',
      coverage: 'number',           // 0~1，已覆盖需求比例
      source_prd_id: 'string',
    },
  },
  [CAPABILITY.GEN_TRACKING]: {
    required: ['events'],
    fields: {
      events: 'array<{name:string, trigger:string, properties:array<string>, purpose:string}>',
      sampling: 'enum(全量|采样|关键路径)',
      notes: 'string',
    },
  },
  [CAPABILITY.DECOMPOSE_TASKS]: {
    required: ['tasks'],
    fields: {
      tasks: 'array<{role:enum(前端|后端|测试|设计|数据), task:string, estimate_days:number, depends_on:array<string>}>',
      total_estimate_days: 'number',
      critical_path: 'array<string>',
    },
  },
  [CAPABILITY.AI_SCORE]: {
    required: ['score', 'breakdown'],
    fields: {
      score: 'number',              // 0~10
      breakdown: 'object<{impact:number, value:number, evidence:number, cost:number}>',
      rationale: 'string',
      sources: 'array<string>',     // 可溯源证据 id
    },
  },
  [CAPABILITY.AI_SUGGEST]: {
    required: ['suggestions'],
    fields: {
      suggestions: 'array<{title:string, priority:number, rationale:string, related_opportunity:string}>',
      context_iteration: 'string',
    },
  },
};

/* ====================== 2. 输入内容如何组织 ======================
 * 把“零散上下文”组装成模型能稳定消费的强类型信封，
 * 而不是把整屏文本一股脑塞进 prompt。
 */
export function buildContext(capability, params) {
  // params 至少包含：{ artifacts, userInstruction, constraints, history }
  const { artifacts = [], userInstruction = '', constraints = {}, history = [] } = params;

  // 2.1 按优先级裁剪上下文，控制 token 预算（示例上限 6000）
  const BUDGET = 6000;
  const picked = [];
  let used = 0;
  for (const a of artifacts) {
    const size = JSON.stringify(a).length;
    if (used + size > BUDGET) break;
    picked.push(a);
    used += size;
  }

  return {
    capability,
    system: 'InsightLoop AI · 产品迭代闭环工作台',
    // 组装后的强类型上下文（非自由文本）
    context: {
      artifacts: picked,
      user_instruction: userInstruction,
      constraints,                 // 如 { tone:'专业', detail:'高', focus:'性能' }
      prior_generations: history.slice(-3), // 仅保留最近 3 次，供“重新生成”参考
    },
    output_contract: SCHEMAS[capability], // 让调用方与校验方共用同一份契约
  };
}

/* ====================== 3. Prompt 如何约束输出为固定 JSON ======================
 * 硬性要求：只输出合法 JSON，禁止解释性文字、禁止 ``` 包裹。
 * 若平台支持 response_format=json_schema / function calling，应作为“硬保证”，
 * 本 prompt 作为“软保证”兜底。
 */
export function buildSystemPrompt(capability, ctx) {
  const schema = SCHEMAS[capability];
  const fieldLines = Object.entries(schema.fields)
    .map(([k, v]) => `  - "${k}": ${v}`)
    .join('\n');
  const refDate = (ctx && ctx.context && ctx.context.constraints && ctx.context.constraints.reference_date)
    || (ctx && ctx.reference_date) || '';

  // 单条反馈分类：使用 PM 视角专用提示词，强制「信息不足即待确认，绝不编造」
  if (capability === CAPABILITY.ANALYZE_FEEDBACK) {
    const refLine = refDate ? `【今天日期】：${refDate}。请以此为准还原相对时间。` : '';
    return [
      '你是一名资深产品经理，正在处理用户反馈。请基于下面给出的单条反馈文本，严格按契约识别并结构化抽取以下维度：',
      '  - problem_source（问题来源）：反馈指向的产品模块 / 功能 / 链路，例如「导出报表」「搜索」「移动端登录」。若文本无法判断，填 "待确认"，不要猜测。',
      '  - user_type（用户类型）：例如「免费个人用户」「企业管理员」「开发者」。信息不足填 "待确认"。',
      '  - user_emotion（用户情绪）：positive / neutral / negative / angry。无法判断填 "待确认"。',
      '  - feedback_time（反馈时间）：若文本含相对时间（如「昨天 / 前天 / 3天前 / 上周 / 上个月」），' + (refDate ? '结合【今天日期】' : '结合当前日期') + '还原为绝对日期 YYYY-MM-DD（例如 2026-07-27）；无线索填 "待确认"。',
      '  - feedback_content（反馈内容）：用一句话凝练用户真实诉求 / 问题，保留关键事实，不展开。',
      '  - confidence：你对以上整体判断的把握度 high / medium / low。信息越缺失、情绪越极端、文本越短，把握度越低。',
      '  - notes：说明哪些字段因信息不足标记为「待确认」以及原因。',
      '  - sub_intents（多意图拆分）：若一条反馈包含多个不同意图（如同时抱怨「导出慢」与「搜索不准」），请逐条拆分成独立意图对象，每条含 aspect（意图方面，如「导出速度」）/ problem_source（该意图来源）/ feedback_content（该意图诉求）；单意图或无法拆分时填空数组 []。',
      '  - risk_flag（客诉风险）：若反馈带有明显攻击性、辱骂、威胁，或高风险情绪（如要求退款、投诉、起诉、扬言弃用、拉黑），置为 "escalate" 并在 notes 说明；否则置为 "none"。',
      '',
      '【硬性约束】',
      '1. 严禁自行编造任何信息；任何不确定的字段一律填 "待确认"。',
      '2. 你必须且只能输出一个合法 JSON 对象，不要输出任何解释性文字，不要用 markdown 代码块包裹。',
      '3. 输出 JSON 必须严格满足以下字段契约（缺失必填字段或类型错误将被视为失败）：',
      fieldLines,
      `   必填字段：${schema.required.join(', ')}。`,
      '   枚举约束必须严格遵守（user_emotion / confidence / risk_flag 取值见字段定义）。',
      refLine,
    ].join('\n');
  }

  return [
    '你是 InsightLoop 的产品智能体。你必须且只能输出一个合法 JSON 对象，不要输出任何解释性文字，不要用 markdown 代码块包裹。',
    `当前能力：${capability}。`,
    '输出 JSON 必须严格满足以下字段契约（缺失必填字段或类型错误将被视为失败）：',
    fieldLines,
    `必填字段：${schema.required.join(', ')}。`,
    '枚举约束必须严格遵守；数值字段必须是 number；数组元素结构必须一致。',
    '如果依据不足，用空字符串或空数组占位，并在字段旁不要附加说明文字。',
  ].join('\n');
}

/* ====================== 工具：从脏输出中修复 JSON ====================== */
function repairJson(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  // 去掉 ```json ... ``` 包裹
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  // 截取第一个 { 到最后一个 }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* ====================== 工具：契约校验 + 兜底修复 ====================== */
export function validate(data, capability) {
  const schema = SCHEMAS[capability];
  const errors = [];
  const repaired = {};
  for (const [k, type] of Object.entries(schema.fields)) {
    const v = data?.[k];
    const isArray = type.startsWith('array');
    const isObject = type.startsWith('object');
    if (v === undefined || v === null || (isArray && !Array.isArray(v)) || (isObject && typeof v !== 'object')) {
      if (schema.required.includes(k)) {
        errors.push(`missing_required:${k}`);
        // 兜底：必填缺失时给出安全默认值，标记 partial
        repaired[k] = isArray ? [] : isObject ? {} : '';
      } else {
        repaired[k] = isArray ? [] : isObject ? {} : '';
      }
    } else {
      repaired[k] = v;
    }
  }
  return {
    ok: errors.length === 0,
    partial: errors.length > 0,
    errors,
    data: repaired,
  };
}

/* ====================== 4. 模型调用：失败/异常状态机 ======================
 * 覆盖：网络超时 / 限流 429 / 5xx / 内容过滤 / JSON 解析失败 /  schema 校验失败
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function callModel(capability, params, opts = {}) {
  const {
    requestModel = callRealModel,   // 可注入真实模型调用
    fallbackModel = callRealModel,  // 降级模型
    maxRetry = 2,
    timeoutMs = 20000,
  } = opts;

  const ctx = buildContext(capability, params);
  const sysPrompt = buildSystemPrompt(capability, ctx);

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      // 真实环境：把 sysPrompt + ctx 发给模型，要求 JSON
      const raw = await Promise.race([
        requestModel(sysPrompt, ctx, { signal: ctrl.signal }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs)),
      ]);
      clearTimeout(timer);

      // 3.1 解析失败 -> 尝试修复
      let data = typeof raw === 'string' ? repairJson(raw) : raw;
      if (!data) {
        if (attempt < maxRetry) { await sleep(500 * (attempt + 1)); continue; }
        return envelope(capability, 'failed', null, {
          code: 'JSON_UNPARSEABLE', message: '模型未返回可解析的 JSON', retryable: true,
        });
      }

      // 3.2 schema 校验
      const v = validate(data, capability);
      if (v.ok) {
        return envelope(capability, 'success', v.data, null, { model: 'primary' });
      }
      // 3.3 校验失败但可兜底 -> partial
      if (attempt === maxRetry) {
        return envelope(capability, 'partial', v.data, {
          code: 'SCHEMA_INVALID', message: `部分字段缺失/非法：${v.errors.join('; ')}`, retryable: false,
        }, { model: 'primary' });
      }
      await sleep(500 * (attempt + 1));
    } catch (err) {
      const retryable = ['TIMEOUT', '429', '5xx', 'ETIMEDOUT', 'ECONNRESET'].some((c) => String(err.message).includes(c));
      // 降级模型
      if (attempt === 0 && fallbackModel && retryable) {
        try {
          const raw = await fallbackModel(sysPrompt, ctx, {});
          const data = typeof raw === 'string' ? repairJson(raw) : raw;
          if (data) {
            const v = validate(data, capability);
            return envelope(capability, v.ok ? 'success' : 'partial', v.data,
              v.ok ? null : { code: 'SCHEMA_INVALID', message: v.errors.join('; '), retryable: false },
              { model: 'fallback' });
          }
        } catch { /* 落到下面的重试/失败 */ }
      }
      if (attempt < maxRetry && retryable) { await sleep(800 * (attempt + 1)); continue; }
      return envelope(capability, 'failed', null, {
        code: classifyError(err), message: humanMessage(err), retryable,
      });
    }
  }
}

/* ====================== 5. 用户修改 / 重新生成 ======================
 * - 重新生成：同一上下文 + 变化种子（temperature 抖动 / 不同侧重约束）
 * - 版本历史：保留最近 N 次，可回退
 * - 可编辑草稿：用户改动后单独保存，与“模型结果”分离
 */
const historyStore = new Map(); // capability+key -> [{ts, data, status, seed}]

/* ====================== 版本历史持久化 ======================
 * 让「重新生成 / 版本对比」的结果跨会话保留（刷新不丢），
 * 存于 localStorage，与 AI 密钥互不干扰。仅存结构化的版本数组，体积很小。
 */
const HISTORY_PERSIST_KEY = 'insightloop_history_v1';

function loadPersistedHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_PERSIST_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      for (const k in obj) {
        if (Array.isArray(obj[k])) historyStore.set(k, obj[k]);
      }
    }
  } catch { /* 忽略损坏数据，走内存态 */ }
}

function persistHistory() {
  try {
    const obj = {};
    for (const [k, v] of historyStore.entries()) obj[k] = v;
    localStorage.setItem(HISTORY_PERSIST_KEY, JSON.stringify(obj));
  } catch { /* 配额/隐私模式下静默失败，不影响主流程 */ }
}

export async function regenerate(capability, params, opts = {}) {
  const { variationSeed = Date.now(), adjustConstraints = {}, keepVersions = 5, key = capability } = opts;
  const mergedParams = {
    ...params,
    constraints: { ...(params.constraints || {}), _seed: variationSeed, ...adjustConstraints },
  };
  const result = await callModel(capability, mergedParams, opts);
  const list = historyStore.get(key) || [];
  list.push({ ts: Date.now(), data: result.data, status: result.status, seed: variationSeed });
  historyStore.set(key, list.slice(-keepVersions));
  persistHistory(); // 任一能力生成后立即落盘
  return result;
}

// 模块加载即回填历史（必须在首次 getHistory 之前）
loadPersistedHistory();

export function getHistory(key) { return historyStore.get(key) || []; }

/* ============================ 内部辅助 ============================ */
function envelope(capability, status, data, error, meta = {}) {
  return {
    request_id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    capability,
    status,            // success | partial | failed
    data,             // 固定 JSON（success/partial 时有值）
    error,            // { code, message, retryable } | null
    meta: { model: meta.model || 'primary', tokens: 0, elapsed_ms: 0, confidence: data ? 0.9 : 0, sources: [] },
  };
}

function classifyError(err) {
  const m = String(err?.message || '');
  if (m.includes('TIMEOUT')) return 'TIMEOUT';
  if (m.includes('429')) return 'RATE_LIMIT';
  if (m.includes('5')) return 'UPSTREAM_5XX';
  if (m.includes('filter') || m.includes('content')) return 'CONTENT_FILTER';
  return 'UNKNOWN';
}
function humanMessage(err) {
  const c = classifyError(err);
  return {
    TIMEOUT: '模型响应超时，请重试',
    RATE_LIMIT: '请求过于频繁，请稍后再试',
    UPSTREAM_5XX: '模型服务暂时不可用',
    CONTENT_FILTER: '内容被安全策略拦截，请调整输入',
    UNKNOWN: '生成失败，请重试或手动填写',
  }[c] || '生成失败';
}

/* ====================== 真实模型调用（OpenAI 兼容适配器） ======================
 * 厂商无关：只要填 baseUrl + apiKey + model，即可对接
 *   DeepSeek / 智谱 GLM / 阿里通义 / Groq / OpenAI 等（均 OpenAI 兼容 /chat/completions）。
 * 密钥仅从 localStorage('insightloop_ai_config') 读取，绝不进入代码仓库。
 */
const MODEL_CONFIG_KEY = 'insightloop_ai_config';

export function getModelConfig() {
  try {
    const raw = localStorage.getItem(MODEL_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setModelConfig(cfg) {
  localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(cfg));
}

export function useRealModel() {
  try { return localStorage.getItem('insightloop_use_real') === '1'; }
  catch { return false; }
}

export function setUseRealModel(on) {
  localStorage.setItem('insightloop_use_real', on ? '1' : '0');
}

export async function callRealModel(systemPrompt, context, { signal, cfgOverride } = {}) {
  const cfg = cfgOverride || getModelConfig();
  if (!cfg || !cfg.apiKey) {
    throw new Error('NO_API_KEY: 请在「⚙ AI 设置」中填写 API Key');
  }
  // proxyUrl 优先：用于绕过智谱等国内 API 对浏览器端直连的 CORS 限制
  const baseUrl = (cfg.proxyUrl || cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = cfg.model || 'gpt-4o-mini';
  const userContent = JSON.stringify(context?.context ?? context, null, 2);

  let resp;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      signal: signal || ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `以下是本次请求的强类型上下文（JSON），请基于它生成符合契约的回复：\n\n${userContent}` },
        ],
      }),
    });
  } catch (e) {
    const msg = String(e?.message || e);
    if (e?.name === 'AbortError' || /abort|timeout|the operation was aborted/i.test(msg)) {
      throw new Error('TIMEOUT: 请求超时（15s）。可能是你的网络无法访问代理/API，或代理地址不可达；若使用 workers.dev，请确认 Worker 已部署且地址正确（末尾为 /v1）。');
    }
    // 浏览器拦截跨域请求时通常抛 TypeError: Failed to fetch / NetworkError
    const isCors = /Failed to fetch|NetworkError|CORS|network/i.test(msg);
    if (isCors) {
      throw new Error('CORS_BLOCKED: 浏览器被目标 API 的 CORS 策略拦截。智谱 open.bigmodel.cn 禁止前端直连，请在「⚙ AI 设置」填写代理地址（Proxy URL），或改用支持浏览器访问的 API。');
    }
    throw new Error('NETWORK_FAIL: 网络请求失败（' + msg + '）');
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let bodyText = '';
    try { bodyText = await resp.text(); } catch {}
    let msg = `HTTP ${resp.status}`;
    try { const j = JSON.parse(bodyText); msg = j?.error?.message || msg; } catch {}
    console.error('[callRealModel] API error', { status: resp.status, body: bodyText.slice(0, 800), model, baseUrl });
    if (resp.status === 429) throw new Error('429: ' + msg);
    if (resp.status >= 500) throw new Error('5xx: ' + msg);
    throw new Error(msg);
  }
  let j;
  try {
    j = await resp.json();
  } catch (e) {
    const text = await resp.text().catch(() => '');
    console.error('[callRealModel] JSON parse error', text.slice(0, 800));
    throw new Error('JSON_PARSE: 模型返回非 JSON');
  }
  const content = j?.choices?.[0]?.message?.content;
  if (!content) {
    console.error('[callRealModel] empty content', j);
    throw new Error('EMPTY_RESPONSE: 模型返回为空');
  }
  return content; // callModel 会用 repairJson 解析为 JSON
}
