# SDK 原生 Bash

`cluade-sdk-bash` 基于 `2cluade-agent` 的提交 `74b0a19` 和该工作区当前未提交源码快照 `18e4131`。原工作区、索引、用户数据库、安装包与交付物未修改；快照只收录源码与源码配置。

## 命令执行

- 使用固定版本 `@anthropic-ai/claude-agent-sdk@0.3.296` 的原生 `Bash`，由 Claude Code 运行时执行；Stable 不再注册 `mcp__stable__stable_exec` 或调用自定义 WSL 命令执行器。
- Windows 使用 Git for Windows 的 Bash。支持 `CLAUDE_CODE_GIT_BASH_PATH`，也会检测常见安装目录；其他位置可由 SDK 自行发现。命令使用 Bash 语法，Windows 路径例如 `/d/project`。原生文件工具仍使用 Windows 路径。
- 参数为 `command`、可选 `timeout`（毫秒，默认 60000，最大 600000）、`description`。不接受旧工具的 `cwd`、`timeoutMs`；不开放后台执行或 `dangerouslyDisableSandbox`。
- 运行详情保留命令原文；完成后展示标准输出、标准错误、中断及完整输出文件位置。错误由 SDK 失败 hook 报告，不把失败显示成成功。
- Windows 取消任务时先终止当前 SDK 进程树，再关闭 SDK，防止 Git Bash 子进程在取消后继续写入；不会按进程名称批量终止其他会话。失败与取消不会回滚已发生的写入。

## 权限

| 任务状态 | Bash |
| --- | --- |
| 可写且允许网络 | 开放；每次调用进入 Stable 审批流程 |
| 禁网 | 不注册，hook 和权限回调也拒绝 |
| 只读 | 不注册，即使额外传入允许网络也拒绝 |
| 内部纯文本任务 | 无工具 |

主 Agent 与受控子 Agent 使用相同工具名单和审批 hook。`PreToolUse` 在 SDK 自身自动放行之前检查，`canUseTool` 作为备用通道；同一次调用不会重复请求相同审批。保留 Stable 手动审批、自动审查、完全访问及本次对话授权的既有选择。

审批绑定完整命令、参数、目录、权限范围及命令运行方式。Git Bash `/c/...` 路径的脚本指纹参与授权摘要，脚本变化后旧授权失效。切换禁网、只读或从旧工具策略迁移时重建 SDK 会话上下文，保留 Stable 历史。

**本机 Bash 没有 WSL2 目录和网络隔离。** 用户放行的命令可访问当前 Windows 账户可访问的文件及网络；审批提示会说明这一点。原生 Read/Write/Edit 等文件工具继续保留已有目录检查。参见 [官方沙箱说明](https://code.claude.com/docs/en/sandboxing)、[Windows Bash 配置](https://code.claude.com/docs/en/setup) 与 [SDK 权限顺序](https://code.claude.com/docs/en/agent-sdk/permissions)。

## 验证与本地运行

```powershell
Set-Location 'D:\stable\.local\cluade-sdk-bash'
npm.cmd run typecheck
npm.cmd run build
node --test tests/claude-bash.test.cjs tests/claude-harness.test.cjs tests/claude-native-tools.test.cjs tests/claude-tools.test.cjs tests/claude-approval.test.cjs tests/claude-entrypoints.test.cjs tests/tool-approval.test.cjs tests/run-progress.test.cjs tests/prompts.test.cjs tests/trace-timeline.test.cjs
npm.cmd run test:claude-integration
```

SDK 集成使用真实 Claude Code 可执行文件与 Git Bash，模型服务由本机测试夹具响应。它验证批准、拒绝、中文写入和输出、失败、超时、取消中止、子 Agent 及禁网/只读工具列表；不代表真实供应商或桌面 GUI 人工验收。

本地工作区复用原 Claude 工作区的依赖。没有制作安装包或重启正在运行的 Stable。旧 WSL 实现及安装脚本暂作为历史兼容文件保留，已不在当前模型命令执行链路中。

2026-10-10 验证结果：71 项相关回归、37 项真实 SDK 集成全部通过；TypeScript 检查、前端构建和内置 Python/PowerShell/ExcelJS 依赖校验通过。未执行桌面 GUI 人工验收或真实供应商调用，未制作安装包。
