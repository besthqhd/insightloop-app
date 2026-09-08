# Evals 运行产物

每次运行会生成同名的三份文件：`*.metadata.json`（模型、代码版本、指标定义与限制）、`*.results.json`（逐例审计）和 `*.png`（看板截图）。产物不含 API Key。

默认安全运行 Mock：

```powershell
python -m http.server 8139
$env:INSIGHTLOOP_URL = 'http://127.0.0.1:8139/index.html'
node reviews-pipeline/run_real_eval.cjs
```

真实 GLM 运行必须显式设置开关。推荐使用密钥托管代理：

```powershell
$env:INSIGHTLOOP_USE_REAL = '1'
$env:INSIGHTLOOP_MODEL = 'glm-4-flash'
$env:INSIGHTLOOP_PROXY_URL = 'https://<your-worker>/v1'
node reviews-pipeline/run_real_eval.cjs
```

只有真实运行生成的逐例文件才能作为 100% / 53% / 99% 等指标的审计证据；本说明不是结果证据。请勿提交 API Key、PII 或未经审阅的输出。

## 独立真实用户测试集

`run_user_test_pipeline.cjs` 使用 `real-user-test-v1.json` 运行 InsightLoop 的 5-Agent 串行链路，不替换原 143 条竞品评测集：

```powershell
$env:INSIGHTLOOP_URL = 'http://127.0.0.1:8139/index.html'
$env:INSIGHTLOOP_MODEL = 'glm-4-flash'
$env:INSIGHTLOOP_PROXY_URL = 'https://<your-worker>/v1'
node reviews-pipeline/run_user_test_pipeline.cjs
```

数据文件明确区分 `participant_count` 与 `record_count`。结果中的模型输出是待人工审核草稿；结构化契约通过不代表计数、占比、优先级或技术建议正确。
