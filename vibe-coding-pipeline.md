# Vibe Coding 产品搭建管线（完整版 · 可复用 Prompt + 流程）

> 来源：InsightLoop 项目完整实战（2026-07-26 想法 → 07-29 v2.2.7 量化对比），覆盖从想法具象化、PRD/竞品分析、HTML 原型、契约层、UX 审计、按钮核查、数据测试、真实模型接入到文档同步的全流程。
> 用途：下次从零搭建任意「AI 产品 / AI 功能」时，直接套用这套阶段、Prompt 与工程模式。
> 核心哲学：**先想法 → PRD/竞品对齐范围 → HTML 原型(设计即出码) → 契约层解耦 → 三层展示法 → UX 审计 → 按钮逐轮核查 → 数据测试量化 → 接真实模型 → 工程加固 → 文档对齐**。所有质量靠"度量 + 逐轮核查"，不靠"感觉"。
> UI 载体决策：单人/小团队/AI 构建产品用 **HTML 单文件直出**（设计即出码，跳过 Figma 翻译损耗）；仅当有独立设计团队、要切图标注/设计系统时才走 Ardot/Figma 出图。

---

## 0. 一句话启动（Master Prompt）

```
我要从零搭建一个 AI 产品：[一句话价值主张 / 想解决什么人什么痛点]。请按「Vibe Coding 完整管线」帮我推进，每阶段先给可运行产物再进下一阶段：
0) 想法具象化：你给我粗略想法 → 我用结构化澄清问题把它变完整方案 → 产出 PRD + 竞品分析，确认范围后再进 UI
1) UI 设计 = 直接写 HTML 单文件原型（1440px 缩放，内联 CSS/JS，可交互高保真），跳过 Ardot 出图，"设计稿即出码"
2) AI 契约层：CAPABILITY + SCHEMAS + buildContext + buildSystemPrompt + callModel 失败状态机 + regenerate(seed 抖动)
3) 三层展示法：内联状态徽标 / Agent 追溯抽屉 / 顶栏活动日志
4) UX 审计：7 基础(信息层级/下一步/加载态/可改错/可重生/历史/导出) + 6 亮点(人工确认/版本对比/引用原文/判断依据/点赞点踩/一键重分析)，补齐缺失项
5) 按钮逐轮核查（死按钮消除）：审计每页全部可点击元素 → 分真/假死 → 用稳定 id + 事件委托修复 → cache-bust
6) 本地 RAG（可选）：hash 词袋向量，零依赖可演示
7) 数据测试与 Evals：10–20 组测试数据 + 三问判定(理解任务/格式稳定/有帮助) + 测试报告 harness；进阶为 Mock vs 真实 15 用例量化看板
8) 真实模型接入：OpenAI 兼容适配器 + 密钥架构决策（直连 Groq / Worker 密钥托管后端）
9) 工程加固：超时 + 重试 + 并发控制 + 测试连接诊断 + 缓存破坏
10) 本地持久化（刷新不丢）：history / 编辑态 / 机会草稿 localStorage
11) 文档同步：把 PRD/README 更新对齐代码，嵌 Evals 证据
每阶段结束给我小结 + 下一步。
```

---

## 1. 完整阶段总览

```
[0 想法→PRD/竞品]→[1 HTML原型]→[2 契约层]→[3 三层法]→[4 UX审计]→[5 按钮核查]→[6 本地RAG]→[7 数据/Evals]→[8 真实模型]→[9 工程加固]→[10 持久化]→[11 文档]
   范围对齐       单文件UI     schema       状态/抽屉    7基础+6亮点   死按钮消除     hash向量      15用例+3指标     OpenAI兼容     超时/重试/并发    刷新不丢      PRD/README对齐
   早期写PRD      设计即出码   validate     活动日志     版本对比      多轮审计        cosine        mock|real对比    密钥架构决策     诊断/缓存破坏     localStorage   嵌证据
```

---

## 2. 各阶段可直接复用的 Prompt

### 阶段 0 · 想法具象化 + PRD/竞品分析（UI 之前，必做）
```
① 你给我一个大概的产品想法（一句话价值主张 / 想解决什么人、什么痛点、现有方案差在哪）；
② 我用结构化澄清问题把想法变完整方案：目标用户与场景、MVP 范围(必做/选做)、3-5 条核心用户故事、粗略信息架构(页面与模块)、关键数据/字段草图、成功指标(怎么算做成了)；
③ 基于完整方案产出两份文档：
   - PRD：背景与目标 / 用户故事 / 功能清单(优先级 MoSCoW) / 非功能需求 / 明确边界(不做什么)；
   - 竞品分析：3-5 个对标产品、能力矩阵对比、差异化切入点与护城河；
④ 与你确认范围与优先级后再进入 UI 设计——这一步把"模糊想法"变成"可评审、可估算、可返工"的契约。
```

### 阶段 1 · UI 设计 = HTML 单文件原型（弃用 Ardot，设计即出码）
```
① 直接用单个 HTML 文件设计 UI（不再用 Ardot/设计工具出图）：1440px 原始画布等比缩放 + 全部 CSS/HTML 绘制 + 原生 CSS/JS + Google Fonts；
② 每页先列节点清单(顶栏/Tab/KPI/列表/详情/AI 面板/底部操作)再写，高保真且可交互：Tab 切换/卡片选中/筛选切换等轻交互直接做可用，把"设计稿"和"出码"合一，免去 Figma→HTML 翻译损耗；
③ 还原要点：严格按节点清单实现布局与数据，重逻辑后补；完成后即是一个可点可看的活原型，开发/AI 可直接照 DOM 实现，无需再出设计图片。
（例外：若有独立设计团队要做切图标注/设计系统，则此阶段改用 Ardot/Figma 出高保真图，见决策表"UI 载体"。）
```

### 阶段 2 · AI 契约层（解耦 UI 与模型）
```
为 [任务] 设计 AI 接入契约层 ai-contract.js：
- CAPABILITY 枚举对齐所有 AI 入口；SCHEMAS 每能力一份固定 JSON 字段契约（必填+类型+enum）；
- buildContext() 强类型信封 + token 预算裁剪；buildSystemPrompt() 硬性"只输出 JSON"约束；
- callModel() 失败状态机：解析修复(repairJson) → schema 校验兜底(partial) → 重试/降级 → 用户可读错误(error.retryable)；
- regenerate()：variationSeed + adjustConstraints + 版本历史；mockModel 按 capability 返回符合契约的 JSON（读 ctx.capability 而非参数错位）。
```

### 阶段 3 · 三层展示法（AI 协同状态可视化）
```
为每处 AI 入口实现三层展示：
① 内联状态徽标（idle/loading/success/partial/failed）随调用切换；
② Agent 追溯抽屉：展示模型/输入/输出 Token/耗时/重试/版本 seed + 查看追溯入口；
③ 顶栏活动日志：带状态点的活动项 + 时间戳 + 采纳/反馈/编辑状态。
失败统一处理：红色失败横幅 + 重新生成/查看日志按钮 + seed 说明。
```

### 阶段 4 · UX 审计（7 基础 + 6 亮点）
```
审计当前 UI 是否满足：
七基础：信息层级 / 下一步引导 / 加载态 / 可编辑(双击改错) / 可重生(重新生成) / 历史(版本记录) / 导出(下载 md/csv)；
六亮点：人工确认(采纳) / 版本对比 / 引用原文 / 判断依据(透明推理链) / 点赞点踩 / 一键重分析。
对缺失项：优先补"生成内容版本对比"与"人工确认/采纳 + 点赞点踩"（人在回路），可编辑用双击 contentEditable + 失焦保存 + 标 data-manually-edited。
```

### 阶段 5 · 按钮逐轮核查（死按钮消除）★ 反复做
```
逐页审计 index.html 全部可点击元素（含顶栏/下拉/卡片），核对脚本事件绑定，分两类：
- 真死：完全无绑定 → 补真实行为（导航切 Tab / 弹窗 modal / 导出真实下载 / 重置筛选 / 新建插卡）；
- 假死：只改 label 或纯 toast、无数据变化 → 补真实数据变化（排序重排 DOM / 迭代切换重渲染仪表盘 / 时间窗重绘趋势图 / 导出真实 CSV）。
修复铁律：① 用稳定 id 选择器，绝不靠 byText 文本匹配；② 卡片/列表点击用事件委托；③ 每次修复 bump cache-bust 参数 ?v=x.y。
注意：用户会反复要求"检查所有按钮"，这是高频 recurring 环节，每轮按上面重做。
```

### 阶段 6 · 本地 RAG（零依赖）
```
实现本地 RAG：CJK 单字+bigram、EN 词 → FNV-1a 哈希 → 维度 RAG_DIM=2048 → L2 归一化 → 余弦相似度 top-k，阈值 minScore=0.12（无关查询归零）。接口暴露 retrieve(query,k)，便于日后替换真实语义向量。
```

### 阶段 7 · 数据测试与 Evals（量化核心）
```
先做契约级数据测试：写 10–20 组测试数据（含 1 组脏 JSON 验证容错），经真实契约链路(mock 走 repairJson→validate)逐组评估三问：
① 理解任务（输出是否命中预期维度）② 格式稳定（可解析 + schema 通过，0 崩溃）③ 是否有帮助（格式成功且 confidence≠low 或 escalate）；
产出 test-report.md（逐组结果表 + 三问判定 + 容错对照）。
进阶为 Evals 看板：15 条边界用例（正常/缺失/仅情绪/过长/攻击/多意图+风险），支持「对比 Mock vs 真实」：同套用例分别跑 mock 与真实模型，逐条 ✓✗ 标差异；未配置 Key 只跑 mock 并提示。
```

### 阶段 8 · 真实模型接入 + 密钥架构决策
```
接入 OpenAI 兼容 callRealModel(systemPrompt, context, {signal, cfgOverride})：
- 免费/演示：baseUrl 填 Groq(https://api.groq.com/openai/v1)、模型 llama-3.3-70b-versatile、代理留空（CORS 友好直连）；
- 国内模型(智谱/DeepSeek)：浏览器被 CORS 拦 → Cloudflare Worker 做「密钥托管后端」：浏览器不传 key，key 存 Worker Secret，Worker 代发；
- 判断：填了后端地址(proxyUrl)即后端托管模式，浏览器端 apiKey 可空。
```

### 阶段 9 · 工程加固（四件套）
```
① 超时 25s（fetch 硬超时 + 上层 timeoutMs 对齐）② 失败重试 1 次（429/5xx/超时，间隔 800ms）③ 并发控制 EVAL_CONCURRENCY=2 ④ 「测试连接」按钮免开发者工具排查 ⑤ 每次发布 bump 缓存破坏 ?v=x.y.z 强制 Pages 重 build + 浏览器绕缓存。
```

### 阶段 10 · 本地持久化（刷新不丢）
```
historyStore / editsState(humanState+编辑后HTML) / 机会草稿 均 localStorage 持久化：模块加载即回填，每次 regenerate/编辑/新建触发落盘；「清空本地记录」按钮删对应 key（不打扰 AI 密钥）。
```

### 阶段 11 · 文档同步
```
把 PRD / README / 竞品分析更新对齐已交付代码（阶段 0 已写初版 PRD，此处是"对齐 as-built"，不是从零写）：补真实模型接入、本地 RAG、Evals 看板、密钥托管后端；PRD 末尾加「Evals 实测证据」章节嵌 evals-evidence.svg，附工程优化轨迹供评审。
```

---

## 3. 关键工程模式（已验证，直接抄）

### 3.1 死按钮修复铁律（阶段 5）
```js
// 错误：靠文本匹配，下拉切换后失效
document.querySelectorAll('button').forEach(b => { if (b.textContent.includes('导出')) b.onclick = ... });
// 正确：稳定 id + 事件委托
<button id="fb-export-btn">导出</button>
document.getElementById('fb-export-btn').addEventListener('click', exportFeedback);
// 列表/卡片用事件委托，避免只绑定初始 DOM
container.addEventListener('click', e => { const card = e.target.closest('.feedback-card'); if (card) openDetail(card); });
```
> 根因排查顺序：用户说"按钮没反应"先想 **GitHub Pages CDN 缓存**（bump cache-bust + 让用户硬刷新），再查 **ES module 漏 export**（node --check 不查跨文件导出，必须浏览器实测），最后查 **modal-overlay 缺 open 类导致 display:none**。

### 3.2 三层展示法（阶段 3）
- `.ai-status` 五态：idle / loading / success / partial / failed，AI 调用前后切换；
- Agent 抽屉 `#agent-drawer`：模型、I/O Token、耗时、重试、版本 seed；
- 活动日志 `#activity-panel`：状态点 + 时间戳 + adopted/edited/feedback 态。

### 3.3 Cloudflare Worker 密钥托管后端（阶段 8）
```js
// proxy-worker.js（部署到 Worker，Settings→Variables→Add Secret：ZHIPU_API_KEY）
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) return new Response('use /v1/chat/completions', {status:404});
    const target = 'https://open.bigmodel.cn/api/paas/v4' + url.pathname + url.search;
    const resp = await fetch(target, {
      method: request.method,
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${ZHIPU_API_KEY}` },
      body: request.body,
    });
    const h = new Headers(resp.headers); h.set('Access-Control-Allow-Origin','*');
    return new Response(resp.body, { status: resp.status, headers: h });
  }
};
```

### 3.4 callRealModel 超时 + 兜底
```js
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 25000);
try { resp = await fetch(`${baseUrl}/chat/completions`, { method:'POST', headers, signal: ctrl.signal, body }); }
catch (e) {
  if (/Failed to fetch|NetworkError|CORS/i.test(String(e.message)))
    throw new Error('CORS_BLOCKED: 浏览器被目标 API CORS 拦截，请填代理/后端地址或用 Groq 直连');
  throw new Error('ETIMEDOUT: 网络失败(' + e.message + ')');
}
```

### 3.5 受限并发执行器（Evals 提速）
```js
async function runEvalCases(cases, modelFn, { concurrency = 2, onProgress } = {}) {
  const results = new Array(cases.length); let idx = 0, done = 0;
  async function worker() {
    while (idx < cases.length) { const i = idx++; results[i] = await evalOne(cases[i], modelFn); done++; onProgress && onProgress(done, cases.length); }
  }
  await Promise.all(Array.from({length: concurrency}, worker));
  return results;
}
```

### 3.6 缓存破坏（GitHub Pages 必做）
- `index.html`: `<script type="module" src="ai-integration.js?v=2.2.8"></script>`
- `ai-integration.js`: `import ... from './ai-contract.js?v=2.2.8'`
- 每次改完 bump 末位版本号再 push。

---

## 4. 关键决策速查表

| 决策点 | 选 A | 选 B | 怎么选 |
|---|---|---|---|
| **PRD 时机** | 末期才写（跟着代码补） | **早期 from 想法**（先对齐范围） | 永远早期写初版，末期只更新对齐 as-built |
| **UI 设计载体** | Ardot/Figma 出高保真图 | **HTML 单文件直出（设计即出码）** | 有独立设计团队/切图标注/设计系统→Ardot；单人/AI构建/要活原型→HTML |
| **交付物·给设计** | UI 设计图 / Figma 链接 + PRD | （本管线无独立设计岗时，HTML 即设计） | 有设计岗给图+PRD；无则 HTML 原型替代设计图 |
| **交付物·给开发** | PRD+设计标注(redline/切图) | **PRD + HTML 原型**（最无歧义，照 DOM 实现） | HTML 原型是最高保真规格，开发/AI 直接复用 |
| 模型接入 | 直连 Groq（免 Worker，CORS 友好） | Worker 密钥托管后端（智谱/DeepSeek） | 想快→Groq；用国内模型/key 不下发→Worker |
| Key 存放 | 浏览器 localStorage（演示） | Worker Secret（生产） | 演示随便；上线必须后端托管 |
| 评估并发 | 串行（稳） | 并发 2-4（快） | 免费模型用 2，避免 429/超时 |
| 按钮修复 | byText 文本匹配 | 稳定 id + 事件委托 | **永远用 id + 委托**，byText 必踩坑 |
| "没反应"排查 | 直猜代码 bug | 先查 CDN 缓存→再查漏 export→再查 modal open 类 | 顺序别反 |
| Mock 定位 | 演示基线 | 评估对照 | 两者都是——mock 是确定性基线，真实模型是接入能力 |

---

## 5. 踩过的坑（按阶段，避免重蹈）

**阶段 0 · 想法具象化**
1. **跳过 PRD 直接出码**：想法没对齐就写 UI，做到一半发现范围理解偏差 → 先写 PRD/竞品对齐范围与优先级，再进 UI。

**阶段 5 · 按钮核查**
2. **byText 选择脆弱**：下拉切换后文案变化，文本匹配失效 → 换成稳定 id + 事件委托。
3. **GitHub Pages CDN 缓存**：本地改了但线上"按钮没反应"，其实是旧版 CDN 未刷新 → bump cache-bust + 让用户 Ctrl+Shift+R。
4. **ES module 漏 export**：`node --check` 不查跨文件导出，浏览器报 `does not provide an export named 'callRealModel'` 导致整个模块加载失败、所有 AI 按钮无响应 → 必须浏览器实测，关键导出加 `export`。
5. **modal-overlay 缺 open 类**：`.modal-overlay{display:none}` 仅靠 `.open` 解禁，生成时忘加 `open` 类 → 所有弹窗被隐藏 → showModal 改为 `className='modal-overlay open'`。
6. **跨脚本作用域**：两 `<script>` 非 module 共享全局词法作用域，第一脚本的 const/function 可在第二脚本直接用；跨脚本传值用 `window.__insightTopic` 之类全局。

**阶段 7 · 数据测试**
7. **测试预期虚高**：第 12 条"仅情绪无事实"原期望 emotion=negative，Mock 靠"差"字虚假命中满分，真实模型更诚实反而失分 → 期望改为 confidence='low'，让基线更严格、对比公平。
8. **"有帮助率"判定过严**：`confidence!=='low'` 把很多 ✓理解 判 ✗帮助 → 放宽到 `confidence!=='low' || risk_flag==='escalate'`，prompt 里校准 confidence 不盲目给 low。
9. **脏 JSON 容错必测**：测试集含 1 组脏 JSON，验证 repairJson→validate 返回 failed/JSON_UNPARSEABLE/retryable=true。

**阶段 8 · 真实模型**
10. **代理地址双斜杠** `//v1`：Worker 只认 `/v1/` → 404 → 填 `https://x.workers.dev/v1`（单斜杠）。
11. **后端模式漏判**：`if(!cfg.apiKey) 跳过真实模型` —— 密钥托管后浏览器端 apiKey 为空 → 加 `isBackend = !!cfg.proxyUrl` 判断。
12. **F12 打不开**：受限浏览器无法开开发者工具 → 加「测试连接」按钮在页面内显示错误，免 devtools。

**部署**
13. **线上 Pages 不刷新**：Git 同步 ≠ Pages 重 build → bump `?v=` 或空提交触发重 build + 用户硬刷新。
14. **Node ESM 测试桩**：需全局注入 window/document/localStorage DOM stub；Windows 路径用 `pathToFileURL('C:/...')`；heredoc 超长须分块 `cat >>`。

---

## 6. 简历/作品集叙事口径（顺手可用）

> 从 0 搭建 AI 产品：先用结构化澄清把模糊想法落地为 PRD + 竞品分析对齐范围，再以单 HTML 文件直出高保真可交互原型（设计即出码，跳过 Figma 翻译）；设计 AI 契约层（失败状态机 + repairJson 兜底）与三层展示法（状态/追溯/日志）；以"7 基础 + 6 亮点"UX 审计闭环，多轮死按钮消除保障交互可靠；建立 10–20 组测试 + 15 条边界用例的 Mock 基线 vs 真实模型（GLM-4-Flash，OpenAI 兼容 + 密钥托管后端）量化对比，格式稳定率 100%、理解/帮助均超 85%；据评估迭代超时重试 + 并发限速 + 置信校准；全站 localStorage 持久化。

---

_本管线可进一步注册成 Skill（/vibe-coding-pipeline 一键启动）。如需我把它固化成可复用 skill，告诉我即可。_
