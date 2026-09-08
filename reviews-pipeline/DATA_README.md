# 真实竞品评论评测集 · 数据说明

本目录的 `real-data.js` 是把「真实 AI 助手 App 的用户评论」归一化为 InsightLoop 的
`EVAL_CASES` / `FEEDBACKS` 覆盖数据，用于本地跑 **评估看板（Evals）** 与 **Demo 截图**。
本文档说明数据来源、数量、合规边界、选择偏差，以及指标如何解读——**务必在引用这些数字前读完**。

> 结论速览：Mock（演示基线）在 143 条真实跨 App 评论上的指标为
> **格式稳定率 100% / 任务理解率 66% / 有帮助率 21%**。
> 失败几乎全部可由两类真实短板解释：① 英文评论 Mock 完全无法解析（i18n 缺口）；
> ② 正面情绪 Mock 一律判为 neutral（正向盲区）。在「Mock 可解析的中文负向反馈」上，
> 任务理解率达 84–100%。这恰好论证了产品核心主张：**AI 输出必须可量化评测，且需要真实模型**。

---

## 1. 数据来源与数量

| App | 地区 | 条数 | 来源类型 | 是否含评分 | 溯源 |
|-----|------|-----|----------|-----------|------|
| ChatGPT | 美区 (us) | 50 | App Store 官方评论 RSS（iTunes `customerreviews`） | 含 1–5★ | `reviews-raw.json` |
| Kimi | 中国区 (cn) | 50 | App Store 官方评论 RSS | 含 1–5★ | `reviews-raw.json` |
| 豆包 | 中国区 (cn) | 14 | 公开报道 / 社媒转述的真实用户吐槽 | 无评分 | `normalize.py` 中 `CURATED`，附 URL |
| 元宝 | 中国区 (cn) | 16 | 公开报道 / 社媒转述的真实用户吐槽 | 无评分 | 同上 |
| DeepSeek | 中国区 (cn) | 13 | 公开报道 / 社媒转述的真实用户吐槽 | 无评分 | 同上 |
| **合计** | — | **143** | — | — | — |

- **抓取/参考日期**：2026-07-28（`EVAL_REF_DATE`，用于相对时间还原；本批真实评论不含相对时间线索，故时间维度未断言）。
- **豆包/元宝/DeepSeek 的 43 条** 来自公开报道与社媒（URL 见 `normalize.py` 的 `CURATED`，日期 2026-01 至 2026-05），均为对他人原话的转述，逐条保留了出处链接与日期，便于核查与归因。

---

## 2. 归一化方法（`normalize.py`）

真实评论 → `EVAL_CASES.expect`（评测断言）的规则，**刻意与 Mock 模型的可检测能力对齐**，以避免「标注比模型检测更宽」造成的伪失败：

- **emotion（情绪）**：以**文本内容为 ground truth**（不依赖星级）。
  - 命中攻击/客诉词 → `angry`；命中负面关键词 → `negative`；命中正面关键词 → `positive`；否则 `neutral`。
  - 负面/攻击词表**逐字对齐** Mock 的 `ANALYZE_FEEDBACK` 正则（`垃圾软件|愤怒|投诉|退款|骗|傻|滚|起诉|威胁|弃用|拉黑|再也不|曝光|投诉电话|消协|315|坑钱` 等）。
  - 正面词表（`好用/满意/喜欢/赞/棒…` 及英文 `love/great/amazing…`）**独立保留**——因为 Mock 没有正向检测，正面评论会如实判为 `neutral` 并记为失败，从而把「正向盲区」这个真实短板暴露出来。
- **risk（客诉升级）**：命中攻击词 → `escalate`，与 Mock 一致。
- **multi（多意图）**：命中 Mock 的 6 个可拆分方面（导出/报表、搜索、登录、通知、深色模式、批量操作）≥2 个 → `true`，与 Mock 的 `extractSubIntents` 对齐。
- **不断言 `source` / `time` / `confidence`**：
  - Mock 对单意图评论的 `problem_source` 恒为 `待确认`（仅多意图才回填），断言只会制造伪失败；
  - 真实评论无相对时间线索，Mock 返回 `待确认`；
  - `confidence` 口径（是否命中已知方面）与评测断言无关。
  - 这三项从真实集断言中剔除，仅作为模型内部字段参与 `有帮助率` 计算。

### 人工标签修订

- 启发式初始标签不是人工金标。2026-09-07 对 Kimi 50 条完成单人初审并由项目负责人确认；相对当时评测集修订 29 条。
- 修订依据保存在 `label-revisions-2026-09-07.json`，生成脚本会先校验 `old` 再应用 `new`，避免静默覆盖或数据漂移。
- 修订清单包含 ChatGPT #29、Kimi 人工复核批次，以及 2026-09-08 确认的豆包/元宝/DeepSeek 批次，共 63 条覆盖记录。每条均保留旧标签、新标签和修订理由。
- 该流程不是独立盲审，不能声称为双人标注一致性或完整人工金标。

---

## 3. 合规与边界（ToS / PII）

- 仅使用**公开可访问**内容：App Store 公开评论 RSS、公开发布的新闻/社媒报道。
- **不搬运可识别个人信息（PII）**：`FEEDBACKS` 中的 `user` 为脱敏序号（`#U6xxx`），不含昵称、邮箱、设备号等。
- 豆包/元宝/DeepSeek 的吐槽为**他人原话的公开转述**，已逐条标注来源 URL 与日期，非本仓库原创，亦非对厂商的定性结论。
- 用途限定：**本地 Eval / Demo 演示，非商业分发**。如需对外发布，请再次确认各来源的最新 ToS 与转载授权。

---

## 4. 选择偏差（Selection Bias）——读数字前必看

- **美区 ChatGPT 评论偏英文、偏正面**：App Store 高分评论占比天然高，且 Mock 无法解析英文，因此 ChatGPT 这 50 条对 `任务理解率` 拖累最大（仅 22%），**这不代表 ChatGPT 产品本身好评率低，只代表 Mock 基线看不懂英文**。
- **中国区 App Store RSS 在本环境返回 0 条**（Apple 对中国区 `customerreviews` 接口的限制，已实测微信/抖音同样为 0）。因此豆包/元宝/DeepSeek **改用公开报道/社媒转述补充**——这引入了**媒体 framing 偏差**（报道更聚焦负面与争议），不能代表这三款 App 的全量用户情绪。
- **样本非随机、非全量**：143 条是「能抓到 + 能补充」的便捷样本，用于演示评测管线与方法，不应作为任何 App 的满意度统计结论。
- **建议**：若要对外宣称某 App 的满意度，需走官方/授权数据渠道并做随机抽样。

---

## 5. 指标解读（本次结果）

评估看板三项指标定义（见 `ai-integration.js`）：
- **格式稳定率 fmt**：模型输出可被解析且通过 schema 校验（非 `failed`）的占比。
- **任务理解率 under**：至少一条预期维度被正确抽取（情绪/风险/多意图/来源/时间）的占比。
- **有帮助率 help**：输出格式稳定 **且**（模型置信度非 `low` **或** 命中客诉升级）的占比——即「可直接据此行动」的比例。

本次结果（Mock 演示基线，143 条）：

| 指标 | 数值 | 解读 |
|------|------|------|
| 格式稳定率 | **100%** | Mock 始终产出合法结构化 JSON，结构性可靠。 |
| 任务理解率 | **66%** | 对可解析的中文负向反馈 84–100% 准确；失败集中在英文(39) 与正面(10)。 |
| 有帮助率 | **21%** | 仅 21% 被 Mock 标为「高置信/可行动」，多数反馈落入「低置信、需人工确认」。 |

**按 App 拆分**（n / under% / help%）：

| App | n | under | help |
|-----|---|-------|------|
| ChatGPT (英文) | 50 | 22% | 0% |
| Kimi (中文) | 50 | 84% | 38% |
| 豆包 (中文) | 14 | 93% | 36% |
| 元宝 (中文) | 16 | 100% | 31% |
| DeepSeek (中文) | 13 | 92% | 8% |

**失败归因（49 条未理解）**：英文无法解析 = 39，正面情绪盲区 = 10，中文负向误判 = **0**。
即：在 Mock 具备词汇覆盖的中文负向反馈上，任务理解已接近上限；剩余差距 100% 可解释为两类真实模型短板。

**结论**：这组数字不是「Mock 很烂」，而是「Mock 作为演示基线，其能力边界被量化地暴露出来」——
它看不懂英文、识别不了正面、对陌生方面只能给低置信。这正是 InsightLoop 主张
「上线前用可量化 Eval + 接真实模型」的硬证据。

---

## 6. 复现步骤

```bash
# 1) 归一化（读 reviews-raw.json + CURATED -> real-data.js / reviews-raw.merged.json）
python normalize.py

# 2) 起本地静态服务器（ES module 需 http，不能用 file://）
#    在项目根目录： python -m http.server 8139
#    然后浏览器/Playwright 访问 http://127.0.0.1:8139/index.html

# 3) 跑评测 + 导出 Demo 截图（需 playwright，已装在 managed workspace）
NODE_PATH=<managed>/node/workspace/node_modules node run_real_eval.cjs
# 产出：eval-dashboard-real.png / insights-real.png / opportunities-real.png
#      eval-results-real.json（逐条审计：expect vs got，用于核验失败归因）
```

## 7. 文件清单

- `scrape_reviews.py` —— 解析 trackId + 抓 App Store 评论 RSS。
- `normalize.py` —— 真实评论 → `EVAL_CASES`/`FEEDBACKS` 覆盖数据（本文档所述规则）。
- `real-data.js` —— 生成的覆盖数据（`window.__EVAL_CASES__` / `window.__FEEDBACKS__`）。
- `reviews-raw.json` —— 抓到的 100 条 App Store 评论（ChatGPT 50 / Kimi 50）。
- `reviews-raw.merged.json` —— 100 + 43 条合并溯源文件。
- `run_real_eval.cjs` —— Playwright 跑评测看板 + 批量分析 + 截图。
- `eval-results-real.json` —— 逐条评测结果（审计用）。
- `eval-dashboard-real.png` / `insights-real.png` / `opportunities-real.png` —— Demo 截图。
