# 海报续接任务：前置判断超时与供应商余额错误

## 已核实的原因

- 会话 `831ba4a9-cefa-41fa-b5db-600932878a28` 的最新请求是把原产品图放回已有海报。
- 2026-10-23 17:19:55–17:21:14（北京时间），客户端记录 8 次网关 HTTP 502；17:21:22 投递记录以“执行前需求判断超时（90 秒）”拒绝。请求没有保存为新的用户消息，也没有开始海报编辑。
- 线上审计中对应 8 条记录全部为 `upstream_402`、`released`、`actual_micros=0`。实际供应商为 `api.deepseek.com`，模型 DeepSeek-V4.1-Flash-1017。
- DeepSeek 官方错误码文档将 402 定义为余额不足：https://api-docs.deepseek.com/quick_start/error_codes/ 。这是供应商账户余额，与 Stable 用户额度不同。
- 网关旧代码将除 429 外的所有上游拒绝映射成通用 502，并丢弃具体原因。SDK 对 502 重试，最终客户端又用总超时覆盖了真实错误。

## 本地客户端修复

- 已执行任务的后续修改交给保留上下文的执行模型处理，不再额外启动无工具的前置判断；待回答问题、待审批操作和显式新任务仍保留原有判断。执行模型仍可提出澄清和进行权限审批。
- 前置文本判断遇到连续瞬时服务错误，只允许一次恢复尝试；成功后清零失败计数。
- HTTP 402 和网关标记的供应商鉴权/配置错误立即停止；运行超时仍保留最近的真实服务错误。
- 余额提示经过桥接、运行器和 `failedTurn` 后仍含“模型供应商余额不足”“HTTP 402”，不会被替换成单独的“执行失败”。

## 网关修复与部署

- 新增 `lib/core/upstream-error.ts`，修改 `lib/server/gateway.ts`。部署前对比 app/components/hooks/lib/runtime/public/db/drizzle 和构建配置哈希，仅这两个源码文件与线上不同。
- 402 返回 `upstream_insufficient_balance`，明确提示供应商余额/付款问题和管理员处理方式。供应商鉴权错误保持与 Stable 登录错误区分；不向客户端泄露上游原始响应。
- 用户在本轮明确批准部署并保留回退版本。
- 当前版本：`C:\stable-cloud\releases\20261023-provider-errors`。
- 回退版本：`C:\stable-cloud\provider-error-previous` 指向 `releases\20261022-context-fix`。
- 加密备份：`C:\stable-cloud\backups\2026-10-23T09-42-46-643Z.db.aes.json`，恢复完整性校验 ok，外键错误 0。
- 切换前无最近活动请求；切换后 11 张表逐行哈希完全一致，22 个账号、2796 条网关请求及 5587 条额度账本记录保留。
- 公网及内网健康接口 200，网关计划任务 Running。没有改动配置凭据或账号数据，没有推送 Git。
- 候选包 `.local/provider-error-fix/release.tar.gz` SHA256：`568BCABD35DC84BE661DC7A713B74ADC1DAF4E0BBDFCE88CFE9752FF7D9070A0`。

## 验证与限制

- 客户端相关回归 106 项通过；另加余额错误从本地真实 HTTP 桥接到聊天失败消息的专项测试 1 项通过。
- 网关 67 项测试、TypeScript 检查、Node 生产构建通过。
- 隔离数据库、生产构建、真实 HTTP、模拟 DeepSeek 402：流式/非流式均返回明确余额提示，2 条请求均 released，实际花费和预留均为 0。证据 `.local/poster-gateway-http.log`。
- 未调用真实付费模型，未修改原桌面历史，也未重新发送队列任务。没有声称供应商余额已恢复或海报任务已完成。
- 客户端源码修复需重启本地开发版生效；未重新打包安装器。线上余额错误映射已生效，恢复 DeepSeek 执行仍需管理员处理供应商余额。
