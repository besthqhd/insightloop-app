# Kimi 50 条情绪标签初审（2026-09-07）

> 输入：`insightloop-eval-audit-2026-09-07 (1).json`，评测配置 `mixed-v1 / temperature=0`。
> 这是**单人初审候选标签**，不是双人独立标注金标，也不能作为对外准确率结论。

## 统一口径

- `positive`：明确肯定，且没有实质性问题主诉。
- `neutral`：事实、询问或信息不足，没有明确褒贬。
- `negative`：净态度为不满，明确描述缺陷、任务受阻或服务失败，但未达到强烈辱骂/威胁。
- `mixed`：对当前产品有实质性肯定，同时提出具体、建设性的改善点；历史上曾经好用或“偶尔有用”不自动构成 mixed。
- `angry`：强烈辱骂、威胁、明显愤怒或明确弃用。当前 Eval 将 `negative/angry` 视为同一负面大类。

## 逐条初审

| # | 原文摘要 | 旧标签 | GLM | 候选标签 | 初审理由 |
|---:|---|---|---|---|---|
| 51 | 非常好用、审美在线 | positive | positive | positive | 明确好评。 |
| 52 | 太垃圾、4.9 分水分 99% | neutral | angry | angry | 强烈贬损。 |
| 53 | 错误数据、拒不承认、“没有屁用” | negative | angry | angry | 具体故障叠加强烈愤怒。 |
| 54 | 根本没法用 | neutral | negative | negative | 明确不可用。 |
| 55 | 已用微信仍要求绑定 | neutral | negative | negative | 对重复绑定流程不满。 |
| 56 | K3 名列前茅，但回复时间长 | mixed | positive | mixed | 已由用户确认：肯定 + 改善建议。 |
| 57 | 十分钟无回复、“垃圾玩意儿” | neutral | angry | angry | 故障叠加强烈辱骂。 |
| 58 | 不知道 | neutral | neutral | neutral | 无可判断态度；低置信度合理。 |
| 59 | 有客服电话或邮箱吗 | neutral | neutral | neutral | 服务渠道询问。 |
| 60 | AI 摆烂、问题多次不能纠正 | negative | negative | negative | 明确能力问题。 |
| 61 | 不支持 Mac，但认可做法 | neutral | mixed | mixed | 当前产品肯定与平台限制并存。 |
| 62 | 新版鸡肋、偏收费；以前体验好 | neutral | mixed | negative* | 核心评价针对当前版本且明显不满；历史好评是让步。 |
| 63 | 死机、不回答、“太垃圾” | neutral | angry | angry | 明确故障和辱骂。 |
| 64 | 很可以，但高峰算力不足、慢 | negative | mixed | mixed | 当前产品肯定 + 具体性能问题。 |
| 65 | 满屏充值、不充值用不了 | neutral | negative | negative | 明确付费墙阻断。 |
| 66 | “最强大的 AI，像人的大脑” | positive | neutral | positive* | 字面为强肯定，但表达较空泛。 |
| 67 | 比多数 AI 好，唯一缺点算力不足 | neutral | mixed | mixed | 明确好评 + 单一缺点。 |
| 68 | 文笔好，但频繁排队、打断且不严谨 | neutral | mixed | negative* | 负面主诉占主导，好评为让步。 |
| 69 | 特别卡、进不去、比豆包差 | negative | negative | negative | 明确不可用和比较性差评。 |
| 70 | 记忆差、不主动搜索、变成对话机器 | neutral | mixed | negative* | 当前体验长篇负面；没有清晰的当前产品肯定。 |
| 71 | 还可以、喜欢、真的不错 | negative | positive | positive | 明确好评。 |
| 72 | 编造数据、付费慎重、已弃用 | angry | negative | angry* | 严重问题并明确弃用；负面大类判定一致。 |
| 73 | 首问即排队，半小时仍不可用 | neutral | negative | negative | 明确服务不可用。 |
| 74 | 垃圾、断开、三天不改就处理 | negative | angry | angry | 辱骂并带威胁。 |
| 75 | 非常丝滑，符合预期 | neutral | positive | positive | 明确好评。 |
| 76 | 难用，免费和付费都“垃圾” | neutral | negative | angry | 强烈贬损；负面大类判定一致。 |
| 77 | 是否为月之暗面公司 | neutral | neutral | neutral | 身份询问；低置信度合理。 |
| 78 | 隐形门槛、把用户当傻子并列出诉求 | angry | negative | angry* | 强烈指责；负面大类判定一致。 |
| 79 | 很棒、适合拓展思维 | positive | positive | positive | 明确好评。 |
| 80 | 吃相难看、免费版被堵死 | neutral | negative | angry* | 强烈指责付费策略；负面大类判定一致。 |
| 81 | 多次拒绝执行搜索指令 | neutral | negative | negative | 明确任务失败。 |
| 82 | 很棒、支持 | positive | positive | positive | 明确好评。 |
| 83 | 整体非常好，建议增加删除功能 | neutral | positive | mixed* | 明确肯定 + 具体改善建议。 |
| 84 | 想钱想疯、慢得要死 | negative | negative | angry | 强烈愤怒；负面大类判定一致。 |
| 85 | 很有情感，能化解疑惑 | neutral | positive | positive | 明确好评。 |
| 86 | 排队后引导会员、“什么垃圾” | neutral | angry | angry | 强烈辱骂。 |
| 87 | 恶心、吹牛、没有实力 | positive | negative | angry | 强烈辱骂；负面大类判定一致。 |
| 88 | K3 付费才可用，所以别用 | neutral | negative | negative | 明确付费限制和不推荐。 |
| 89 | 会员好用、支持收费 | positive | positive | positive | 明确好评。 |
| 90 | 搜索能力最强，但高峰慢 | negative | mixed | mixed | 当前产品强肯定 + 具体性能问题。 |
| 91 | 当前访问量过多…… | neutral | neutral | neutral | 更像错误提示复述，态度不足。 |
| 92 | 体验糟糕、回复中断 | negative | mixed | negative* | 没有实质正面评价，“慢没关系”只是让步。 |
| 93 | 垃圾软件 | angry | angry | angry | 强烈辱骂。 |
| 94 | 更严谨专业，希望提高算力 | positive | positive | mixed* | 明确肯定 + 具体改善建议。 |
| 95 | 差、差劲 | negative | negative | negative | 明确差评但无具体事实；低置信度合理。 |
| 96 | 未体验就要钱、“坑钱” | angry | negative | angry | 强烈指责；负面大类判定一致。 |
| 97 | 真的很好用、为中国 AI 加油 | positive | positive | positive | 明确好评。 |
| 98 | 我要升级会员、让我付费 | neutral | neutral | neutral* | 付费意图，不等同于产品好评。 |
| 99 | 不交钱一个问题也问不了 | neutral | negative | negative | 明确付费墙阻断。 |
| 100 | 客观评论命理、阐述佛法 | neutral | neutral | neutral | 无明显褒贬。 |

`*` 表示初审边界样本；项目负责人已于 2026-09-07 全部确认。该过程不是独立盲审。

## 初审结果

- 旧标签与候选标签完全一致：**21/50**。
- 建议修订旧标签：**29/50**。
- GLM 与候选标签完全一致：**35/50**。
- 按现有 Eval 的负面大类口径（`negative ≈ angry`），GLM 与候选标签一致：**42/50**。
- 后两项只用于定位问题；由于初审时可见模型输出，存在确认偏差，不能对外称为人工准确率。

## 用户已确认的 8 条

1. #62：`negative`
2. #66：`positive`
3. #68：`negative`
4. #70：`negative`
5. #72：`angry`
6. #80：`angry`
7. #94：`mixed`
8. #98：`neutral`

确认后已通过 `label-revisions-2026-09-07.json` 修订评测金标；本轮不调整 Prompt。
