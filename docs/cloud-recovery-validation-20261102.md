# Cloud 登录、诊断和更新恢复验证（本地 main）

日期：2026-11-02。范围：D:\stable 本地 main 的源码、前端构建和隔离验证。没有推送、发布 Release、生成正式安装包、升级其他设备或修改真实用户数据。

## 本次补齐

- 账号页在恢复登录、未登录、连接失败和强制改密状态下，都可以进入“软件更新”和导出脱敏诊断。更新检查本来就独立于 Cloud 登录，本次保留并验证这一点。
- 主进程账号请求的 15 秒期限覆盖响应头与正文读取；即使底层忽略取消也会结束等待。前端恢复登录 IPC 有 35 秒兜底，过期回复不会覆盖后续登录状态或本地工作区。
- 新增 `logs/cloud-recovery.jsonl`：账号请求的 start / headers / complete / timeout / error、耗时、更新状态和有限错误码。`headers + 200` 仅表示收到响应头；`complete` 才表示正文读取和 JSON 解析结束，并不单独证明界面已登录。
- 导出固定来源的网络和恢复日志，采用字段和值白名单、文件大小与记录数限制，忽略损坏行。排除账号身份、密码、令牌、聊天、请求/响应正文、原始异常、URL 和本机路径。报告仅保存到用户选择的本机位置，不上传。写日志失败不影响登录或更新。
- 更新页说明已有备份与失败回退机制。检测到安装目录的 `Rollback-Stable.ps1` 时，可以在资源管理器定位它；按钮不会直接执行回退。开发版和首次安装没有该脚本时显示说明。

## 下次故障的处理路径

1. 能打开客户端但无法登录：在账号页重试；持续失败可直接进入软件更新，或导出诊断给管理员。
2. 更新下载/安装报错：在软件更新页查看状态、导出诊断。自动下载后仍需用户选择安装，退出不会自动安装。
3. 升级程序的本地启动检查失败：安装器退回旧程序；不会把云端断线当成程序回退条件。
4. 需要人工回退：先保存工作并退出所有 Stable，再按管理员指导使用安装目录中的回退脚本。没有脚本或界面无法打开时，向管理员获取完整修复安装包；不要删除用户数据目录。

**数据边界：** 手动回退恢复升级前配置和聊天数据库。被替换的当前数据保留在恢复目录中，工作区文件保留；升级后新增聊天不会自动合并到旧数据库。真实设备上的数据合并需要单独核对。

## 已执行的验证

| 验证 | 结果 |
| --- | --- |
| 登录、超时、传输、脱敏导出、更新与手动回退单元/集成测试 | 31 项通过 |
| 数据备份与恢复、文件锁、旧程序保留（另含 6 项更新控制重复覆盖） | 14 项通过 |
| 隐藏 Electron 窗口：恢复成功、连接失败、模拟安装版默认模式 | 3 项通过；更新和导出无需登录；草稿保留 |
| 轻量升级启动检查 | 1 项通过；使用迁移后 Node，缺失运行时拒绝升级 |
| NSIS 生产安装段的隔离场景 | 19 项通过，证据目录 `qa-artifacts/installer-runtime-NIFfpV` |
| Chromium 本地代理/流式/正文挂起/脱敏检查 | 9 个检查通过，证据目录 `qa-artifacts/cloud-electron-71bd6d84-22eb-4346-98f3-784cf9a2f7a9` |
| TypeScript 检查和前端生产构建 | 通过；Vite 仍有既存大 chunk 提示 |

一次文件轮转测试在沙箱临时目录失败，在真实 Windows 环境重测通过。隐藏界面测试的一次固定 80 毫秒等待发生竞态，改为等待实际状态后，三种模式均通过。上述问题均有明确重测结果，未据此推断线上故障原因。

复测命令（仓库根目录，真实 Windows 环境）：

```powershell
npm run typecheck
npm run build
node --test tests/support-diagnostics.test.cjs tests/cloud-account.test.cjs tests/cloud-startup-deadline.test.cjs tests/cloud-transport.test.cjs tests/updater.test.cjs tests/manual-rollback.test.cjs
node --test tests/upgrade-backup.test.cjs tests/update-maintenance.test.cjs tests/installer-profile-lock.test.cjs
node --test --test-concurrency=1 tests/cloud-startup.test.cjs tests/upgrade-runtime.test.cjs
node tests/installer-runtime-integration.cjs
```

## 验证边界

原故障日志中的 HTTP 200 不足以确定用户设备卡在响应正文还是界面状态恢复；这次复现并覆盖了两类失效路径，不能宣称已复现那台设备的唯一根因。

本轮没有重新调用付费模型、访问生产账号、实际安装新版本或让其他设备升级。后台窗口用临时数据和模拟 Cloud/更新响应；安装器测试使用隔离的模拟程序负载。发布前仍需对最终签发的完整安装包及旧版升级包做真实安装验收。其他设备现有 v1.11.2 不会因本地源码修改自动获得修复。
