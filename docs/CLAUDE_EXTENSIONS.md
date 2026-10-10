# Claude 分支：记忆、工具搜索与外部扩展

本文件仅适用于 `2cluade-agent`。共享用户数据库不需要迁移，主分支不读取这里新增的 Claude 配置。退出 Stable 后，从 `D:\stable-worktrees\Start-Claude-WSL2.cmd` 启动即可载入新的主进程代码；不需要重装安装包。

## 项目自动记忆（已启用）

- SDK 设置 `autoMemoryEnabled: true`，指定 `%APPDATA%\stable-desktop\claude\project-memory\<工作目录规范路径的 SHA256>`。
- 同一工作目录的不同对话共享记忆；不同目录（含不同工作树）隔离，不按 Git 仓库统一共享。项目目录移动后会使用新记忆目录。
- Stable 使用自定义系统提示，因此显式载入本项目 `MEMORY.md` 的前 200 行、最多 25 KB，并提供记录偏好、纠正与已验证知识的规则。后续主题文件由 SDK 原生 Read 读取；Write/Edit 更新仍需要 Stable 审批。
- 记忆不是额外目录权限，也不自动读取知识库、数据仓库或其他项目。记忆目录不传入 WSL 命令的可读/可写根目录；不能借此访问 Claude 会话或配置目录。
- 纯文字内部处理与只读任务关闭自动记忆；从可写模式切到只读会重建 SDK 上下文，避免历史携带记忆。原对话历史保留。
- 保持后台任务关闭，不启用后台记忆整理。此功能不保证每轮都写记忆，内容取舍由模型决定；请勿保存密钥、原始附件和完整聊天。

## 原生工具搜索（已启用）

- 开放 SDK `ToolSearch`，主 Agent 与受控 `stable-worker` 都可调用。它仅发现已注册工具，不联网安装扩展。
- `stable_exec` 常驻；其他 Stable MCP 工具按需加载，SDK 也可能延迟加载 NotebookEdit 等原生工具。
- Messages → Chat Completions 转接层将 SDK `tool_reference` 转为工具结果文字，并只向现有模型服务提供已成功搜索发现的工具定义。未发现的延迟工具不允许执行；压缩移除发现记录后需要重新搜索。
- 搜索成功不代表执行授权。原有文件边界、WSL2 命令沙箱、权限审批仍生效。Skill 白名单仍独立约束。
- 这是 Stable 对第三方模型接口的适配，不代表供应商原生支持 Anthropic 的 hosted tool-search API。

## 外部 MCP／SDK 插件（已接通，默认关闭）

2026-10-10 经用户明确授权接通运行链路。必须显式设置 `enabled: true` 才参与任务；缺少开关或设置为 false 时，旧声明不加载。纯文字内部轮次和只读任务始终不加载。不自动修改用户配置或连接外部服务。

在 Claude 工作目录执行：

```powershell
node scripts/configure-claude-extensions.cjs --init
node scripts/configure-claude-extensions.cjs --validate
```

配置文件：`%APPDATA%\stable-desktop\claude\extensions.json`。`--init` 只创建缺失文件，保留已有配置；默认内容：

```json
{ "version": 1, "enabled": false, "mcpServers": {}, "plugins": [] }
```

服务器声明示例（保持关闭，配置自己的服务器后再明确启用）：

```json
{
  "version": 1,
  "enabled": false,
  "mcpServers": {
    "reports": {
      "type": "http",
      "url": "https://your-server.example/mcp",
      "tools": ["query_report"]
    }
  },
  "plugins": []
}
```

- 支持声明 HTTPS HTTP/SSE，或本机 HTTP；工具名单是精确名称，不接受 `*`。可声明 `headers`，但 JSON 是本机明文配置，不是加密凭据库；校验输出不回显 header 值。
- 插件用 `plugins: [{ "path": "D:\\my-plugin" }]` 声明；要求普通本地目录、`.claude-plugin/plugin.json` 清单。Skills 经现有白名单导出器生成只含说明的 SDK 插件，`.mcp.json` 接入受控远程连接。原目录不直接交给 SDK，因此工具授权、独立代理和宿主命令预执行不会带入。引用目录仅增加只读访问。
- 拒绝 stdio、Hooks、Mods、插件 Agents、LSP 与任意配置覆盖，因为它们尚未适配现有 WSL2/权限边界。不会回退到 Windows 宿主 shell。
- MCP 要求任务已有网络权限，连接与发现前申请激活审批，每次工具调用再按精确名称、参数、配置指纹和访问范围审批，沿用 request／auto／full 和对话授权。ToolSearch 发现不代表可执行，白名单以外的调用拒绝；子 Agent 使用同样的审批 hooks。
- 配置、认证头或插件技能入口变化使旧扩展授权失效；下一轮重新建立上下文。审批等待期间变化也拒绝执行。禁用对下一轮生效；已发出的远程操作能否取消取决于服务器，不保证撤回。
- 连接审批不输出 headers 或 URL 查询参数。认证头仅用于指定服务器；模型服务密钥不附加到外部 MCP。连接随本轮 SDK 关闭；服务器连接失败会明确报错。
- 外部 MCP 操作在对应服务器执行，不属于本机 WSL2 隔离。本机命令继续走 WSL2，不能将远程工具称为受本地沙箱约束。
- `--validate` 始终离线；输出 `runtimeLoading: false` 指校验命令不启动运行时，`enabled` 才是后续任务开关。

## 验证

```powershell
node --test tests/claude-memory.test.cjs tests/claude-extensions.test.cjs tests/claude-messages-bridge.test.cjs tests/claude-harness.test.cjs tests/claude-tools.test.cjs tests/claude-native-tools.test.cjs
node --test --test-concurrency=1 tests/claude-sdk-integration.cjs
```

真实 SDK 集成使用本地模型替身，不使用用户密钥、不重跑用户任务。新增临时本机 HTTP/SSE MCP 验证连接前审批、白名单拒绝、调用允许／拒绝／取消、关闭状态无连接，以及插件 Skill 调用后的写入审批。不代表用户的真实远程服务器已验收。

2026-10-10：125 项相关测试通过（包含真实 SDK 与 HTTP/SSE/插件集成），另 1 项真实 SDK → WSL2 测试通过；TypeScript 与前端构建通过。未修改用户扩展开关、数据库或主分支，未重启 Stable。
