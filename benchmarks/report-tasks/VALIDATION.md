# 本次框架验证（2026-10-12）

本记录验证 benchmark 能准备、编排和评分，不是实际模型表现。**真实模型 API 调用数为 0，六个业务用例的真实成绩均未运行。**

| 检查 | 结果 | 证据 |
|---|---|---|
| 用例/评分单元测试 | 7 / 7 通过 | `node --test tests/report-benchmark.test.cjs` |
| 两份真实输入的独立数值核对 | 64 / 64 一致，原件哈希未变 | 用 openpyxl 独立读取，核对 xlsx 库生成的 oracle；本地 `oracle-verification-v1.json` |
| 运行器离线端到端检查 | 六例编排完成 | `tests/fixtures/report-benchmark-smoke.cjs` 替代模型 runner；本地 `smoke-v2/SMOKE_ONLY.txt` |
| 后台浏览器 | 真实本地 HTML 打开、隐藏 PNG 截图成功 | 离线检查调用实际 BuiltinTools / BrowserSessionService，无可见窗口 |
| 检查点恢复 | 收到 Write 完成后取消，第二次调用继续，保留检查点 | `smoke-v2/cases/resume-b/record.json` |
| 待评审保护 | 六例人工分、总分、通过状态均保持 null | `smoke-v2/score-pending-review.json`；模拟产物的机器满分不代表真实模型满分 |
| 128k / 200k / 1M 自动压缩 | 三种容量全部通过 | 本地 `context-check-host-v1.json` |

每种压缩用例使用真实 SDK 与 7 次本地模拟模型响应，触发 1 次压缩，保留指定上下文后继续响应。测试结束用量均为 10,390 tokens；这是人为设计的测试响应，不应外推真实报告的压缩比例。

受限环境的首次压缩测试超时，宿主环境复测通过。首次隐藏截图出现 `UnknownVizError`，运行器改用软件渲染后通过，并处理了临时截图窗口关闭导致进程提前退出的问题。失败记录保留在本地，不覆盖为成功。

本地证据根目录：`D:\stable\.local\cluade-sdk-bash\.local\report-benchmark`。真实 Excel、oracle、来源路径与模拟运行产物不提交 Git。后续真正比较模型时须创建新的 run 目录，不能使用 smoke 目录作为模型成绩。
