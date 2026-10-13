# 第二轮 benchmark 后的修复与本地验证

日期：2026-10-12。分支：`cluade-sdk-bash`。

针对 r2 的报告口径混用、布局/交互验收低效、续跑请求预算耗尽和失败原因丢失进行修复。没有调用真实模型 API，没有重写旧报告、修改评分规则或生成正式安装包。r1、r2 的原始评分仍为 0/100、68/100。

## 改动

- **报告生成约束**：正文、KPI、图表、指标文件使用同一数据源；记录单位、期间、人群、来源与坐标；不同表口径不能直接拼接。环比、份额、峰值由程序计算，校验页面实际绑定数据，不能以指标文件正确代替页面正确。负值图表保留符号和零轴，因果推断要求证据。这些规则同时进入普通任务提示、Claude 主任务和其子任务。
- **卡片和弹层规则**：所有要求放大的卡片类型共用可访问的入口；优先 body 直属原生 dialog，限制宽高并内部滚动；使用组件专属类名，避免标题与 tooltip 共用短类名。重新预览时打开原 HTML 路径，避免复用上轮已关闭的本地服务 URL。
- **新增 `stable_browser audit`**：通过固定的只读 DOM 脚本返回视口、弹层边界/越界、隐藏标题及文字、隐藏原因对应的样式、零尺寸图表和横向溢出。共享浏览器和后备浏览器均支持；不用控制台诊断权限，不接受任意 JavaScript。保留只读限制、审批边界、取消及用户接管规则，不刷新已有元素 ref。
- **后台视口**：审计与截图共用隐藏渲染宿主，避免未挂载的 WebContentsView 返回不可靠尺寸。结束后清理临时宿主，不打开可见窗口。
- **预算与失败原因**：benchmark 从第 45/60 次请求开始向模型提示剩余次数及收尾要求；纠正生成和中断续跑共用原用例预算，仍为 60 次。超额在网络请求前终止，保留具体原因和失败状态，不再被覆盖为“任务已停止”，也不作为 502 反复重试。提醒不会重复累积到纠正请求中，未验收项目不得宣称通过。
- **修复旧测试前提**：内置工具端到端测试先通过真实 ToolSearch 发现 MCP 工具，再验证调用，不再假定延迟工具在首次请求中直接出现。

## 已验证

| 检查 | 结果 |
| --- | --- |
| 桥接、Harness、提示词、预算、执行监控、评分及工具权限 | 71 项通过 |
| 隐藏 Electron 页面回归 | 1 项通过；构造失败页面能定位隐藏文字、弹窗越界、零尺寸图表，修正版在 1280 和 375 CSS px 下均可打开/关闭且不越界 |
| 共享浏览器会话回归 | 1 项通过 |
| 内置工具及其桥接回归 | 2 项通过；真实 SDK → ToolSearch → MCP → 浏览器审计/Excel；保留隔离、审批、取消和临时打包布局检查 |
| 真实本地 SDK + 模拟 API | 3 项通过；无效参数纠正、连续纠正失败停止、跨续跑共享预算与失败原因/部分文件保留 |
| r2 原始 `revise-a` 报告只读复现 | 审计实际识别“CRM解决方案”“经营亮点”“经营问题”三个 `.tt` 文字块为 `opacity: 0`；原文件字节未变 |
| 旧结果与输入 | 两轮 96 个结果/产物文件建立只读哈希清单，并在修复收尾时复核；7 份运行内 Excel 副本均匹配 run.json 的原始输入哈希 |

合计 78 项自动测试通过，另完成原始报告的只读问题复现。最初受限沙箱下 SDK 本地桥接/Electron 启动失败；在宿主使用同样的本地模拟 API 与隐藏窗口后通过。没有使用真实 API 密钥。

复现命令（此分支目录，均不调用付费 API）：

```powershell
node --test tests/request-budget.test.cjs tests/claude-messages-bridge.test.cjs tests/claude-harness.test.cjs tests/run-progress.test.cjs tests/browser-command-route.test.cjs tests/claude-tools.test.cjs tests/report-benchmark.test.cjs tests/prompts.test.cjs tests/html-browser-route.test.cjs tests/shared-browser.test.cjs tests/builtin-tools.test.cjs
node --test --test-concurrency=1 --test-name-pattern='real SDK (request budget|corrects malformed|stops after failed)' tests/claude-sdk-integration.cjs
```

本地证据：

- `qa-artifacts/html-browser-route/audit-broken.json`
- `qa-artifacts/html-browser-route/audit-fixed-1280.json`
- `qa-artifacts/html-browser-route/audit-fixed-375.json`
- `qa-artifacts/html-browser-route/audit-report.json`（原始 r2 报告）
- `qa-artifacts/report-repair-r2/preserved-benchmark.json`

## 尚未验证的部分

生成规则属于模型执行约束，不能保证模型遵循，也没有新增能自动理解所有业务口径的数值判定器。布局审计只是当前文档前 3000 个元素、每类最多 40 条观察；有意折叠的标题也可能出现，需结合页面状态与截图判断，不能据此宣称完整视觉/数据验收通过。

这次没有真实模型重跑，不能证明数据混用、所有卡片覆盖或 60 次内收尾已经在 GLM-5.3-FLASHX 上改善，也没有新的 benchmark 得分。后续如获授权，应新建 run，沿用原用例和评分门槛验证，不能覆盖 r1/r2。
