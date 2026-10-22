# ChatGPT 订阅接入

在“设置 → 模型连接 → ChatGPT 订阅”登录，再在聊天输入框的模型菜单选择“ChatGPT · 模型名”。模型列表来自当前账号；连接不会改变原来的默认模型或其他供应商配置。额度不足、授权失效时停止当前请求，不会回退到 API Key 或 Stable Cloud 计费。

现有 Claude Agent SDK、工具发现、原生工具、权限审批、对话生命周期和上下文压缩继续使用。新增桥接模块只将模型消息转换为 OpenAI Responses 协议；本地工具仍由 Stable 执行。工具响应必须收到 `response.completed`，并经过现有参数校验后才能执行。模型的加密推理上下文随工具历史保存，按账号和模型隔离。

## 登录与保存

- 每个 Stable 数据目录保存一个 ChatGPT 账号连接。浏览器完成 OAuth PKCE 授权，回调只监听本机随机端口。
- `chatgpt-account.enc` 使用 Electron 系统加密存储；不会把访问令牌、刷新令牌、ID 令牌交给渲染页面或 Agent 子进程。不要单独复制该文件到其他系统用户或 Electron 数据目录。
- 在访问令牌临近到期时自动刷新；请求时也检查有效期。刷新使用跨进程锁，先加密保存旋转后的凭据，再完成身份验证。临时网络失败保留登录，失效令牌要求重新授权。
- 退出会取消进行中的请求、尝试撤销远端授权并清除本机令牌。若远端撤销未获确认，界面会提示去 ChatGPT 设置处理。
- 当前是单账号连接；重新登录沿用已注册客户端和账号身份。

## 开发验证

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test --test-concurrency=1 tests/chatgpt-account.test.cjs tests/chatgpt-responses.test.cjs tests/chatgpt-sdk-integration.cjs
```

完整主界面测试在隐藏 Electron 窗口运行，点击登录入口、实际模型菜单和发送按钮，并走主聊天 IPC、原生 Read 工具和结果渲染。

```powershell
# 模拟服务，真实 Stable 主界面和 Claude SDK，不消耗模型额度
node_modules\electron\dist\electron.exe tests\chatgpt-live-ui.cjs --mock

# 真实订阅；需要用户手动登录并同意少量调用
node_modules\electron\dist\electron.exe tests\chatgpt-live-ui.cjs --live

# 重启恢复验证，不执行模型推理
node_modules\electron\dist\electron.exe tests\chatgpt-live-ui.cjs --live --restore-only
```

模拟测试数据及报告在 `.local/chatgpt-ui-fixture/`；真实测试在 `.local/chatgpt-integration/`。真实测试只读取该目录中的合成文本；不使用日常对话和业务数据。测试登录保存在独立测试配置中，日常 Stable 需要在自己的设置页登录。

认证和刷新故障通过本地签名令牌及模拟服务验证；这不能代替真实账号刷新或真实模型服务的验收。后台测试报告的 `mode` 明确区分模拟服务和真实服务。

## 2026-10-19 验收记录

- 真实账号读取到 7 个模型，选择 `gpt-6.1-sol` 后，主聊天调用原生 Read 读取合成文件，最终显示 `STABLE_CHATGPT_TOOL_OK`。成功轮共 2 次模型请求。
- 退出并重新启动后，恢复了同一测试配置中的加密登录和模型列表，无需重新授权；重启检查没有发起推理。
- 95 项相关回归测试通过。自动刷新、旋转令牌并发、网络故障恢复和失效重登通过模拟服务验证；未等待真实访问令牌到期，不声称已实测真实到期刷新。
- 真实服务的 `response.completed.output` 可能为空，完整输出来自 `response.output_item.done`。适配器收集这些完成项，仍严格等待整体完成后才交给现有工具执行链。
- 排查时一轮失败触发 SDK 自动重试，共发出 10 次请求。已将空完成结果改为不可重试错误，并以真实 SDK 验证只发出一次请求。真实验收脚本另外限制每轮最多 4 次推理请求。
- 修复了完整响应结束后，取消已关闭网络流造成的误报中断。

本机证据：`.local/chatgpt-integration/live-ui-result.json`、`restart-ui-result.json`、`chat.png`。历史失败诊断保存在 `diagnostic-sparse-output.json`，仅含事件结构。

## 协议依据

这是依据公开协议独立实现的适配层，没有引入 SIWC devkit 源码。

- [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [账号与刷新](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
