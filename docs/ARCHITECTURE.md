# 当前分支结构

本页描述 `cluade-sdk-bash` 的实际源码组织。版本以 `package.json` 为准；当前为 1.1.0。README 中旧版本的安装、Codex/DSH 执行与发布记录是历史信息，不代表当前分支的运行方式或发布状态。

本轮调整和验证边界见 [结构整理验证记录](STRUCTURE_REFACTOR_VALIDATION.md)。

## 入口与执行链路

```text
src/main.tsx → App.tsx（应用壳、导航、聊天）
             ├─ pages/（数据、知识库、技能、定时）
             ├─ settings/SettingsWorkspace.tsx（设置导航与内容）
             ├─ imports/DataImport.tsx（多来源导入）
             └─ components/、shared/（共用展示与格式化）
                    ↓ window.stable
desktop/preload.cjs → desktop/main.cjs → ipc/（领域接口注册）
                                        ↓
                                  services/（业务服务）
                                        ↓
             Claude Agent SDK / 本地 SQLite 与文件 / 浏览器 / Cloud
```

`main.cjs` 保留应用生命周期、窗口、Agent 调度和跨服务编排。`ipc/cloud.cjs`、`ipc/automations.cjs`、`ipc/resources.cjs` 注册各自领域的接口，接收明确依赖。可能在注册后变化的窗口和启动 Promise 通过 getter 读取，不能在注册时固定其旧值。

`execution-harness.cjs` 当前导出 `ClaudeHarnessRunner`。`claude-harness.cjs` 接入 Claude Agent SDK，`claude-messages-bridge.cjs` 处理模型协议适配，`model-registry.cjs` 管理本地或 Cloud 模型路由。Codex 导入来源与 Agent 执行引擎是两个概念。原生 Bash 的权限边界见 [CLAUDE_NATIVE_BASH.md](CLAUDE_NATIVE_BASH.md)。

## 数据导入边界

多来源实现集中在 `desktop/services/data-import/`：

| 文件 | 职责 |
| --- | --- |
| `service.cjs` | 预览、选择导入、历史记录、产物复制、旧存档转换与上下文 |
| `ipc.cjs` | 本机扫描与手动目录选择接口 |
| `workbuddy-reader.cjs` | WorkBuddy 解析及导入读取工具 |
| `codex-reader.cjs` | Codex 本地会话和资源解析 |
| `chatgpt-reader.cjs` | 已有 ChatGPT 导入兼容能力；当前设置页不提供该来源入口 |

新界面使用 `window.stable.dataImport` 和通用 `Import*` 类型。以下兼容标识刻意保留，不能仅为名称统一而修改：

- `window.stable.workbuddy`、`stable:workbuddy:*` IPC 通道和旧模块导出。
- `workbuddy_imports` 表、`workbuddy-context:*` 设置键、导入目录及来源记录。
- 现有 CSS 类名、设置分类 ID 和历史存档恢复路径。

旧服务文件仅转发到新实现，包含通过旧 reader 路径启动 Worker 的兼容入口。导入的验证、路径约束、备份和凭据处理仍由原实现执行。

## 样式顺序

`src/styles/app.css` 作为有序入口导入：

1. `app/shell.css`：基础与应用壳。
2. `app/conversation.css`：聊天与输入区。
3. `app/resources.css`：资源、工作流、团队及其他基础组件。
4. `app/surface-overrides.css`：现有表面与状态覆盖。
5. `app/feature-overrides.css`：后续功能覆盖。

这次拆分不调整选择器、属性或优先级。`main.tsx` 仍按 tokens → app → workbench-surfaces 加载；App 依赖的组件样式保持原顺序。修改组件导入顺序也可能改变 CSS 层叠，必须检查构建产物或界面。

## 本地运行和验证

```powershell
npm run typecheck
npm run build
npm start
```

`npm start` 加载 `dist/index.html`。`npm run dev` 只启动 Vite 服务，不会自动把普通 Electron 启动切到开发服务器。

结构边界测试：`node --test tests/structure-boundaries.test.cjs`。导入测试：`node --test --test-concurrency=1 tests/workbuddy-import.test.cjs tests/codex-import.test.cjs tests/chatgpt-import.test.cjs`。隐藏窗口测试使用隔离用户目录，见 `tests/*-ui.test.cjs` 和 `tests/fixtures/`；静态源码断言及内联 CSS 使用 `tests/helpers/read-source.cjs` 跟随拆分文件。

实际用户数据、真实供应商调用和安装升级不由这些结构检查覆盖。完整测试入口为 `npm test`；已有失败需与改前基线分别记录。

## 本轮保留的边界

聊天状态和任务执行仍有较多代码集中在 App/main；其他服务仍保持原路径。这轮只提取边界明确的模块，不更换状态管理、数据库结构、依赖或打包规则，也不做样式重设计。
