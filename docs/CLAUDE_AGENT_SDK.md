> 本文记录原 `2cluade-agent` 分支的实现与历史验收。当前 `cluade-sdk-bash` 的命令执行和权限差异见 [SDK 原生 Bash](CLAUDE_NATIVE_BASH.md)。

# Claude Agent SDK + WSL2

`2cluade-agent` 分支仅使用官方 `@anthropic-ai/claude-agent-sdk@0.3.296`（Claude Code 运行时 2.1.296）。聊天、工作流 AI 节点、定时任务、协作规划/执行/综合、审批模型共用这个入口；旧的 STABLE_HARNESS 值不再切换引擎。

模型服务沿用 Stable 当前配置。供应商密钥留在 Electron 主进程，Claude 使用每轮独立回环令牌访问 Messages → Chat Completions 适配器。不要求 Stable Cloud；已配置的 Cloud 模型来源仍可选。第三方模型兼容性由 Stable 适配，并非 Anthropic 官方保证。

## 执行边界

- Claude SDK 及原生文件工具运行在 Windows。Read、Write、Edit、Glob、Grep、NotebookEdit 经任务路径和审批 hooks 检查；这些工具不属于 WSL 内核隔离，检查到实际打开文件之间仍存在竞态窗口。
- stable_exec 只执行 WSL2 Bash。Windows 父进程通过管道发送 JSON，不拼接宿主 shell。专用发行版 StableAgent 使用无 sudo 权限的 stable 用户。
- Linux 中官方 sandbox-runtime 0.0.79 使用 bubblewrap 与网络代理。默认拒绝网络；只读任务始终拒绝网络。任务授权网络后通过 SRT 代理放行，仍保留网络命名空间约束。
- Windows 磁盘、用户目录、其他临时目录和运行器目录默认隐藏，仅重新开放授权任务根目录和运行必需的只读 Node/seccomp 文件。
- 可写命令先复制授权目录到 Linux ext4 临时区，再挂载到相同任务路径执行。Windows 原目录不以可写方式交给命令，避免 NTFS 大小写别名绕过只读挂载。成功退出后才校验并回写普通文件；失败、超时、取消、大小写冲突、规则改动或检测到用户并发修改时拒绝回写。只读命令直接读取只读挂载。
- 每个可写根目录最多 20000 项、512 MiB（包括隐藏文件）；超限需缩小任务目录或使用原生文件工具，不自动排除内容。目录复制增加启动与磁盘开销；链接改动、特殊文件、Windows 不兼容名称和硬链接文件改写不回写。回写先整体校验，再逐文件操作，不提供跨文件事务；操作系统 I/O 失败或校验后的并发替换仍可能导致部分回写，不能宣称无竞态。
- 专用发行版禁用 Windows interop 和 Windows PATH 注入，不暴露 Docker socket、不启用弱化沙箱选项。运行器安装在 root 所有的 /opt/stable-agent。
- 超时、取消或父管道断开会终止本次 Linux 命令进程组，不终止其他任务。供应商凭据与 WSLENV 不进入命令环境。
- Excel、共享浏览器、技能安装和 stable_wending 是受控 Windows 接口，不属于 Linux 沙箱。问鼎固定调用内置 Python 的 crm_cli.cli，只接受 argv，不接受 shell、解释器代码或环境；每次调用需审批，登录仍使用专用界面。
- 用户明确选择的工作流脚本继续使用 Windows ScriptRunner。它不是模型任意 shell，也不宣称受 WSL 沙箱隔离。

WSL 或工具不完整时命令报错，不回退到宿主 shell。旧运行程序、app-server、Responses 桥、搜索 MCP 和打包依赖已移除。旧历史的只读迁移代码和私有目录保护仍保留，用户历史不会删除。已有安装包和迁移备份不参与当前运行/打包。

## 2026-10-09：原生 Skills 白名单与报告任务修复

- 每轮把手动选中的技能与允许自动调用的技能合并，通过独立本地插件导出到 SDK `skills` 精确白名单。保持 `settingSources: []`，不加载其他用户或项目的 Claude 配置。仅导出技能说明，引用资源继续从原授权目录读取；技能 frontmatter 中的工具授权、独立代理设置和动态宿主 shell 预执行不会带入。
- 原生 `Skill` 调用进入 Stable 执行记录；文件读写、命令、网络仍走原有边界。技能列表或内容改变时重建 SDK 上下文，保留本地会话历史，避免恢复已经撤销的技能授权。文字澄清与审批模型轮次不开放技能或工具。
- 本地 HTML 预览支持 `报告.html#锚点` 与带查询参数的 file URL；先验证实际文件，再保留查询和锚点。真实包含 `#` 的文件名仍可打开，越界路径仍被拒绝。
- WSL 使用带随机标识的监督器阶段通知，分别计算准备（120 秒）、命令执行（用户预算及 5 秒监督余量）、子进程清理（30 秒）、同步（120 秒）、最终清理（30 秒）时间。执行超时仍由 Linux 监督器终止命令；同步或清理超时不会误报为脚本执行超时，也不会承诺已经发生的回写可整体撤销。
- 失败信息同时保留 stdout 与 stderr，避免代理警告盖住真实结果。退出码 1 不会被全局视为成功；预期的 grep 无匹配需要显式分支处理，退出码 2 等错误仍失败。跨命令依赖放在项目 `_work`，不依赖隔离的 `/tmp`；数据类型和 HTML 结构校验要求已加入执行规则。
- SDK 集成测试使用真实运行程序与本地模型替身，不代表真实供应商任务已重跑；历史执行记录不改写。
- 本次验证：60 项相关回归通过，真实 SDK 集成通过（包含白名单拒绝、原生 Skill 加载与子 Agent 调用），13 项 WSL 集成通过，TypeScript 检查通过。当前 18 项自动授权技能均可导出；原报告带 `#c_prio` 的后台预览返回 HTTP 200。主分支未修改，用户数据库开关未修改。

## 2026-10-09：项目记忆与原生工具搜索

项目自动记忆与原生 ToolSearch 已启用；外部 MCP／插件已接通默认关闭的运行链路（2026-10-10）。目录隔离、审批、第三方模型适配及外部扩展限制见 [CLAUDE_EXTENSIONS.md](CLAUDE_EXTENSIONS.md)。

## 2026-10-10：新版能力接入

- 读取 `initializationResult().claude_code_version`，写入会话索引 `cliVersion`，并在任务执行记录“执行环境”显示；缺失时显示“版本未返回”。
- 子 Agent 独立 `autoCompactWindow` 取主任务预算的 80%，限定为 SDK 接受的 100000–1000000 且不超过主任务预算。官方 DeepSeek Flash 对应主任务 800000、子 Agent 640000。预算不足 100000 时不传该字段：实测更小值会使 CLI 拒绝整个代理定义，此时继承运行时行为，不承诺小窗口自定义已生效。
- 外部扩展默认关闭，显式启用后的连接和调用走现有审批；插件仅接入净化后的 Skills 与远程 MCP。保留 WSL2、`permissionMode: 'default'` 和后台任务禁用，不开放宿主进程插件。
- 125 项相关测试、另 1 项真实 WSL2 联通、TypeScript 与前端构建通过。模型与 MCP 为本机测试替身；未运行真实供应商或桌面交互验收。
- 修改前备份：`C:\Users\HUAWEI\AppData\Local\Temp\stable-sdk-features-ded890c5e51c43f8b3ea0039da7140e3`。未修改共享数据库、用户配置、主分支，未重启 Stable。

## 安装与验证

### 2026-10-10 SDK 升级验收

- 官方 SDK 从 `0.3.285` 升级并精确锁定为 `0.3.296`，本机 Windows x64 运行程序实测为 `2.1.296 (Claude Code)`。发布说明：https://github.com/anthropics/claude-agent-sdk-typescript/releases/tag/v0.3.296 。锁文件相对升级前仅变更 SDK 及其平台运行时包。
- 新版 SDK 的类型文档说明：省略 `permissionMode` 时可能默认进入 `auto`。实测这会使原有子 Agent 测试进入安全分类与 SubagentHandback 流程，最终超时。入口现显式指定 `permissionMode: 'default'`，继续由 Stable 的 hooks、审批回调和 MCP 工具处理器控制权限；未使用 `bypassPermissions`。已添加配置回归断言。
- 修正后 98 项相关测试全部通过（含 19 项真实 SDK 集成测试）；另 1 项真实 SDK → WSL2 审批、执行、文件回写和模型结果回传测试通过。`npm run typecheck` 通过。真实 SDK 和 WSL 测试使用隔离临时目录及本地模拟模型服务，没有调用真实供应商，也不等于桌面界面验收。
- SDK 的 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 警告针对 `mcp__stable__*` 不进入 SDK 的 `canUseTool` 回调；Stable MCP 处理器内部仍执行原有审批。真实 WSL 测试验证了审批后才执行，回归测试也覆盖拒绝和取消。
- 本次未关闭或重启 Stable，未修改主分支、共享数据库或用户模型配置。完成当前任务并手动退出 Stable 后，通过 `D:\stable-worktrees\Start-Claude-WSL2.cmd` 重新启动 Claude 分支，确保加载新版入口和依赖。
- 升级前文件备份位于 `C:\Users\HUAWEI\AppData\Local\Temp\stable-sdk-upgrade-e9be483c7d2a42e7b3742754827d8058`，包含 `package.json`、`package-lock.json`、`claude-harness.cjs` 和本文档。临时目录可能被系统清理，需长期保留时另存。
- 如需回退，先手动退出该分支的 Stable，在 `D:\stable-worktrees\2cluade-agent` 执行 `npm install --save-exact @anthropic-ai/claude-agent-sdk@0.3.285 --ignore-scripts --no-audit --no-fund`，同步入口的 `SDK_VERSION` 与本文档版本，并重新运行兼容性测试；显式 `permissionMode: 'default'` 及对应断言可保留。若恢复备份文件，应先比较此后修改，避免覆盖后续开发；不要使用 Git reset 清除该分支已有未提交工作。

1. 管理员 PowerShell：`wsl --install --no-distribution`。系统要求重启时，保存工作并手动重启。
2. 源码目录：`npm run sandbox:setup`。只创建/配置 StableAgent，不修改其他发行版，不主动切换默认发行版（系统安装的首个发行版可能自动成为默认）。重复安装前先停止 Stable 命令。
3. `npm run test:wsl-integration`：真实验证文件边界、UTF-8、网络拒绝、Windows exe 拒绝、超时与取消。环境缺失时测试失败，不静默跳过。

采用官方 Ubuntu 24.04；工具为 Node.js 22.22.2、Bash、Python3/venv/pip、Git、ripgrep、curl、jq、unzip、bubblewrap、socat。Node 归档校验官方 SHA256，npm 使用锁文件，系统包来自 Ubuntu 签名仓库。

打包后安装入口为 resources/wsl-setup/setup-wsl-sandbox.ps1，运行器和锁文件在 resources/wsl-agent。升级不会自动启用系统组件或重启。

## 工具规则

stable_exec.command 使用 Bash；Windows D:\项目\资料 对应 /mnt/d/项目/资料。cwd 参数及原生文件工具仍使用 Windows 路径。子 Agent 继承相同工具和审批，不开放原生 Bash/PowerShell。禁止 Windows exe、sudo、自行修改沙箱或绕过技能安装入口。

request 等待人工审批，auto 交给审查器，full 自动批准但不取消沙箱限制。工具策略版本变化会新建 SDK 上下文，保留本地可见历史，避免继续使用旧 PowerShell 描述。

## 本机状态（2026-10-09）

已安装 WSL 3.0.1、Ubuntu 24.04 StableAgent、Node 22.22.2 和 sandbox-runtime 0.0.79，使用无 sudo 权限的 stable 用户。真实 WSL/SDK 验收 12 项通过，包含大小写攻击、并发写入、网络授权正反对照、取消、超时和实际 Claude SDK 调用；模型回复由本地模拟供应商提供，本轮未调用真实供应商。

WSL2 本身不是 Windows 安全边界；本实现的命令限制来自 Linux 命名空间、SRT/seccomp、Linux 副本和受控回写。Windows 原生文件工具与专用接口仍依赖宿主检查。参见 [微软 WSL 安全模型](https://wsl.dev/technical-documentation/security/)。WSL2 的 binfmt 注册项属于虚拟机级别，不能用其存在性判断发行版互操作开关，参见 [微软互操作实现说明](https://github.com/microsoft/WSL/blob/master/doc/docs/technical-documentation/interop.md)。
