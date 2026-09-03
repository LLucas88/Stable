# Stable 云端与桌面上下文管理核查

日期：2026-09-04。范围：只读诊断；未修改云端源码、数据库或部署，未调用真实付费模型。

## 结论

不是“完全没有压缩”：桌面内置 Harness 在单次任务中启用了自动摘要压缩；云端网关本身不做摘要。跨轮对话则只截取最近 12 条消息，没有持久化滚动摘要。

存在两个独立的容量管理缺口：云端容量元数据没有传入 Harness；桌面与网关采用不同的 token 估算方式。不能仅凭“模型支持大上下文”保证不会超限或遗忘。

## 线上核对范围

- Sites 项目 `stable-cloud-admin` 可用，最新保存版本为 7，源码提交 `7369bb5a4fd43f14337dcf947f3bce445bfef025`；本机 `../stable-cloud` HEAD 与该提交一致，相关网关文件无差异。
- 读取该项目实时 D1 `DB.models`，两个启用模型配置如下。这是平台配置值，不等同于已向模型供应商实测的容量。

| 模型 | 配置上下文上限 | 配置最大输出 |
| --- | ---: | ---: |
| deepseek-v4-flash | 1,000,000 | 384,000 |
| glm-5.3-flash | 1,000,000 | 128,000 |

- Sites 返回了在线地址，但没有返回当前生产部署 ID；不能单凭“最新保存版本”独立证明在线发布对应哪个提交。以下网关实现结论基于与版本 7 一致的源码，模型配置则已读取线上数据确认。
- 未读取账号表、会话令牌、模型密钥或实际聊天内容；未发起真实压缩请求。

## 三层行为

### 1. 云端网关：验证与转发，不替用户生成摘要

`../stable-cloud/lib/core/gateway.ts`：

- `estimateInputTokenUpperBound()` 使用请求 messages/tools 等序列化后的 UTF-8 字节数，加每条消息 16 和固定 64 的余量，作为保守 token 上界。
- `estimateReservationMicros()` 从上下文窗口扣除请求输出预算（不超过模型的最大输出）；若输入估算超过剩余空间，返回 `context_length_exceeded`。
- `createUpstreamBody()` 保留消息和工具字段，替换模型 ID、输出上限等再转发；没有摘要生成或对话历史合并逻辑。
- D1 保存账号、配额、请求计费及审计状态，不承担会话摘要记忆。真正的上下文由客户端在每次请求的 messages 中提供。

### 2. 桌面单次任务：自动压缩已配置，但容量未对齐

`desktop/services/harness.cjs` 使用 `headless` profile。内置 `runtime/dsh/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml` 注册 `compaction-basic`、`token-meter` 和 `tool-result-pruner`；headless 层未关闭它们。

- `dsh-compaction-basic` 默认 `auto=true`、`thresholdRatio=0.8`、`retainRatio=0.16`。
- 每个 Agent 步骤前检查压力；旧内容请求模型生成结构化摘要，同时保留较新的原文尾部。压缩失败会记录警告并继续；识别为上下文溢出时另有有限次数的恢复尝试，因此不是保证永不超限。
- 工具输出超过 8,192 字符时，另有裁剪机制，配置保留头部 4,096 和尾部 1,024 字符；这与语义摘要不同。
- `desktop/services/cloud-gateway-proxy.cjs:modelRoute()` 没有带出 `context_window`/`max_output_tokens`；`HarnessRunner.writeSettings()` 也没有写入 `contextWindow`/`maxTokens`。
- 当前自定义 `stable-cloud` 路由因此使用 `dsh-llm-pi-ai` 默认上下文 262,144、最大输出 32,768；默认压力阈值约 209,715 token，而不是按线上配置的 100 万计算。
- `dsh-token-meter` 主要按文本字符数 / 4 加结构余量估算；网关按 UTF-8 字节数保守估算。中文、长工具结果等输入的两种估算可能相差很大，网关可能在本地压缩前就拒绝请求。

以上是源码/配置核对，不是本轮对真实模型自动压缩的端到端验收。

### 3. 跨轮对话：最近 12 条，不是长久记忆

`desktop/main.cjs` 准备上下文时默认使用 `store.listMessages(conversationId).slice(-12)`，然后和当前任务、规则及所选资料一起拼接。`HarnessRunner.writeSettings()` 每次创建新的 run 目录，本轮内部摘要没有作为下一轮对话的独立记忆保存。

所以旧聊天仍可在界面查看，但不一定再次发送给模型；超过窗口的早期约束可能遗忘。12 条是消息数量，不是 token 预算，单条特别长仍可能超限。

## 建议后续改动（本轮没有实施）

1. 将可信云端目录中的容量、输出上限贯通到模型路由及 Harness 配置；不能只把上下文常量改大。
2. 用与云端限制协调的请求预算，在到达拒绝边界前压缩，并为输出留余量。
3. 为每个对话保存滚动摘要，明确保留任务目标、用户约束、已验证结论和产物路径，再加最近原文。
4. 补足中文长文、长工具结果、多轮、摘要失败、取消和模型切换的模拟及真实服务回归；失败时明确报告，不能悄悄丢弃用户要求。
