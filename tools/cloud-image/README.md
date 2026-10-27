# GLM-image 云端网关补丁

此目录保存可审查的服务端源码覆盖层；Stable 网关当前源码不在桌面仓库的跟踪文件中。`apply.cjs` 只准备指定源码目录并备份被修改的文件，不执行数据库迁移，不部署。

本地验证：

```powershell
node tools/cloud-image/verify.cjs D:\stable\.local\ecs-production\source
node tools/cloud-image/apply.cjs D:\stable\.local\ecs-production\source
```

`verify.cjs` 使用真实鉴权、额度服务和 SQLite 约束，仅创建内存数据库，供应商请求全部模拟；测试价格只是合成数据，不能用于生产定价。

上线步骤（2026-10-27 已部署，详见 docs/cloud-tools-release-20261027.md）：

1. 备份线上数据库和旧版本，保留回退路径；本次已验证加密备份恢复并保留旧发布。
2. 应用 `drizzle/0010_image_gateway.sql` 的两张新增表。迁移不改既有账号、历史或额度。
3. 在现有模型目录创建/启用 ID、upstreamModel 均为 `glm-image` 的模型，地址为 `https://open.bigmodel.cn/api/paas/v4`；生产复用服务器既有标准 `ZHIPU_API_KEY`。该模型不进入聊天模型列表，也不能从聊天接口调用。
4. 管理员已于 2026-10-27 确认按 [GLM-image 官方价格](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image) 0.10 元/张上线，无加价。为新的 CNY 价格版本配置 `image_prices.image_micros=100000`（1000000 微元 = 1 元），生效时间取实际部署时间。无价格拒绝调用。改价须创建新价格版本，不能改写旧快照；聊天 token 价格保持原样。确认记录见 `docs/cloud-tools-release-20261027.md`，确认不代表已部署。
5. 重新构建网关，先在隔离环境验证，再部署和执行获批的真实验收。

客户端采用系统网络栈和 Stable 登录凭据，不会把网关 token 发给智谱；提供商 Key 只保留在服务端。每次成功图片请求独立预留/结算，截图下载不再计费。图片响应和结算在同一数据库事务保存，相同账号和 Idempotency-Key 只返回旧结果；冲突、执行中、结果未知请求不会再次调用供应商。

对于断网/超时等无法确认的上游提交，沿用网关 uncertain 及人工核对机制，不宣称供应商未计费。供应商 402 与 Stable 额度不足保留不同错误码。客户端在网关尚未部署时提示联系管理员，不回落到私人 Key 直连。

回退：还原旧网关发布目录；新增表可保留，不删除生图请求和计费记录。客户端云端生图届时会明确报服务未配置。不要删除账务记录来“恢复”重试。
