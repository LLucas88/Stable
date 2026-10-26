# 本地直连与设备配置

默认链路：Stable → Claude Agent SDK → 本机 Messages Bridge → 供应商 HTTPS Chat Completions API。接入细节见 [CLAUDE_AGENT_SDK.md](CLAUDE_AGENT_SDK.md)。
开发版默认启动不创建 Cloud Proxy、不要求 Stable Cloud 登录；问鼎等业务登录独立保留。
从 1.11.0 起，正式安装版默认连接原 Stable Cloud 网关，使用原用户数据目录恢复账号和历史。设置 `STABLE_CLOUD_ENABLED=0` 可显式切回本地直连；开发版设置 `STABLE_CLOUD_ENABLED=1` 可启用云端模式。

## 管理员电脑

1. 左下角账号菜单 → 模型连接，填写供应商 API 基础地址、实际模型 ID 和本机 API Key，保存。
2. 接收者在同一页面“导出本机申请”，把申请文件发给你。申请有效期 7 天，重新生成会替换旧申请。
3. 展开“管理员：为其他设备签发”，选择模型，填写为接收设备单独创建的 API Key。
4. 选择申请文件，与接收者核对设备指纹，保存加密包。
5. 将加密包发送给接收者；通过已确认身份的渠道提供“本机签发者指纹”，不要仅从收到的包里复制指纹。

## 接收电脑

1. 在生成申请的同一 Windows 用户、同一 Stable 数据目录中导入。
2. 首次输入已核对的管理员签发者指纹，选择加密包。
3. 导入后在对话输入框选择新模型。已有会话保留原来的模型选择，不自动改写。
4. 后续更新重新导出申请，由原签发者签发；首次信任的签发者已固定。

配置包采用 RSA-OAEP-SHA256 包装随机 AES-256-GCM 密钥，Ed25519 签名覆盖完整包体。
设备私钥、签发私钥和模型 Key 使用 Electron safeStorage 保存。包仅能由申请设备解密，导入后申请失效。
模型 Key 不进入公开模型目录或 Claude 子进程环境。管理员电脑不需要保持在线。

接收设备最终持有供应商 Key；加密包不能防止拥有该设备控制权的人提取运行时密钥。
额度、撤销与消费记录需由供应商管理，建议每设备独立 Key。丢失签发者数据后不能用新身份覆盖已有信任，需管理员安排重新初始化设备配置。
输出预算由 Stable 按供应商配置控制；直连不保证消除供应商上下文超限错误。供应商须兼容 Bridge 使用的流式 Chat Completions 和工具调用协议。非 Claude 模型使用 Stable 自建协议适配，不属于 Anthropic 官方支持范围，需要分别验证实际模型。

## 本地启动

```powershell
Set-Location D:\stable
Remove-Item Env:STABLE_CLOUD_ENABLED -ErrorAction SilentlyContinue
npm.cmd run build
npm.cmd start
```

此命令沿用应用正常数据目录，不复制或清除已有数据。使用自定义数据目录的环境应保留原启动参数。
