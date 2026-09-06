# 评测人工复核：第 1 批（20 条）

> 目的：诊断「任务理解未命中」中的规则标签问题与模型问题，决定是否值得改 Prompt。
> 本文是**单人初审记录**，不是独立双人标注金标，也不是模型效果结论。

## 复核边界

- 输入：`insightloop-eval-audit-2026-09-03.json` 中真实模型 GLM-4-Flash 的 143 条导出结果。
- 抽样：从 68 条 `understood=false` 中，按平台各取 4 条（ChatGPT / Kimi / 豆包 / 元宝 / DeepSeek）。这是诊断抽样，不代表 68 条的比例。
- 方法：只读原始评论后先给出暂定情绪判断，再与旧期望标签、模型输出比对；不把模型输出当答案。
- 标签含义：`positive` 明确好评；`negative` 有明确问题/受限/不满；`angry` 含强烈辱骂或愤怒；`neutral` 仅客观描述或轻微建议；无法判断则应是 `待确认`。

## 逐条初审

| # | 平台 | 原文摘要 | 旧期望 → 模型 | 初审判断 | 归因 | 依据 |
|---:|---|---|---|---|---|---|
| 8 | ChatGPT | “Its creepy… recommend not using” | positive → neutral | negative | 旧标签错；模型也偏弱 | 明确不建议使用，属于负面体验。 |
| 13 | ChatGPT | “Excelente。Gran herramienta!!” | neutral → positive | positive | 旧标签错，模型合理 | 明确“很棒的工具”。 |
| 29 | ChatGPT | 先说好用，后说长对话被限制 | negative → neutral | negative | 模型误判候选 | 具体功能限制妨碍连续使用；前半句好评不应覆盖缺陷。 |
| 46 | ChatGPT | 月付后触达附件周限额、加价 | positive → negative | negative | 旧标签错，模型合理 | 对付费限制明确不满。 |
| 52 | Kimi | “太垃圾…4.9 分水分 99%” | neutral → angry | angry | 旧标签错，模型合理 | 强烈贬损与愤怒表达。 |
| 54 | Kimi | “根本没法用” | neutral → negative | negative | 旧标签错，模型合理 | 明确无法使用。 |
| 56 | Kimi | K3 不错，但思考回复有些长 | negative → positive | 待第二复核 | 混合反馈 | 有好评也有具体性能问题；需先统一“主诉优先/混合标签”规则。 |
| 57 | Kimi | 十分钟无回复、“啥垃圾玩意儿” | neutral → angry | angry | 旧标签错，模型合理 | 具体故障叠加强烈辱骂。 |
| 103 | 豆包 | “只能陪聊不能干活” | negative → neutral | negative | 模型误判候选 | 明确否定生产力任务能力。 |
| 104 | 豆包 | 被发现问题后敷衍道歉且不改 | neutral → negative | negative | 旧标签错，模型合理 | 明确负面评价和不满。 |
| 105 | 豆包 | 文案需人工大改，出现幻觉 | neutral → negative | negative | 旧标签错，模型合理 | 明确质量缺陷与返工成本。 |
| 107 | 豆包 | 长文本不稳定、复杂问题易翻车 | neutral → negative | negative | 旧标签错，模型合理 | 明确稳定性问题。 |
| 119 | 元宝 | “太难用…人工智障” | neutral → angry | angry | 旧标签错，模型合理 | 强烈辱骂/愤怒。 |
| 121 | 元宝 | 会员不到账、缺暗黑模式、协议不合理 | neutral → negative | negative | 旧标签错，模型合理 | 多项明确产品问题。 |
| 122 | 元宝 | 视觉理解弱，出现 AI 幻觉 | neutral → negative | negative | 旧标签错，模型合理 | 明确能力缺陷。 |
| 123 | 元宝 | 工作群投票统计多项数错 | neutral → negative | negative | 旧标签错，模型合理 | 明确准确性故障。 |
| 131 | DeepSeek | 深夜“降智”，代码需反复修改 | positive → negative | negative | 旧标签错，模型合理 | 明确时段性质量下降。 |
| 136 | DeepSeek | 专家模式无法上传文件、不支持 | negative → neutral | negative | 模型误判候选 | 明确任务不支持。 |
| 139 | DeepSeek | 服务器繁忙、服务不稳定 | neutral → negative | negative | 旧标签错，模型合理 | 明确稳定性问题。 |
| 140 | DeepSeek | 当机近 12 小时、资料大量遗失 | neutral → negative | negative | 旧标签错，模型合理 | 严重稳定性故障。 |

## 初审计数（仅限本批 20 条）

| 初审结论 | 条数 | 如何处理 |
|---|---:|---|
| 旧标签错，模型合理 | 15 | 候选标签修订；不用于 Prompt 调优。 |
| 旧标签错且模型也未正确判出 | 1 | 标签修订，同时保留为模型边界案例。 |
| 规则标签大体正确、模型误判候选 | 3 | 可作为 Prompt 改动的最小依据。 |
| 混合反馈/待第二复核 | 1 | 先定义标注规则，再决定金标。 |
| 合计 | 20 | 诊断样本，不外推至全量。 |

## 这次只做的 Prompt 改动

针对 #29、#103、#136 的共同模式，在 `ai-contract.js` 的情绪规则新增一条：

> 文本明确表示任务无法完成、不支持、受限，或“先肯定、后给出具体阻断缺陷”时，按 `negative`；不能因前半句赞美忽略缺陷。

这是一项单变量改动。**尚未重跑真实模型，不能声称指标提升。**

## 下一步：用户只需确认 5 条

请在界面或导出的 JSON 中确认以下 5 条的“应有情绪”，即可把初审变成可用的候选金标：

1. #8：`negative`（隐私感不适且不推荐使用）
2. #29：`negative`（长对话被限制）
3. #56：选择 `positive`、`negative` 或新增 `mixed`；当前契约不支持 mixed
4. #103：`negative`（只能陪聊、不能完成工作）
5. #136：`negative`（不支持文件上传）

确认后，再只修这些标签并用相同 143 条重跑。该结果只能叫“同一评测集回归”，不能叫泛化提升；要证明泛化，需要保留独立未见样本。
