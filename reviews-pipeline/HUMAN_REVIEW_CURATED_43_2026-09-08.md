# 豆包、元宝、DeepSeek 43 条情绪标签初审（2026-09-08）

> 输入：`insightloop-eval-audit-2026-09-07 (3).json`，评测配置 `mixed-v1 / temperature=0 / concurrency=2`。
> 这是**可见模型输出的单人初审候选标签**，不是双人独立盲标金标，不能作为对外准确率结论。

## 证据边界

- #101–#143 来自公开报告或社交媒体材料的整理与转述，不等同于 App Store 原始逐条评论。
- 这些样本适合检查产品能否识别明确的问题陈述，但不能代表豆包、元宝或 DeepSeek 的总体用户满意度。
- 初审时能够看到旧标签和 GLM 输出，存在确认偏差；只有项目负责人确认后，候选标签才可进入版本化修订文件。

## 统一口径

- `positive`：明确肯定，且没有实质性问题主诉。
- `neutral`：事实、询问或信息不足，没有明确褒贬。
- `negative`：净态度为不满，明确描述缺陷、任务受阻或服务失败，但未达到强烈辱骂、威胁或明确弃用。
- `mixed`：对当前产品有实质性肯定，同时提出具体问题或改善点；历史上曾经好用不自动构成 mixed。
- `angry`：强烈辱骂、威胁、明显愤怒或明确弃用。当前 Eval 将 `negative/angry` 视为同一负面大类。

## 逐条初审

| # | 来源 | 原文摘要 | 旧标签 | GLM | 候选标签 | 初审理由 |
|---:|---|---|---|---|---|---|
| 101 | 豆包 | 逻辑漏洞、精度不足、长文不稳、胡编案例 | negative | negative | negative | 多项明确缺陷。 |
| 102 | 豆包 | 幻觉突出、多个不同错误答案 | negative | negative | negative | 明确准确性失败。 |
| 103 | 豆包 | 只能陪聊，不能作为生产力工具 | negative | negative | negative | 核心任务价值不达预期。 |
| 104 | 豆包 | 敷衍糊弄、嬉皮笑脸且不改正 | neutral | negative | negative* | 强烈不满，但未出现威胁或弃用。 |
| 105 | 豆包 | 文案需人工大改、出现幻觉 | neutral | negative | negative | 明确质量问题。 |
| 106 | 豆包 | 答非所问、逻辑混乱、信息错误 | negative | negative | negative | 多项任务失败。 |
| 107 | 豆包 | 长文本不稳、复杂问题翻车 | neutral | negative | negative | 明确稳定性问题。 |
| 108 | 豆包 | 基础功能未做好便收费 | neutral | negative | negative | 对付费策略明确不满。 |
| 109 | 豆包 | 宣称永久免费却收费，信任崩塌 | neutral | negative | negative* | 强烈指责，但没有直接辱骂或威胁。 |
| 110 | 豆包 | 付费后速度、质量未提升且卡顿出错 | negative | negative | negative | 付费体验未达预期。 |
| 111 | 豆包 | 价格近三倍，体验未达顶级 | positive | negative | negative | 比价语境下明确认为不值。 |
| 112 | 豆包 | 先做好基础功能，再考虑收费 | neutral | neutral | negative | 建议背后有明确的当前体验缺口。 |
| 113 | 豆包 | “豆包笨还收费” | neutral | negative | angry* | 直接辱骂并叠加收费不满；是否达到 angry 需确认。 |
| 114 | 豆包 | 产品能力配不上定价 | neutral | negative | negative | 明确价值不匹配。 |
| 115 | 元宝 | 怀疑以量化版节省成本 | neutral | negative | negative | 对实际质量与诚信表达不满。 |
| 116 | 元宝 | token 限制、缺多步搜索，严重影响体验 | negative | negative | negative | 明确功能缺失及后果。 |
| 117 | 元宝 | 同类中只有元宝算错税务答案 | negative | negative | negative | 明确事实性失败。 |
| 118 | 元宝 | 回答出现事实性错误 | negative | negative | negative | 明确准确性失败。 |
| 119 | 元宝 | 太难用、人工智障、不想再开 | neutral | angry | angry | 辱骂并明确弃用。 |
| 120 | 元宝 | 无法联系上下文、拖沓、体验差 | negative | negative | negative | 多项明确缺陷。 |
| 121 | 元宝 | 会员不到账、缺暗黑模式、协议不合理 | neutral | negative | negative | 多项服务和功能问题。 |
| 122 | 元宝 | 视频中不存在的零件状态被描述出来 | neutral | negative | negative | 可核查的幻觉案例。 |
| 123 | 元宝 | 群投票结果多处统计错误 | neutral | negative | negative | 可核查的任务失败。 |
| 124 | 元宝 | 多文件效果随缘，常无法读取 | negative | negative | negative | 明确稳定性问题。 |
| 125 | 元宝 | 将 AI 假截图判断为真实 | neutral | negative | negative | 图片鉴真任务失败。 |
| 126 | 元宝 | 操作路径太长，并非一键 | neutral | negative | negative | 明确交互不满。 |
| 127 | 元宝 | 中文语境水土不服，忽略上下文 | neutral | negative | negative | 明确语境理解问题。 |
| 128 | 元宝 | 编造代言事实，追问后承认没有 | neutral | neutral | negative | 明确描述幻觉且使用“严重”评价。 |
| 129 | 元宝 | 营销号味、浮夸、全是废话 | neutral | negative | negative | 强烈负面评价及无用性判断。 |
| 130 | 元宝 | “像个没读过书的 DeepSeek” | neutral | negative | angry* | 带直接侮辱；是否达到 angry 需确认。 |
| 131 | DeepSeek | 白天代码一遍过，深夜需反复修改 | positive | negative | negative* | 项目负责人确认以夜间能力下降这一核心主诉判为负面。 |
| 132 | DeepSeek | 容易遗忘前两轮要求 | neutral | negative | negative | 明确记忆问题。 |
| 133 | DeepSeek | 套话变多、分析变少 | neutral | negative | negative | 明确质量退化。 |
| 134 | DeepSeek | 一年前有启示，现在套话收尾 | neutral | neutral | negative* | 主诉针对当前版本；历史好评不自动构成 mixed。 |
| 135 | DeepSeek | 套路、无增量、换汤不换药 | neutral | negative | negative | 明确内容无价值。 |
| 136 | DeepSeek | 专家模式无法上传文件 | negative | negative | negative | 功能不可用。 |
| 137 | DeepSeek | 长文本 PDF 超出能力范围 | neutral | negative | negative | 目标任务被阻断。 |
| 138 | DeepSeek | 多次因崩溃登上热搜 | neutral | negative | negative | 对稳定性失败的负面陈述。 |
| 139 | DeepSeek | 服务器繁忙、服务不稳定 | neutral | negative | negative | 明确稳定性问题。 |
| 140 | DeepSeek | 当机近 12 小时并导致资料遗失 | neutral | negative | negative | 严重服务失败及实际损失。 |
| 141 | DeepSeek | “这就是当年被捧上神坛的人工智能吗” | neutral | neutral | negative* | 反问形成讽刺性差评；脱离语用才会被误判为中性。 |
| 142 | DeepSeek | “人工智障，崩了也罢” | neutral | angry | angry | 直接辱骂并带放弃态度。 |
| 143 | DeepSeek | 关键时刻出状况，付费用户转用竞品 | neutral | negative | negative | 服务失败并造成流失。 |

`*` 表示建议由项目负责人明确确认的边界样本。

## 初审结果

- 旧标签与候选标签完全一致：**11/43**。
- 建议修订旧标签：**32/43**；主要问题是规则型旧标签把明确负面陈述标为 `neutral`。
- GLM 与候选标签完全一致：**37/43**。
- 按现有 Eval 的负面大类口径（`negative ≈ angry`），GLM 与候选标签一致：**39/43**。
- GLM 的 4 个负面大类未命中为 #112、#128、#134、#141，均将隐含或语用层面的负面表达判为 `neutral`。
- 上述数字只用于定位数据与模型问题。由于标签由可见模型输出的单人初审产生，**不能对外称为人工准确率**。

## 负责人确认结果

项目负责人于 2026-09-08 确认：#104 `negative`、#109 `negative`、#113 `angry`、#130 `angry`、#131 `negative`、#134 `negative`、#141 `negative`。

32 条修订已写入版本化标签文件；下一步在同一固定配置上重跑。本轮不改 Prompt，以便把标签校准效应与模型改动分开。
