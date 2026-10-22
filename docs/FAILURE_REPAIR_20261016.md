# 37 项失败排查与修复记录

工作区：`D:\stable\.local\cluade-sdk-bash`，分支：`cluade-sdk-bash`。日期：2026-10-16。

## 结果

原结构回归的 149 项测试，从 **112 通过、37 失败** 恢复为 **149 通过、0 失败、0 跳过**。

- 23 项：旧源码断言与当前实现不一致，更新为当前功能契约。
- 9 项：隔离测试的模拟依赖不完整，补齐依赖；业务断言保留。
- 5 项：受限 Windows 沙箱的文件权限问题，改用正常宿主测试环境复核，原测试和安全断言无需改动。

本轮改动 12 个测试文件及本记录；没有修改产品源码、样式、安装配置或用户数据，也没有删除测试、增加跳过或降低业务校验。原有未提交改动保留。

## 逐项原因与处理

下表编号沿用原 149 项测试输出的序号，便于核对日志。

| 原编号 | 检查内容 | 已验证原因与处理 |
| --- | --- | --- |
| 1 | 输入框多选资源 | 仍要求数据库/知识库旧菜单、旧附件标签和横向滚动；当前为脚本/Skill 引用、文件卡片、自动换行。更新断言，继续校验多选、移除和点击外部关闭。 |
| 4 | 图片上传及执行 | 读取已删除的旧引擎 `harness.cjs`；改查 `claude-harness.cjs` 的图片加载和 SDK base64 内容，保留上传、粘贴、预览和保存检查。 |
| 6 | 产物与附件卡片 | 要求旧副标题文案；当前卡片使用文件类型和内置浏览器预览标签。更新展示断言，真实路径/工作区边界校验不变。 |
| 9 | 已发送附件与轨迹折叠 | 澄清回复现在经 `clarificationPendingContent` 处理；轨迹现在分组、状态变化后折叠。验证当前内容转换、分组渲染及折叠条件。 |
| 10 | 独立会话与权限 | 旧文字“完全访问权限”已缩短为“完全访问”；只调整文案断言，保留权限存储和独立运行校验。 |
| 13 | 工作流执行 | ScriptRunner 构造新增 packaged/resourcesPath 参数；精确断言三个参数，保留取消、输出命名和删除边的校验。 |
| 17 | Markdown 表格 | 字体已通过 `--font-body` 统一，测试仍硬编码微软雅黑；改查字体变量，保留表格复制与悬停几何检查。 |
| 20 | 侧栏工作区切换 | 旧断言要求模式切换在模块导航前；当前图标侧栏顺序已变。验证导航存在、切换位于其后且无大 Logo。 |
| 21 | 空会话动画 | 当前空态基于过滤后的 visibleMessages，并排除 liveTrace；更新条件，保留动画和居中布局检查。 |
| 22 | 流式文本 | 测试仍要求旧的两行截断和单段展开按钮；当前公开过程文字完整显示、整体轨迹折叠。验证实际文本渲染，保留流式更新和最终落库检查。 |
| 24 | 复制用户消息 | 澄清回复复制为“问题+答案”，普通消息仍复制原文；覆盖当前分支，继续禁止恢复草稿或资源。 |
| 26 | 全局 AGENTS 编辑 | 设置详情从弹层变为独立设置页；更新容器断言，保留读取、保存和生效范围检查。 |
| 27 | steer 去重和提交 | VM 测试缺少 automaticSkillCatalog、attachmentImages；补齐边界依赖，保留仅接受后提交和重复请求去重校验。 |
| 28 | steer 重试和不确定回执 | 同上；保留显式拒绝可重试、不确定回执不能重复发送、终止阶段拒绝的断言。 |
| 37 | GitHub 更新器 | 设置模块现在使用局部 update 变量及 action，旧断言依赖旧写法与文字顺序；检查当前 downloaded 分支调用 install，发布源及安装策略检查不变。 |
| 39 | 工具文件边界 | 沙箱临时目录创建 junction 报 EPERM；正常 Windows 环境原测试通过，遍历、ADS、链接逃逸、覆盖和取消检查全部保留。 |
| 40 | 打包依赖 | 内置 Python 在沙箱临时目录写 probe.xlsx 报 PermissionError，被包装成“依赖不完整”；正常环境依赖验证通过，无需重装依赖。 |
| 45 | Catch 消息准备 | VM 执行真实 prepareAgentMessage 时缺少 path；注入 Node path，继续校验忽略渲染端伪造内容、使用完整权威正文。 |
| 71 | Cloud 启动 | 当前 Cloud 由 STABLE_CLOUD_ENABLED 显式启用，窗口加载后恢复；旧测试仍要求打包即启用、窗口前恢复。更新启动契约，保留凭据脱敏检查。 |
| 72 | Cloud 登录及设置界面 | 旧设置详情弹层断言失效；检查独立设置页和实际 sidebar-layout.css，保留登录、密码字段、错误和额度展示检查。 |
| 73 | Cloud 模型目录 | 模拟 Store 缺少 getSetting，无法读取一次性默认模型迁移标记；补齐未迁移状态，保留目录替换、回环路由和禁止用户修改 Cloud 模型的断言。 |
| 79 | 日志轮转 | 沙箱阻止旧日志 rename，生产代码按约定吞掉诊断写入失败，测试找不到 .1 文件；正常环境原轮转、脱敏和日志失败不影响请求的测试全部通过。 |
| 83 | 按需上下文 | 旧测试要求自动 retrieveData/retrieveKnowledge；当前不再自动注入这两类资源。验证无自动检索，保留手动 Skill、按请求返回工作台清单和失败落库检查。 |
| 113 | 任务列表与菜单 | 打开任务现需退出设置并切回 work/agent；旧回调断言只含 setPage。校验完整回调，保留持久置顶和菜单限制检查。 |
| 114 | 置顶任务 | 超过五条后的列表使用 LimitedTaskRows；旧测试直接查 pinnedConversations.map。改查共享列表入口，保留直接取消置顶和运行中限制。 |
| 116 | 更新进度按钮 | 旧测试要求设置图标上的手动下载圆点；当前是独立下载进度按钮。验证下载状态和点击后安装，保留下载 IPC。 |
| 117 | 设置图标位置 | 原生 title 和横向 margin 已改为自定义 data-tooltip 与底部控制区；更新相应断言。 |
| 119 | 文件预览越界 | 沙箱临时目录创建 junction 报 EPERM；正常环境原 canonical path 和链接越界拒绝测试通过。 |
| 123 | 项目路径变化 | 沙箱临时目录 rename 报 EPERM；正常环境原测试通过，历史保留与按需新建上下文检查不变。 |
| 126 | Cloud 思考强度：legacy-default-model | 模拟 Store 缺少 getSetting；补齐未迁移状态，继续检验模型解析、强度参数和不支持档位拒绝。 |
| 127 | Cloud 思考强度：old-local-profile-id | 同上，保留旧会话模型 ID 不被篡改的检查。 |
| 128 | Cloud 思考强度：deepseek-v4-pro | 同上。 |
| 129 | Cloud 思考强度：deepseek-flash | 同上。 |
| 130 | Cloud 思考强度：空 ID | 同上。 |
| 142 | 任务反馈 | 已成功恢复结果时错误栏清空；旧断言只允许直接写 feedback。改查 completed 条件，保留取消过滤、真实错误和队列决策检查。 |
| 144 | 置顶和子 Agent 轨迹 | 置顶列表使用共享限量渲染；sessionId 的 TypeScript 非空断言使旧正则失配。更新两处断言，保留子 Agent 与无卡片轨迹设计检查。 |
| 148 | 问鼎入口 | ConversationWending 已移入 ConversationTools；测试仍从 App 查旧直接引用。检查 App→ConversationTools→ConversationWending 链路，保留预填不自动执行和桥接检查。 |

## 验证与界面保持

- 原同组 149 项：149 通过，无失败、跳过或取消。
- 57 项额外行为回归：全部通过。覆盖模块边界、模拟 SDK 的图片/续聊/审批/取消、轨迹分组、澄清内容、模型迁移/路由和自动更新。
- 6 项隔离隐藏窗口验证：全部通过。覆盖浅深色与模型预设、输入区、项目、侧栏、字体、导入与续聊。
- `npm run typecheck`、`npm run build` 通过。构建仍有原先的大 chunk 提示。
- 构建前后 JS/CSS 完全一致：
  - `index-CYeZH3Jp.js` SHA256：`D1B5F61D8D2B40690C1E9AC6B1156EC24A677FAA9750C016A74EB409FA861B17`
  - `index-C0t5WTvA.css` SHA256：`4E91B381F48C66328C5ACDA4DAC2767C6D49C1654399AB565D75E0FED8945E0D`

这里的“149 项”是上一轮的同一组回归，不代表运行了仓库所有测试。没有调用付费模型、真实云端接口或执行安装升级。

## 复现

在正常 Windows PowerShell 中运行；文件链接、内置 Python 和日志轮转测试需要正常临时目录权限，不应在受限沙箱中把权限异常直接判断为产品故障。

```powershell
cd D:\stable\.local\cluade-sdk-bash
node --test --test-concurrency=1 tests/agent-composer-ui.test.cjs tests/agent-p0-ui.test.cjs tests/agent-steer-ipc.test.cjs tests/approval-mode-routing.test.cjs tests/approval-notification-decision.test.cjs tests/artifact-line-reference.test.cjs tests/automation-ui.test.cjs tests/builtin-excel.test.cjs tests/catch-and-conversation-tools.test.cjs tests/clarification-attachments.test.cjs tests/clarification-ipc.test.cjs tests/clipboard-files.test.cjs tests/cloud-account.test.cjs tests/cloud-desktop-integration.test.cjs tests/cloud-transport.test.cjs tests/context-loading.test.cjs tests/duration-format.test.cjs tests/execution-workspace.test.cjs tests/failed-turns.test.cjs tests/global-instructions.test.cjs tests/html-editor-ipc.test.cjs tests/launch-splash-ui.test.cjs tests/library-rename-ui.test.cjs tests/message-prediction-ipc.test.cjs tests/model-switching-ui.test.cjs tests/navigation-workspace-ui.test.cjs tests/preview.test.cjs tests/project-ipc.test.cjs tests/reasoning-configure-ipc.test.cjs tests/report-studio-ui.test.cjs tests/skill-selection.test.cjs tests/task-alerts-desktop.test.cjs tests/task-feedback.test.cjs tests/team-conversation-ui.test.cjs tests/wending-cli.test.cjs
```

本机证据保存在 `.local/failure-repair-20261016/`：`host-before.json/log` 为修复前正常宿主复跑；`final.json/log` 为最终同组结果；`behavior.log`、`ui.log` 为额外验证；`tests-before/` 为本轮修改前测试快照。原沙箱结果仍保存在 `.local/structure-refactor-20261016/after-source-tests.json/log`。
