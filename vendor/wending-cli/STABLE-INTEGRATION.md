# Stable 问鼎 CLI 内置运行时

该目录由 Stable 安装包原样复制到 `resources/wending-cli`，用于 Windows x64 后台静默调用。

- 命令入口：`crm-brand-cli.cmd`
- Python：3.11.15 x64
- 业务包：`crm-brand-cli 0.9.0.dev9`
- 基础包：`crm-base-cli 1.0.1`
- 登录配置：运行时工作目录下的 `.crm-cli/config.json`

用户点击“使用”后，Stable 先进行版本及登录态检查；未登录时由原生表单收集手机号和验证码，经用户确认发送短信后，后台按固定流程完成登录和账号/品牌选择。已登录则复用。手机号、验证码和令牌不写入对话或模型提示词。

进入对话后仅预填任务，查数等业务操作仍需用户确认发送。Agent 可查阅 `login-guide.md`，不得自行读取或打印 `.crm-cli` 中的凭据。Python 字节码缓存及本地登录目录不进入源码版本控制。
