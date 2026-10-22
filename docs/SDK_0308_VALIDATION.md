# Claude Agent SDK 0.3.308 升级与影响评估

日期：2026-10-22。工作区：`D:\stable\.local\cluade-sdk-bash`，分支 `cluade-sdk-bash`。

## 升级范围

- 官方 npm `latest` 为 `0.3.308`，发布时间为北京时间 2026-10-22 12:19:14；从 `0.3.304` 精确升级，Windows x64 运行时从 `2.1.304` 升至 `2.1.308`。
- package.json、锁文件、已安装 SDK、运行入口版本标记一致。相对本轮备份，依赖变化仅涉及 SDK 和配套平台包。
- 保留工作区已有未提交改动；没有调整界面、模型默认值、审批策略、用户数据、Codex Harness 或全局 CLI。没有制作安装包。

## 对 Stable 的实际意义

| 上游变化 | 当前 Stable 的适用情况 | 验证边界 |
| --- | --- | --- |
| 图片、PDF、大工具结果场景下的自动压缩异常修复 | 对长任务和截图较多的任务有潜在帮助 | 已有自动压缩/续接回归验证兼容性；没有重现上游特定故障，不能据此承诺上下文或耗时下降 |
| MCP 较多时将 API 错误误判为上下文过长、触发多余压缩的修复 | 工具较多的任务可能减少无效压缩 | 上游修复，未在本轮独立重现错误场景 |
| HTTP MCP 断线时限制重复调用有副作用的工具 | 对用户启用的外部 MCP 有意义；内置 GLM-Image 另有自身防重复机制 | 新增本地模拟“执行后丢失响应”专项：旧版、新版都仅执行一次。因此该场景未证明新增收益 |
| 无法解析的工具调用增加恢复机会 | Stable 的 Messages bridge 已先做完整性检查和有界修复 | 原有错误修复、拒绝部分写入、请求上限测试继续验证；没有放宽上限或叠加自定义重试 |
| setMcpServers 同名配置覆盖、启动空超时参数处理等修复 | Stable 通过 query 初始化，settingSources 为空且启用 strictMcpConfig；没有直接调用 startup/prewarm/setMcpServers | 当前直接收益有限，不为使用新接口改动既有行为 |
| 浏览器 SDK 对话能力声明、唤醒来源事件 | 当前使用 Node SDK，未接入这些新接口 | 不算作此次 Stable 功能改善 |

结论：**这是稳定性和兼容性维护升级，尚未证明真实任务提速。** 本地模拟测试能验证调用、文件、审批、取消、压缩和恢复行为，不能代表 DeepSeek 推理速度、生成质量或收费接口表现。

## 验证证据

升级前完整真实 SDK/本地模拟模型集成：55 项通过。新增非幂等 HTTP MCP 丢失响应专项在升级前独立运行：1 项通过。

升级后真实 SDK 集成 **56/56 通过**；相关回归 **137/137 通过**，合计 **193 项通过**。TypeScript 类型检查、Vite 生产构建、改动文件空白检查通过。构建保留既有大 chunk 警告。

自动压缩场景在升级前后均通过：每个窗口用例保持 7 次请求、1 次压缩；1M 窗口用例压缩后记录均为 12544 tokens。该证据表明既有信息保留和压缩边界没有退步，**不表明更少 tokens 或更快**。新增 MCP 丢失响应专项在两个版本都只执行一次。

所有测试使用本地模拟供应商与隔离目录，**本轮付费 API 调用为 0**。保留原有 MCP callback shadowed 警告：内置工具自身处理器和外部 MCP hooks 的权限约束未变，不通过放宽权限来消除警告。

原始证据目录：`D:\stable\.local\sdk-0308-validation-20261022`。

- `package.before.json`、`package-lock.before.json`：升级前依赖快照。
- `npm-metadata.json`、`dependency-diff.json`：版本、发布时间、完整性和依赖差异。
- `baseline-integration.log`、`baseline-mcp-loss.log`：旧版测试。
- `upgraded-integration.log`、`regression.log`：新版集成和相关回归。
- `typecheck.log`、`build.log`：类型检查和生产构建。

完整集成套件的墙钟耗时包含模拟等待、进程启动、文件操作，并受同时运行的构建影响；不把套件总耗时比值当作业务性能提升。

开发版需退出并从该工作区重新启动，才会加载更新后的 SDK。此次源码升级不会自动替换已经安装的 Stable 发行版。

## 官方来源

- https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk
- https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md
- https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
