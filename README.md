# Stable

Stable 是一个 Windows 本地 Agent 工作台。当前版本为 **v0.9.26**，包含对话、数据与知识资源、Skills、模块化工作流，以及 Team 对话快照协作能力。

## v0.9.26 主要能力

- 多任务 Agent 对话与可折叠执行过程卡片。
- 数据、脚本、知识库和 Skill 的按需引用。
- 可视化模块化工作流、并行分支执行和结果文件出口。
- Team 在线设备发现、对话快照发送，以及接收端接受或拒绝。
- Windows 深色/浅色主题与本地持久化数据。

## 安装

在仓库的 **Releases** 页面下载：

```text
Stable-Setup-0.9.26-x64.exe
```

安装包包含 Stable 所需的本地 Harness 运行时。安装或升级不会把用户数据提交到本仓库。

## 本地开发

要求：Windows、Node.js 20+、npm。

```powershell
npm ci
npm run typecheck
npm test
npm run dev
```

桌面开发模式：

```powershell
npm run build
npm start
```

## Harness 运行时

`runtime/` 包含体积较大的本地 Node 与 DeepSeek Harness 二进制，因此不会提交到 Git。完整 Agent 运行和 Windows 打包需要在项目根目录提供已验证的 `runtime/`，也可以通过环境变量 `STABLE_DSH_RUNTIME` 指向 Harness 入口。正式 Release 安装包会捆绑经过验证的运行时。

## 构建安装包

准备好本地 `runtime/` 后运行：

```powershell
npm run typecheck
npm test
npm run dist
```

默认生成 NSIS x64 安装包。版本号以 `package.json` 为准，发布标签采用 `vMAJOR.MINOR.PATCH`。

## 数据与安全

- 用户数据保存在 Electron 用户数据目录，不纳入 Git 版本管理。
- API Key、临时附件、测试工作区和本地运行日志不会提交。
- Team 发送的是用户主动选择时的对话快照，不会持续同步之后的消息。

## 版本管理

- 版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。
- Git 标签与 GitHub Release 使用相同版本号。
- 每个 Release 同时提供安装包和 SHA-256 校验文件。

