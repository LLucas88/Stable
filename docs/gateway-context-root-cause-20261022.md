# 29% 上下文被误拒绝：根因与修复

## 根因已核实

已通过现有 SSH 通道只读检查线上 `C:\stable-cloud\current`，它指向 `releases\20261022-pricing`。线上 `lib/core/gateway.ts` 与本地网关源码哈希一致：`5D929DE2FE69214F1A755FF30DC8E7945A5B5F901AF548DE54D8CF8230C7DD5D`。

`estimateInputTokenUpperBound()` 用文本和工具定义的 UTF-8 字节数，加消息封装余量，估算 token 的保守上界。`estimateReservationMicros()` 原先却用这个上界拒绝请求：

```ts
if (estimatedInputTokens > contextWindow - maxOutputTokens) {
  throw new GatewayValidationError('context_length_exceeded',
    '请求内容与最大输出长度超过模型上下文限制。');
}
```

这是逻辑错误：上界超过限制，不代表实际值超过限制。代码文本的多个字节可合并为一个 token；中文的一个字符则通常占多个 UTF-8 字节。不能将字节数按 1:1 当成实际 token 数。

失败前成功响应的输入用量为 298,111 token，SDK 请求输出上限为 8,192，模型目录仍公布 1,000,000 上下文。截图的错误文本准确来自上述网关本地分支，发生在上游模型请求之前。因此这次错误不证明模型实际上下文已满。截图百分比是 SDK 统计，也不等于失败请求的精确输入 token 数。

## 修复方案

网关不再使用字节保守上界作为输入合法性的拒绝依据。由模型服务自身按真实 tokenizer 和图片计量验证上下文。保留以下控制：

- 最大输出限额，以及输出预算必须给输入留出空间的确定性检查。
- 原有 10 MiB HTTP 请求体限制和消息格式检查。
- 按模型完整允许窗口预留额度，按实际 usage 结算；没有放松余额约束。
- 不删除、压缩或截断用户内容。这是网关根因修复，独立于客户端压缩兜底。

## 验证

- 新增超过 1,000,000 UTF-8 字节的代码/中文测试：修复前复现相同 `context_length_exceeded`，修复后通过。
- 网关全部 64 项测试通过；TypeScript 检查通过；Node 生产构建完成。
- 使用真实生产构建、隔离数据库、真实 HTTP、模拟上游：1,190,000 字节代码文本原样到达上游，SSE 和非流式均成功，额度预留/结算、幂等和历史记录检查通过。没有真实模型调用或费用。
- 发布前只读源码比较：app/lib/components/hooks/runtime/public 与线上比较，仅 `lib/core/gateway.ts` 有差异。

本地源码：`D:\stable\.local\ecs-production\source\lib\core\gateway.ts`。
回归测试：同目录 `tests\gateway-core.test.ts`。
HTTP 验收入口：`D:\stable\.local\context-http-acceptance.mjs`。
本地候选包：`D:\stable\.local\ecs-context-fix\release.tar.gz`，SHA256 `1A2B5F0D6CD2AEF5A1F9037B17785BD0038169BF04F5D20B1906C2BD30A41034`。

## 部署状态

**用户明确批准后，已于北京时间 2026-10-22 22:27 左右部署成功。** 未推送 Git；本次只发布已批准的网关修复。

- 当前版本：`C:\stable-cloud\releases\20261022-context-fix`，`current` 指向该目录。
- 回退版本：`C:\stable-cloud\releases\20261022-pricing`，`context-previous` 保留指向该目录的链接。部署脚本包含健康或数据校验失败时的回退流程，本次未触发回退。
- 加密备份：`C:\stable-cloud\backups\2026-10-22T14-27-17-024Z.db.aes.json`。实际解密恢复校验 integrity=ok、foreignKeyErrors=0。
- 切换前后全部 11 张数据库表逐行摘要一致；没有数据库迁移或账号更新。
- 当前源码 SHA256：`826D6024152941D8EA10110B98F3EA18E504FF00C925A15EBF0EA13A6763978D`；与本地测试版本一致。

## 线上真实模型验收

北京时间 22:28 使用原账号，仅发送一次独立验证请求，不继续或改写业务会话，不调用客户端压缩：

- 输入正文 1,190,059 UTF-8 字节，max_tokens=64。单是正文就超过旧规则的 999,936 阈值，因此旧网关必然误拒绝。
- HTTPS 网关返回 HTTP 200，模型回复 `CONTEXT_OK`，耗时约 8.1 秒。
- 提供商真实 usage：prompt_tokens=420043、completion_tokens=15、total_tokens=420058。
- 服务端记录 `req_nx9zW_GEav9BoMsY` 状态 settled，实际费用 420103 微元，即 **¥0.420103**；低于本次设置的 ¥2.01 最高费用边界，无自动重试。
- 原账号、模型目录、用量接口和公网健康检查均 HTTP 200。
- 验证后排除唯一新测试请求及其正常额度流水，旧的 2,443 条请求和 4,881 条额度流水逐行摘要与部署前一致；账号数量仍为 22。

这证明原字节/token 混淆误拒绝已在线修复。没有重跑原业务报告，也不代表所有真正超过模型容量的输入都会被接受。

本地证据：`D:\stable\.local\ecs-context-fix\live-result.json`；部署及数据校验脚本位于同目录。
