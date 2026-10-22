# Stable ChatGPT 订阅最小验证（方案 A）

在 `cluade-sdk-bash` 工作区中验证官方 SIWC 登录、账号模型列表、一次 Responses API 请求。
此入口直接请求模型，不使用 Codex app-server，也不接管现有 Claude Agent SDK 执行链。

## 运行

需要 Windows 当前用户、Node.js >= 22.12、可访问 OpenAI 的网络，以及具备使用资格的 ChatGPT 账号。

```powershell
cd D:\stable\.local\cluade-sdk-bash\scripts\chatgpt-smoke
npm ci --ignore-scripts --no-audit --no-fund
npm test
node run.mjs
# 或指定账号列表内的模型：
node run.mjs --model <MODEL_SLUG>
```

脚本打开系统浏览器，请手动登录并授权 Stable 消费订阅额度。默认选官方账号模型列表的第一个可见模型。
只发送 `Reply with exactly: STABLE_SIWC_OK`，不发送源码、业务数据、历史对话，也不执行工具。
模型输出非空且收到 `response.completed` 后才报告 `STABLE_SIWC_PASS`；`exactMatch` 单独表示是否完全按指令回复。
网络请求最多等待 30 秒、单次推理 90 秒、登录 10 分钟；不自动重试推理或切换 API 计费。

## 保存内容

- 工作区 `.local/chatgpt-smoke/host.json`：稳定安装标识。
- `registration.dpapi`：注册 client ID 与经验证的 subject，通过现有 Windows CurrentUser DPAPI 模块加密。
- `latest-result.json`：本轮阶段、可用模型、模型短回复和脱敏错误码。文件不含令牌、授权码或邮箱。

访问、刷新和 ID 令牌仅留在进程内存；退出后需重新授权，已注册 client ID 会复用。
发现注册文件不可解密时停止，保留原文件；不会读取 `%USERPROFILE%\.codex` 或 Stable 主用户配置。

## 范围

这是首次连接的验证入口，尚未把 Responses 的工具消息适配到 Stable 现有 Chat Completions 桥接。
未实现跨进程登录保持、刷新令牌、多账号或正式设置页，未制作安装包。
新增依赖仅为本目录锁定版本的 MIT `jose`；主项目 package.json/lockfile 不变。
代码依据下列公开协议独立实现，未复制 SIWC DevKit 源码。

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

实际验收结果以 `latest-result.json` 为准；单元测试或登录成功不等于真实推理成功。
