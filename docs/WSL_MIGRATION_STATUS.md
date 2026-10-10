> 本文记录原 `2cluade-agent` 分支的实现与历史验收。当前 `cluade-sdk-bash` 的命令执行和权限差异见 [SDK 原生 Bash](CLAUDE_NATIVE_BASH.md)。

# WSL2 迁移验证记录

分支：`2cluade-agent`；来源：`codex/cluade-agent`。保留原有未提交工作，未提交或推送本轮代码。

## 已完成

- 执行入口只导出 ClaudeHarnessRunner。删除旧 Codex 服务、app-server/RPC、Responses 转换、搜索/工具适配、准备脚本和 npm 依赖；移除失去入口的旧 DeepSeek 执行框架。
- 共享模型联网搜索与审批摘要抽取为中性模块，保持当前模型服务与审批模式。旧数据迁移和私有目录保护不依赖旧程序。
- 活动 runtime/codex 已移入 `.local/wsl-migration-20261008-155419/retired-runtime`；这份备份不在 Git 或打包范围内。保留用户已有安装包和历史。
- stable_exec 改为 WSL2 + 官方 sandbox-runtime；提供独立发行版安装、规则、工具、取消和超时协议。SDK 与原生文件 hooks 仍在 Windows；宿主专用工具走结构化接口。
- 安装与打包不再要求旧代理程序；运行目录只允许 Node/PowerShell。完整安装保留 PowerShell 目录，不因 Node 环境迁移被移动走。

## 已验证

- TypeScript 检查、Vite 构建通过；未制作正式安装包。
- 相关回归首轮 95 项通过；最后一轮 Claude/WSL/审批/移除检查 64 项通过。
- 真实 Claude SDK 本地模拟模型协议集成：15 项通过。该证据不代表当前真实供应商的新一轮调用验收。
- 真实隐藏 Electron 浏览器/Excel 工具链：2 项通过。
- 安装运行环境迁移与回滚：12 个隔离场景通过。
- 问鼎固定宿主入口实际输出 `crm-brand-cli, version 0.9.0.dev9`；会话品牌隔离与 WSL 工具检查 10 项通过。
- Linux 运行器 JS 语法、PowerShell 入口语法、SRT 配置 schema 已检查；Linux Node 固定版本的官方 SHA256 清单已核对。

## 2026-10-09 重启后实际验收

- 专用 Ubuntu 24.04 StableAgent 已安装，WSL2 内核 `6.18.40.1-microsoft-standard-WSL2`；非 root stable 用户 UID 1000。Node 22.22.2、sandbox-runtime 0.0.79、Python、Git、ripgrep、curl、jq、bubblewrap 和 socat 可执行。
- 安装器修复：不重复转换已经是 WSL2 的发行版；识别实际 AppArmor 内核支持；复用已安装工具和 Node；官方 npm 锁文件、下载超时/重试；WSL 输出统一 UTF-8。网络不稳定时，缺失的 node-forge 官方包经锁文件 SHA512 校验后加入本机 Linux 缓存。
- 发现并修复 NTFS 大小写别名绕过：可写命令改在 Linux ext4 副本运行，成功后校验差异回写；所有 Windows 原目录不以可写挂载暴露。拒绝规则路径、大小写冲突、不兼容名称、链接变化和用户并发修改。复制/回写限制和剩余竞态详见工具规则文档。
- `npm run test:wsl-integration`：12 项通过，0 失败/跳过。覆盖工具、UTF-8、越界读写、只读、规则目录、复制进来的 Windows exe、超时、取消、后台进程、大小写攻击、正常新增/修改/删除、并发修改、授权网络和直连拒绝。
- 同一验收还启动了真实 Claude SDK/Claude 程序，经实际 Stable 审批调用实际 WSL Bash，写入文件并把命令结果交回模型适配器。供应商为本地模拟回复，未使用真实模型密钥。
- 最终审批/工具/执行入口/Claude harness/旧运行时移除回归：41 项通过；本轮 TypeScript 检查通过。
- 日志：`.local/wsl-setup-20261009-ready.log`、`.local/wsl-acceptance-final-20261009.log`、`.local/wsl-regression-final-20261009.log`、`.local/wsl-typecheck-20261009.log`。

## 尚未完成

- 全量测试首轮：550 项中 522 通过、25 失败、3 跳过。随后修复了迁移相关样式引用、旧工具夹具和问鼎测试入口，删除已退役引擎测试并保留中性供应商测试；全量套件尚未重新全部通过。
- 其余首轮失败涉及旧 UI/Cloud/上下文断言、部分 UI 夹具、字体请求和共享登录超时；未完成逐项基线归因，不能把它们全部称为既有失败。日志位于 `.local/wsl-full-tests.log`。
- 工作区存在其他同时更新的浏览器相关改动；这些内容保持原样，不回退或覆盖。

## 复现命令

在 `D:\stable` 运行：

```powershell
npm run sandbox:setup
npm run test:wsl-integration
```

安装仅配置带 Stable 管理标记的专用 StableAgent；发现同名非托管发行版会拒绝修改。不修改其他发行版，不自动重启 Windows。重复安装前须停止 Stable 命令。本机无需再次重启 Windows。

详细工具规则见 [CLAUDE_AGENT_SDK.md](CLAUDE_AGENT_SDK.md)。
