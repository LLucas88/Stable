# GLM 执行链路修复与本地验证（2026-10-12）

分支：`cluade-sdk-bash`。针对 `glm-5.3-flashx-20261012-r1` 暴露的执行问题；原始 run、产物、评分均保留。本次没有调用真实模型 API，没有生成安装包。

## 修改

- 已知官方 GLM 路由单次请求输出预算由 8,192 提高到最多 32,768 tokens；仍服从调用方更小的预算、模型输出上限和上下文余量。为维持总用量 80% 压缩，128k 模型预算为 17,408，200k 为 31,808，1M 为 32,768。未知模型和代理地址保留保守默认值。容量依据：[智谱官方模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview)。这不是认定旧 run 的失败一定由截断引起。
- 工具参数必须完整通过 JSON/对象、工具名称、ID 和完成标记校验。整组通过前不释放任何工具；其中一项无效时，合法的同组调用也不执行。
- 参数失败后仅允许一次带纠正提示的重新生成，要求分段写入完整 JSON。仍失败就结束当前任务，避免 SDK 把它当成 502 长时间自动重试。纠正请求仍经过请求次数回调并服从原任务取消和超时；不拼接、猜测或执行截断参数。
- 保存失败结束原因、参数字节数、请求输出预算及上游返回的完成 token 数。不额外保存无效参数正文。原先缺少这些信息的真实 run 无法追溯确证截断。
- 补记 SDK 消息里的原生工具错误，覆盖未进入 `PostToolUseFailure` 的 Edit 校验失败；参数纠正失败显示为失败，不显示成用户取消。
- 共享执行指引要求长文件分段、保留换行、按有限检查项验收，避免无证据反复下载依赖。浏览器指引明确 `wait.value` 是等待页面文字，不是毫秒数。

## 验证结果

| 检查 | 结果 |
|---|---|
| 模型额度、桥接、Harness、执行监控、浏览器指引、原生文件权限、评分、提示词相关测试 | 83 项通过 |
| 真实 SDK + 模拟 API：无效 Write 后纠正并落盘完整文件 | 通过，3 次模拟请求，坏参数未执行 |
| 真实 SDK + 模拟 API：连续无效 Write | 通过，2 次模拟请求后停止，失败原因和状态正确 |
| 真实 SDK + 模拟 API：Edit 替换文本未命中 | 通过，原文件保持，记录为失败 |
| 真实 SDK：128k、200k、1M 压缩与续跑 | 三种容量通过；79% 不压缩、81% 压缩一次、保留指定信息继续 |
| 纠正阶段取消、JSON/流式返回、同组工具不部分执行、敏感参数不进入诊断 | 相关桥接测试通过 |
| `git -c core.whitespace=cr-at-eol diff --check` | 通过，保留原文件 CRLF 换行 |

真实 SDK 仍是本机安装的原生运行时，模型端全部由本地测试替身提供。首次在受限沙箱运行遇到 `connect EACCES 127.0.0.1`，宿主执行通过。追加状态断言发现取消过滤了失败事件，修复过滤后重新验证通过。

复现命令（在此分支目录执行，均不需要 API Key）：

```powershell
node --test tests/model-limits.test.cjs tests/claude-messages-bridge.test.cjs tests/claude-harness.test.cjs tests/run-progress.test.cjs tests/browser-command-route.test.cjs tests/claude-native-tools.test.cjs tests/report-benchmark.test.cjs tests/prompts.test.cjs
node --test --test-concurrency=1 --test-name-pattern='real SDK (corrects malformed|stops after failed|Edit validation|automatically compacts)' tests/claude-sdk-integration.cjs
```

## 限制与后续验收

齐品达在 60 次请求内有 19 次浏览器调用、12 次 Bash、12 次 Edit、14 次 Excel 调用等；包含等待条件误用、图表配置错误定位和多次依赖排查。没有证据证明这是无限循环，也没有提高 benchmark 的请求上限。指引能否使真实任务及时收尾仍待新 run 验证。

报告里的会员分母、空白放大弹窗、手机标签和来源坐标问题属于模型产物质量问题，本次未改写旧报告。真实模型是否能按纠正提示恢复、得分是否提高，尚未测试；原轮 0 分不变。单次输出预算增大可能提高未来实际用量，纠正最多额外消耗一次模型请求。
