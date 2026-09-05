# Stable 问鼎 CLI 内置运行时

该目录由 Stable 安装包原样复制到 `resources/wending-cli`，用于 Windows x64 后台静默调用。

- 命令入口：`crm-brand-cli.cmd`
- Python：3.11.15 x64
- 业务包：`crm-brand-cli 0.9.0.dev9`
- 基础包：`crm-base-cli 1.0.1`
- 登录配置：每个任务独立的 `userData/wending/conversations/<任务哈希>/config.json`，由 `WENDING_CONFIG_DIR` 传入。未指定该变量的外部 CLI 保持原有 cwd 行为。

用户点击“使用”后，Stable 创建独立任务并打开任务顶部的登录表单，先进行版本及登录态检查；未登录时由表单收集手机号和验证码，经用户确认发送短信后，后台按固定流程完成登录和账号/品牌选择。只复用本任务的登录。手机号、验证码和令牌不写入对话或模型提示词。

SDK 的 `config.py` 支持任务配置路径，`api_base.py` 通过 `stable_scope.py` 在查询前后校验绑定品牌。专用登录后台独立完成品牌选择，业务命令不能直接切换品牌。若供应商按账号共享服务端品牌，本地配置隔离不能改变这一限制；校验不一致会拒绝返回结果。

HSF 网关可能将品牌列表及登录记录放在 JSON 字符串中。`stable_response.py` 为登录后台与任务品牌校验提供有界解码；空品牌列表报 `NO_BRANDS`，无法识别的结构报 `INVALID_BRAND_RESPONSE`，不再将格式问题误报为无品牌。重试品牌查询保留已授权的内存会话，无须重复发送验证码。

进入对话后仅预填任务，查数等业务操作仍需用户确认发送。Agent 可查阅 `login-guide.md`，不得自行读取或打印 `.crm-cli` 中的凭据。Python 字节码缓存及本地登录目录不进入源码版本控制。
