# DeepSeek 思考续聊、计数校准与协议回归

日期：2026-10-26（北京时间）。工作区：D:\stable。

## 交付范围

保留 Claude Agent SDK 0.3.308 和现有网关架构，修改本地源码。不安装 recipe 常驻服务、不迁移账号和历史、不发布安装包、不推送远程。

## 已验证的根因和修复

1. 原本只通过工具调用 ID 找回供应商的 reasoning_content。纯文本回答即使保存了思考内容，也没有可恢复的消息关联。真实 SDK 会剥离旧 thinking/redacted_thinking 块，所以仅回传不透明标识不能解决重启续聊。
2. 本地思考记录新增消息内容与历史前缀指纹，在 SDK 提示身份规范化后计算。完整前缀用于区分“相同回答、不同思考”；历史压缩后仅接受唯一内容匹配。不同模型/路由的新增消息关联隔离。记录仍在原有私有会话侧文件中，不进入用户可见消息。
3. 无法唯一匹配时明确返回本地 HTTP 400，停止重试；不会任取最近一条思考记录。旧工具 ID 记录继续兼容。旧版已经失去关联的纯文本思考记录不能可靠补回，本轮不猜测、不重写旧历史。
4. count_tokens 改为统计供应商侧表示，包含恢复的思考、当前真正加载的工具定义和结构化输出格式；二进制图片不按 base64 文本计数。
5. 用成功请求的 prompt_tokens（包括缓存命中）校准相同前缀：实际输入 × 1.02 向上取整 + 64 + 新增内容的保守估算。模型/路由、历史、工具定义或输出格式改变时，不复用不匹配的样本。每个会话最多保留 8 条、有效期 24 小时，校准缓存只存摘要指纹和数值。缓存损坏或写入失败退回本地估算。
6. 补齐 DeepSeek 原生 prompt_cache_hit_tokens 的 usage 转换，防止缓存输入漏计；无效负数或超总量的缓存计数不会产生负数输入。

## 计数校准的边界

这不是官方 tokenizer 的精确编码实现。首次请求、新增内容仍是保守估算；观察过的完整前缀用实际服务端数据作基准。不额外发送模型请求来计数，不用某类文本的平均比例套用其他文本或图片。2% + 64 是经验余量，不是服务端 token 数的数学上界。

本地记录的锚点不包含临时追加的运行提醒，但使用包含这些提醒的实际 usage，因此会保留这部分开销。图片仍有估算误差。输入发生变化、模型版本变化、历史压缩或样本过期时允许重新校准。是否能进一步引入官方 tokenizer，仍需单独验证托管 API 的提示模板与图片编码一致性。

## 离线验证

- 协议、计数、思考回放、模型推理参数、网关图片转换、上下文用量：73 项通过。
- 真实 Claude SDK + 本机模拟供应商集成：63 项通过。覆盖三轮重启续聊、相同文本不同思考、工具执行、截图传输、错误停止和自动压缩。
- `npm run typecheck` 通过；修改文件语法及差异空白检查通过。
- SDK 测试使用临时目录和模拟模型，未产生供应商费用。Windows 沙箱中的本机回环测试曾失败；在已批准的真实主机隔离测试环境中通过。

复现命令：

```powershell
cd D:\stable
node --test tests/claude-token-count.test.cjs tests/claude-reasoning-replay.test.cjs tests/claude-messages-bridge.test.cjs tests/model-reasoning.test.cjs tests/cloud-gateway-proxy.test.cjs tests/context-usage.test.cjs tests/claude-context.test.cjs
node --test --test-concurrency=1 tests/claude-sdk-integration.cjs
npm run typecheck
```

## 真实 DeepSeek 验证

使用原账号凭据副本、隔离会话文件和合成数据，经原 Stable Cloud 网关访问 DeepSeek-V4.1-Flash-1017。预算上限 1 元，按当前网关价格在每次请求前预留费用；没有工具执行、图片生成或业务数据操作。

- 6 次成功请求，6 次结算；累计输入 4,261 tokens，输出 107 tokens。
- 实际结算 **0.006371 元**，与本轮请求的两段账单窗口逐一核对。
- 纯文本思考续聊：第二轮恢复前一轮 84 字符的私有记录；第三轮恢复前两轮 84/29 字符记录。只记录长度和存在性用于验收，不在报告中输出思考原文。
- 合成计算的答案依次为 10459、73226、10459,73226，独立算术核对正确。
- 三轮之间销毁并重新创建 bridge，确认关联记录从磁盘恢复。
- 六次请求耗时 0.849、0.914、1.024、1.093、0.690、0.846 秒。这是短输出接口请求耗时，**不是 Stable GUI 任务总耗时或通用性能提升比例**。
- 第三条合成资料输入实际 2,037 tokens；发送前保守估算 11,659，观察实际 usage 后同一请求校准为 2,142（约 +5.15%）。这证明已有前缀的校准，不代表首次输入可精确预知。
- 补充验收第一次启动复用了测试请求幂等号，网关返回 409；修正为每批唯一编号后通过。该 409 在账单窗口中无模型请求、费用为 0，原失败记录保留。
- 测试前后原账号 1,196 条历史消息内容摘要一致，secrets.json 摘要一致。

证据目录：`D:\stable\.local\deepseek-protocol-20261026`。其中 `before` 保存本轮修改前的相关源文件；`protocol-tests.log`、`sdk-tests-final.log` 为回归记录；`live-result.json`、`followup-result.json`、`billing-summary.json` 为真实请求及结算记录。付费脚本含单次执行保护，不能直接重复运行。

## 官方依据

- https://github.com/deepseek-ai/deepseek-recipe
- https://github.com/deepseek-ai/deepseek-recipe/blob/main/docs/tokenizer.md
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/quick_start/pricing/

本轮源码在重启本地开发版后生效；已安装的正式版安装包未重新打包。
