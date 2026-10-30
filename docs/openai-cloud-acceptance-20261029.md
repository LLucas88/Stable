# Stable Cloud OpenAI 接入验收 — 2026-10-29

## 已上线

公共供应商已启用 GPT-6.1 Sol、GPT-6.1 Terra、GPT Image 2.5 Sunburst 和 Flare。Design 默认 Sunburst。本地源码及构建已更新；使用新版界面需完全退出并重启本地测试版。本轮没有制作安装包、推送 Git 或修改原会话。

Sol 思考深度：low / medium / high / xhigh / max；Terra 额外支持 none；默认不覆盖官方默认值。没有添加 API 不支持的 ultra。聊天使用 Responses API，支持函数工具调用、工具结果续聊和加密思考记录传递。

图片支持文生图、质量选择和透明背景；当前尚未实现 OpenAI 图片编辑端点。参考图由对话模型理解，不能将当前实现称为原图直接编辑。尺寸控件使用官方允许范围的一个子集，并校验像素面积和宽高比。

## 经用户确认的计费

固定结算汇率 1 USD = 7.20 CNY，不是实时汇率。每百万 token：

| 模型 | 普通输入 | 缓存命中 | 30 分钟缓存写入 | 输出 |
|---|---:|---:|---:|---:|
| Sol | 14.40 元 | 0.72 元 | 18 元 | 72 元 |
| Terra | 7.20 元 | 0.36 元 | 9 元 | 36 元 |

超过 272K 输入时输入相关价格 ×2、输出 ×1.5。缓存命中、缓存写入从普通输入中扣除，不重复计算。Sunburst / Flare：文字输入 36 元、图片输出 216 元/百万 token，按实际 usage 结算。

现有网关仍会按保守上界冻结额度：聊天按上下文上限，图片按输出 token 上限。冻结不是最终扣费，但余额较少时可能无法发起实际成本很低的请求；本轮未调整全局冻结机制。

## 真实验收

| 路径 | 耗时 | 结果 |
|---|---:|---|
| Sol 函数调用 / 工具结果续聊 | 4.276 / 2.173 秒 | 成功 |
| Terra 简短回复 | 1.819 秒 | 成功 |
| Sunburst，1024×1024，low | 15.328 秒 | PNG 生成成功 |
| Flare，1024×1024，low | 6.478 秒 | PNG 生成成功 |
| 客户端真实 Cloud 代理与 Responses 流式工具 / 续聊 | 5.277 / 2.797 秒 | 成功 |

两张图片使用同一幂等键重放均返回相同产物，没有重复扣费。测试发现公共 API 不接受 Codex 专用的带 namespace 强制函数选择，已改为平铺函数协议并通过实际请求复验；失败请求费用为零。

本轮结算 **0.093372 元**；加上此前密钥测试预留 **0.01 元**，总预算占用 **0.103372 元 < 1 元**。测试账号已禁用、会话已撤销、冻结额度为零，临时登录文件已删除。原账号与额度表哈希保持一致，SQLite integrity=ok，foreign key errors=0。

离线验证覆盖协议与计费、真实 SQLite 模拟网关、失败释放与幂等重放。最新图片回归 26 项通过；Responses 与原 Codex 协议回归 11 项通过；后台完整 App 验证默认 Sunburst、Flare 切换、6 档质量、透明背景、GLM 控件隐藏和发送参数通过。客户端构建、类型检查及网关构建通过。

上述真实验证覆盖客户端传输与服务端，不等于完整 GUI 中付费 Agent 任务的端到端验收；也不是长上下文或高质量图片的价格实测。

## 部署与回退

- 当前：`C:\stable-cloud\releases\20261029-openai`；健康检查 200。
- 保留旧版：`C:\stable-cloud\openai-previous-20261029`，指向 `releases\20261027-cloud-tools`。
- 加密数据库备份：`backups\2026-10-29T12-30-15-940Z.db.aes.json`。已解密到验证副本，完整性通过。
- 密钥配置备份：`config\runtime.dpapi.before-openai-20261029-123339-934adb9561b748d2af697030f0fa78ba.bak`。
- 部署包 SHA256：`BCAA59F7B78DDDBEEC1B3EF45D6447B5EA31D6DB8F6C93F4BEB0BCF1D1631E81`。
- 受管 SSH 密钥已重新限制来源 `223.104.3.200/32`。
- 回退使用 `tools/cloud-openai/rollback.ps1` 与同目录 `disable-models.cjs`；先禁用新模型，空闲后切换旧版，保留现有数据库及新增账务，不能直接恢复旧数据库覆盖上线后的数据。

本地原始证据保存在 `.local/openai-key-setup/`：`activation-report.json`、`live-chat.json`、`live-images.json`、`desktop-stream.json`、`final-audit.json` 及两个模型输出 PNG。

## 官方依据

- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6.1-terra
- https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
- https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/responses/methods/create
