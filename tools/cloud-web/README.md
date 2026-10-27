# DeepSeek 搜索与网页抓取接入

本目录是 Stable Cloud 服务端补丁。客户端实现位于 `desktop/services/deepseek-web.cjs`，工具入口为 `stable_search`、`stable_fetch`。保留现有 Claude Agent SDK 架构，DeepSeek 联网接口直接返回结果，不再为搜索另行调用 DeepSeek 聊天模型。

## 已核对的官方契约（2026-10-27）

- [Search](https://api-docs.deepseek.com/api/search/)：`POST https://api.deepseek.com/v1/tools/search`，query 为 1–128 个 Unicode 字符，count 为 1–50；保留查询运算符。本次支持 query、count、need_content。
- [Fetch](https://api-docs.deepseek.com/api/fetch/)：`POST https://api.deepseek.com/v1/tools/fetch`，公开 HTTP/HTTPS URL，返回 title 与 Markdown content。
- [鉴权、错误和计费](https://api-docs.deepseek.com/zh-cn/guides/search/)：官方 DeepSeek Bearer Key；人民币价格为搜索、抓取各 5 元/千次有效请求（0.005 元/次）。成功且有内容才计费，空结果、失败及超时不计费。文档中 2026-11-01 前的免费说明针对既有服务端工具调用，不能据此将新接的独立 API 配置为免费。

## 客户端行为

- DeepSeek 官方直连使用独立 Search/Fetch API；第三方代理的 Key 不发送给官方。智谱直连原搜索保留；未配置 DeepSeek 的其他直连模型可用原浏览器读取网页。
- Cloud 会话无论选择 DeepSeek 还是 GLM 聊天，都通过本机代理转发到统一网关的 `/v1/tools/search` 与 `/v1/tools/fetch`；聊天模型 ID 不进入联网请求。
- SDK 通过 ToolSearch 发现两项工具；任务禁止联网时执行边界拒绝调用。原只读模式的禁网政策不变。
- 搜索保留来源 URL、摘要和日期；抓取保留来源 URL 与正文。输出标记为不可信资料，说明要求引用来源而不执行网页指令。大内容会截断并标记 truncated。
- 私有 IP、localhost、常见内网域、文件地址和带账号密码的 URL 在发送前拒绝。公网域名的解析、重定向及站点访问策略由 DeepSeek 抓取服务执行；该功能不使用本机登录态，不替代原有浏览器交互。
- 不自动重试付费请求。Cloud 重放保留幂等键，服务器返回已保存结果；并发、冲突、结果未知不触发重复请求。网络连接中断不等于供应商未成功，使用既有 uncertain 账务核对机制。
- 工具策略版本更新，以免续聊沿用过期工具目录；不删除原消息或历史。过程时间线将新增工具显示为“网页抓取”。

## 本地准备与离线验证

```powershell
Set-Location D:\stable
node tools/cloud-web/apply.cjs D:\stable\.local\ecs-production\source
node tools/cloud-web/verify.cjs D:\stable\.local\ecs-production\source
node --test tests/deepseek-web.test.cjs
```

`apply.cjs` 检查源代码锚点、备份被替换文件、复制覆盖层并阻止工具服务出现在聊天列表或被聊天端点调用。它不迁移数据库、不部署、不修改账号。补丁可与 `tools/cloud-image/` 一同使用，迁移编号为 0011。

`verify.cjs` 使用内存 SQLite、真实鉴权/额度约束/服务端路由和合成账号，并测试真实客户端桥接及本机回环代理。所有 DeepSeek 请求由模拟供应商接管；无真实费用、无生产数据库访问。

测试覆盖层还修正 `d1-invariants.test.ts` 的计数范围：逐名检查全部既有账务约束，不再把新增业务触发器误计为错误；没有删减约束或忽略失败。

## 上线配置（2026-10-27 已部署，记录见 docs/cloud-tools-release-20261027.md）

1. 备份数据库和当前网关发布版本。应用 `drizzle/0011_web_tools.sql` 的两张表及触发器；本次已验证 ECS 的 SQLite 适配器。若采用不支持 SQL 触发器语句的迁移平台，须先适配迁移执行器，不能跳过触发器。
2. 在现有模型管理中建立以下两项服务。它们是计费服务记录，不是聊天模型：

| 字段 | 搜索 | 抓取 |
|---|---|---|
| id / upstreamModel | deepseek-search | deepseek-fetch |
| provider | deepseek | deepseek |
| upstreamBaseUrl | https://api.deepseek.com | https://api.deepseek.com |
| secretName | DEEPSEEK_API_KEY | DEEPSEEK_API_KEY |

3. 生产复用既有 `DEEPSEEK_API_KEY`，不要求另开供应商账号；不能使用 GLM 或第三方代理 Key。官方 origin 已在网关原有 allowlist。上下文字段仅为现有管理表的必填字段，联网端点不按 token 计费。隔离测试仍可使用独立的 `DEEPSEEK_WEB_API_KEY`。
4. 管理员已于 2026-10-27 确认两项服务均按 0.005 元/次上线，无加价。在 `web_tool_prices` 为两个新的 CNY 价格版本分别写入 `request_micros=5000`。1000000 微元 = 1 元。价格缺失时拒绝请求，不默认免费、不改既有聊天价格。已使用的版本不可改写或删除；生效时间取实际部署时间。确认记录见 `docs/cloud-tools-release-20261027.md`，确认不代表已部署。
5. 构建并部署经确认的网关版本，再做获批的真实验收。DeepSeek 的账户可用性和余额仍由供应商校验；接入不会消除 HTTP 402。

成功的每次搜索/抓取独立预留和结算，返回数量不影响单次价格；响应与结算在同一事务中保存。失败释放预留，空结果结算为零。不将工具请求伪装成模型 token usage。

回退时恢复旧发布目录，保留新增表、恢复记录和账务记录；旧网关对新端点返回未配置，客户端给出对应提示。不要删除账务记录来强制重试。
