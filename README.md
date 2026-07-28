# InsightLoop · AI 产品迭代闭环工作台

> 一个能够从用户反馈中发现高价值问题，并推动产品完成迭代验证的 AI 产品经理助手原型。

🌐 **在线演示**：https://besthqhd.github.io/insightloop-app/

---

## 这是什么

InsightLoop 把「反馈 → 洞察 → 机会 → 上线验证」的产品迭代闭环搬到一处，让 AI 充当**证据提供者**与**草稿生成器**（不替代人的决策）：

- **反馈中心**：导入、筛选、查看用户反馈，一键批量 AI 聚类。
- **洞察看板**：问题主题聚类、频次/趋势、用户原话证据、多 Agent 分析过程溯源。
- **机会工作区**：把高价值洞察转为机会卡片，AI 生成 PRD / 验收标准 / 埋点 / 任务拆解。
- **上线效果**：记录基线、对比上线前后指标，AI 生成复盘与下轮建议。

## 关键设计

- **AI 接入契约层**：每个 AI 能力都有唯一 `capability` 与固定 JSON `SCHEMA`，Prompt 强约束只输出 JSON，并带有失败状态机（脏 JSON 修复 → 校验 → 重试/降级 → 中文错误）与版本化重生（`variationSeed`）。
- **三层展示法（AI 协同状态）**：① 内联状态徽标（待生成/生成中/已生成/部分生成/生成失败）② Agent 追溯抽屉（模型、Token、耗时、重试、seed）③ 顶栏活动日志（铃铛汇总）。失败统一以「红色横幅 + 重新生成 + 查看日志」呈现，杜绝静默失败。

详细需求见 [`InsightLoop_PRD.md`](./InsightLoop_PRD.md)。

## 仓库结构

```
.
├── index.html          # 四页单文件应用（1440px 等比缩放，纯 CSS/原生 JS，零外部资源）
├── ai-contract.js      # AI 接入契约层：固定 JSON、8 个 SCHEMAS、失败状态机、重生
├── ai-integration.js   # 前端联调层：mock 模型 + 三层展示法渲染（loading/失败/重生）
├── InsightLoop_PRD.md  # 产品需求文档（v1.1，与已实现 UI/功能对齐）
└── README.md
```

## 本地运行

> 因使用了 ES module，建议起本地静态服务而非直接 `file://` 打开。

```bash
# 在项目根目录
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

## 接入真实模型

原型用 `mockModel` 按契约返回固定 JSON，仅用于验证交互与状态系统。生产化只需：

1. 在 `ai-integration.js` 中用真实 `callRealModel` 替换 `mockModel`；
2. 读取 `ai-contract.js` 的 `buildContext` / `buildSystemPrompt` 输出调用模型；
3. 将模型回传的 JSON 交给 `repairJson` + `validate` 处理，其余 UI 与契约层无需改动。

## 现状与边界

- ✅ 已完成：四页可交互原型、AI 契约层、三层展示法、GitHub Pages 托管。
- ❌ 未做（生产化方向）：真实大模型 API、后端服务、RAG 证据库、多用户与评测后台。

详见 PRD 第 12–14 节。

## 许可证

本项目为原型演示，仅供学习与评审使用。
