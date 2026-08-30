# Stable

Stable 是一个 Windows 本地 Agent 工作台。当前公开版本为 **v0.9.31**。项目包含对话、定时自动化、数据与知识资源、Skills、模块化工作流、应用内更新，以及 Team 对话快照协作能力。

## v0.9.31 主要改进

- 远程更新改用不包含 Harness Runtime 的轻量更新包，完整安装包只用于首次安装，显著减少升级阶段的解压与复制量。
- 首次升级会把 Runtime 迁移到持久目录，后续版本直接复用，不再重复展开约 3.8 万个运行时文件。
- 新版本在旧程序旁完成暂存和健康检查后再原子切换；失败时自动恢复旧程序与 Runtime。
- 恢复 blockmap 差分下载，同时保留完整轻量更新包回退；用户确认后继续静默安装并自动重启。

## v0.9.27 主要能力

- 多任务 Agent 对话与可折叠执行过程卡片。
- 数据、脚本、知识库和 Skill 的按需引用。
- 可视化模块化工作流、并行分支执行和结果文件出口。
- Team 在线设备发现、对话快照发送，以及接收端接受或拒绝。
- Windows 深色/浅色主题与本地持久化数据。
- 应用开启期间运行的一次、每天、每周和每月定时任务，可手动创建或在对话中确认创建。
- 安装版从 GitHub Releases 后台检查并下载更新，下载完成后提示重启安装。
- Coding 默认开放工作区读写、命令、依赖安装、联网搜索与子 Agent；删除、覆盖和未知程序仍需人工确认。

## 安装

在仓库的 **Releases** 页面下载：

```text
Stable-Setup-0.9.31-x64.exe
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
npm run dist:update
```

`npm run dist` 生成包含 Runtime 的完整 NSIS x64 安装包，供首次安装；`npm run dist:update` 生成复用持久 Runtime 的轻量远程更新包。版本号以 `package.json` 为准，发布标签采用 `vMAJOR.MINOR.PATCH`。

## 发布与自动更新

首次启用自动发布时，先把本机已验证的 `runtime/` 作为固定 Release 资产上传一次（以后版本复用，无需重复上传）：

```powershell
npm run runtime:archive
gh release create runtime-v1 stable-runtime-win-x64.zip --title "Stable Runtime v1" --notes "Stable Windows x64 bundled runtime"
```

推送版本标签会触发 `.github/workflows/release.yml`，在 Windows runner 上测试、构建并发布完整安装包、轻量更新包、轻量更新包 blockmap 和指向轻量包的 `latest.yml`：

```powershell
git tag v0.9.31
git push origin v0.9.31
```

已安装的 Stable 会在启动后自动检查该 GitHub Release，后台下载完成后显示“重启并更新”。仅推送普通分支不会创建可安装版本；必须推送与 `package.json` 一致的版本标签，或在 GitHub Actions 手动运行 Release Stable。

面向普通用户的更新 Release 必须允许匿名读取。当前 `LLucas88/Stable` 仓库及 Release 已公开，客户端无需 GitHub 访问令牌即可检查和下载更新；禁止把任何发布凭据打进客户端。

## 数据与安全

- 用户数据保存在 Electron 用户数据目录，不纳入 Git 版本管理。
- API Key、临时附件、测试工作区和本地运行日志不会提交。
- Team 发送的是用户主动选择时的对话快照，不会持续同步之后的消息。

## 版本管理

- 版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。
- Git 标签与 GitHub Release 使用相同版本号。
- 每个远程更新 Release 同时提供完整首次安装包、轻量更新包、轻量更新包 blockmap 和指向轻量包的 `latest.yml` 更新清单。
