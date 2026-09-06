# 数据库启动故障处理记录（2026-09-06）

## 已验证结论

此前后台测试检查的是 Codex 的 MSIX 私有 AppData 副本，而用户普通 PowerShell 读取的是另一个、确实损坏的数据库。相同的逻辑路径不代表相同文件。因此，之前“原库健康”“间歇初始化异常”“后台启动成功即修复”的推断不成立。此前记录保存在 E:/outputs/stable-native-profile-snapshot/DATABASE_STARTUP.before-native-repair.md，仅供追溯。

| 环境 | 实际文件 | 修复前情况 |
| --- | --- | --- |
| Codex 子进程 | C:/Users/25702/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Roaming/stable-desktop/stable.db | 3,227,648 字节；7 个对话、4 条消息、179 个技能；完整性检查通过 |
| 普通桌面 PowerShell | C:/Users/25702/AppData/Roaming/stable-desktop/stable.db | 737,280 字节；数据库结构损坏；只读完整性检查和建表前的日志模式查询均报 malformed |

重定向通过文件标识、大小和 SHA-256 验证。普通桌面数据库原始 SHA-256 为 e11c48556fd86ce9150871433ebae6089093bfb90b1f4030d0ad880e17671b43。重定向解释了此前为何测试成功而用户仍失败；数据库最初如何损坏尚未查明，不能据此认定 WAL、多实例或磁盘硬件导致损坏。

Microsoft 对此类目录重定向的说明：https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes

## 本次恢复

先从普通桌面环境复制原始数据库，在离线副本上使用官方 SQLite .recover --ignore-freelist 恢复。依据恢复出的原始表结构、rootpage 和主键索引重建数据，重建可派生的全文索引；没有用只有 4 条消息的后台副本覆盖用户历史。

原库恢复得到 11 个对话、27 条消息、4 个项目和 1 个技能。随后补入后台副本中新增的 1 个空对话、178 个技能和 skill-creator 适配内容，并从健康旧备份补回 9 条有原始主键索引佐证的运行日志。合并前后逐行比较原始恢复的消息和项目，完全一致。最终为 12 个对话、27 条消息、4 个项目、179 个技能（48 个启用）和 12 条运行日志。

损坏库恢复不等于能够证明所有损坏前数据均已找回；这次对可恢复记录、索引与现存备份进行了交叉验证。原库、原始恢复 SQL 和中间副本全部保留。

2026-09-06 20:19（北京时间），在普通桌面环境通过 Electron 维护进程完成替换。维护进程先取得目标 profile 的单实例锁，核对原库与恢复副本哈希，再暂存、备份、替换；失败时回滚。原库和原有技能文件备份目录：

    C:/Users/25702/AppData/Roaming/stable-desktop/database-native-recovery/2026-09-06T12-19-17-373Z/

恢复副本 SHA-256 为 f315934e55d8f0f9a374bd5d511d758b59f74a7a8868edbd28492816ffe5c634，安装后文件标识为 12103423998789544，大小为 3,444,736 字节。该真实 profile 配置 version=1、journalMode=DELETE。配置日志模式本身不是本次修复成立的依据，恢复并验证真实数据库才是。

同时将 skill-creator 的 72 个文件复制到真实 profile 的 skills/aa6317f5-126c-470b-94ea-076dd3f746dd，并逐文件校验哈希；其注册记录已启用，兼容性为 local-workflow，可见性没有 removed 或 policyPaused 标记。

## 普通 PowerShell 启动验证

2026-09-06 20:20 左右，通过 Win32_Process.Create 直接启动独立 Windows PowerShell 5.1.26100.9168，在 E:/Stable（codex-harness-integration 分支）执行 npm start。仅将终端输出重定向到日志；没有使用 STABLE_STARTUP_PROBE、QA 配置、替代数据库目录或替代应用入口。

PowerShell 启动前读取到的数据库大小为 3,444,736 字节，证明读取了刚恢复的真实 profile。npm 输出为 electron .，主进程 PID 49092，主窗口标题 Stable，窗口响应正常，renderer 进程已创建。该实例保留供用户使用。

20:22，在普通桌面环境独立只读复核：文件标识与安装报告一致，integrity_check=ok，foreign_key_check 无错误；27 条消息与 4 个项目和恢复副本逐行一致；skill-creator 已启用且文件存在。最新数据库启动错误仍是修复前的 19:50，没有产生新的数据库启动错误。

可复核证据：

- E:/outputs/stable-native-profile-snapshot/native-install-report.json
- E:/outputs/stable-native-profile-snapshot/native-after-start.json
- E:/outputs/native-final-powershell.txt
- E:/outputs/native-final-start.log
- E:/outputs/stable-native-profile-snapshot/ready-native-verification.json
- E:/outputs/stable-native-profile-snapshot/restoration-verification.json

## 后续启动

退出已有 Stable 实例后，在普通 PowerShell 中运行：

```powershell
Set-Location 'E:\Stable'
npm run build
if ($LASTEXITCODE -eq 0) { npm start }
```

已有构建且没有改前端代码时，只需 npm start。npm 脚本保持原样。

既有的启动诊断和一次有界重试仍保留：仅初始化配置失败且独立只读完整性检查通过时才重试，不会清空或自动替换损坏库。此前 17 项存储回归测试通过，但这些测试不能替代真实用户环境验证，也不能证明当时的“间歇故障”推断。

维护排查时应先比对文件标识、大小和内容，而不能仅凭 app.getPath('userData') 返回的字符串判定两个进程使用同一数据库。