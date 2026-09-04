# 更新后 Harness 运行时缺失

用户反馈：从 Stable 内点击“安装更新”后，应用能打开，但发消息提示“Stable 的 Harness 运行时不完整，请重新安装”。

## 已验证与尚未确认

- 修复基于远端 main `6659bd1fd6ad9d9a31a3976c443708056eb53b37`（0.91.7），使用独立工作区。
- 该错误发生在模型请求前：应用找不到运行时的 `node/node.exe` 或 `dsh/node_modules/@deepseek-ai/dsh/lib/bin.js`。
- Release 的 Setup 包包含运行时，Update 包不包含；应用内更新正常传入 `--updated`。
- 旧安装器仅在 `--updated` 且目标目录已有 Stable.exe 时走原子更新，否则走旧版卸载分支；旧卸载器还会删除持久运行时，旧版安装分支缺少最终运行时检查。这两条分支能制造“装完能开界面但无法对话”的状态。
- 用户确认通过应用内更新，所以不能将“手动双击未带参数”认定为故障机的根因。故障机的安装路径、更新前版本、运行时缺失位置及更新日志尚未取得，也未在该设备验证修复。
- 进一步在实际 Electron 宿主复现：更新后的旧目录清理使用递归 `rmSync`，会沿旧目录内的 Windows Junction 删除外部运行时文件。相同测试在旧 main 上得到 `runtime: false`，修复后为 `runtime: true`。故障机是否存在这种目录链接仍待确认。

## 本次修改

1. 轻量包通过独立 NSIS include 声明自身为更新包，无论是否带 `--updated`，都进入运行时迁移、健康检查与回滚流程。
2. 轻量包或带 `--updated` 的安装在目标目录无 Stable.exe 时返回 E21，不再降级为卸载重装。
3. 卸载器收到替换安装使用的 `--updated` 时保留持久运行时；用户主动卸载继续按原规则清理。
4. 缺失运行时的提示明确指向 Stable-Setup 完整包修复；开发版提示准备 runtime/ 或 STABLE_DSH_RUNTIME。
5. 新增只读诊断脚本及隔离 NSIS 执行回归，并加入发布流水线。
6. 更新旧目录清理与 Harness 临时目录清理共用逐项 lstat、先解除链接的删除函数；不会沿目录链接删除运行时。测试退出清理也应用相同保护。

## 故障机恢复

先从托盘退出 Stable，然后使用同一安装范围和原安装目录，运行 [Stable-Setup-0.91.7-x64.exe](https://github.com/LLucas88/Stable/releases/download/v0.91.7/Stable-Setup-0.91.7-x64.exe) 完整安装包进行覆盖修复。用户数据目录保留；不要使用不含运行时的 Stable-Update 包来补文件。重新启动并发送一句测试消息，才算故障机恢复验收。

修复前可以在故障机运行以下只读检查，保留定位证据：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\diagnose-harness-runtime.ps1 -InstallDirectory '实际的 Stable 安装目录'
```

脚本只输出安装版本、安装路径以及运行时入口存在性，不读取聊天、密钥或业务数据，不安装、不删除、不改注册表。

## 验证方法与范围

```powershell
node tests/installer-runtime-integration.cjs
node tests/harness-integration.cjs
npm run typecheck
npm run build
npm test
```

NSIS 回归编译并静默执行生产安装段落，实际检查文件迁移、保留、健康检查失败回滚、错误退出码和旧安装路径保持。仅替换包解压、进程关闭、注册表及快捷方式操作，全部写入独立 qa-artifacts 目录。覆盖应用内/手动更新、内嵌/持久运行时、空安装、错误目录、运行时缺失及回滚，共 10 个场景。该测试不等价于完整安装器在真实用户电脑上的验收。

真正发布前仍需在一次性 GitHub Windows runner 完整安装/更新/回滚验收，并在故障机确认消息发送恢复。此次未推送 main、未创建版本标签或 Release。

本地最终验证：NSIS 10 场景通过；Electron 目录链接回归旧代码失败、修复通过；类型检查、生产构建、完整更新包编译通过。全量 247 项中 245 项通过，2 项真实 Harness 测试在同时构建时超时；随后串行复测 3/3 通过（包含这 2 项），未放宽断言或超时限制。

打包产物的 Stable.exe + app.asar 已实际调用独立 Harness 与本地模拟模型，返回 `HARNESS_INTEGRATION_PASS requests=1 events=5`。本地验收更新包 SHA-256：`19F57C16BD58344FC91D23D734137678CF8505381ADCA2A9044DE416285806CC`。此包版本仍为 0.91.7，未作为正式更新发布，也不能补齐故障机已经丢失的运行时。

本轮曾因旧测试退出清理沿链接删除共享运行时。已从本机已有运行时备份仅补回缺失文件，保留仍存在的文件；Node 和 Harness 入口哈希与备份一致，版本探针为 0.1.0-rc.5。后续已使用独立运行时副本，原工作区代码与用户数据未改动。
