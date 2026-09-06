# 图示 617 项安装与手动调用

> 合并到 `codex-harness-integration` 后，沿用集成分支的技能菜单：手动选择在当前对话持续生效，移除即停止；单纯在聊天中点名不增加技能授权。定时触发和团队自动任务不加载这些选择。下文的 635 项实际登记数量记录的是原独立配置，Git 合并包含资源和安装代码，不迁移被忽略的个人数据库或路径配置。


2026-09-07，工作区 `E:\Stable-codex-skill-tencenthub`，分支 `codex-skill-tencenthub`。

本次按已有 1586 项离线目录中的图示条件筛选：搜索为空、全部方向、`external_service_possible === false`、许可证为 MIT / MIT-0 / Apache-2.0。结果恰为 617 项（MIT 536、Apache-2.0 76、MIT-0 5），没有重新按安装量排名或增加数量上限。

## 实际安装

- 617 项已登记到该分支原有的独立配置 `.local/tencenthub-profile`，加上原有 18 项，共 635 项。
- 新资源在 `desktop/skills/filtered/bundle`，含 617 个 SKILL.md 入口、原脚本、资料和许可证；为保留相对路径，同时带入这些源项目的共享资料，共校验 3696 个资源文件（44,705,282 字节，不含登记清单）。
- `bundle/manifest.json` 保留每项介绍、来源、分数、运行提示和文件哈希，`content-lock.json` 固定整个清单的 SHA-256。`.gitattributes` 禁止 Git 改写资源换行符。
- 本机路径配置为 `.stable-filtered-skills.json`，报告为 `.local/filtered-installation.json`；这些机器相关文件和数据库不进入版本库。资源、安装器与策略代码属于本分支工作区。
- 安装前原有 18 项数据库备份：`.local/skill-backups/stable-before-filtered-1788716193216.db`。重复安装也会另建备份。

## 调用规则

所有现有及以后新建的 Skill 都仅手动调用。市场中的“启用”表示允许用户选用，不代表会自动匹配。

允许的入口：技能市场“在对话中试用”、聊天手动引用技能，以及用户手动运行已经配置技能节点的工作流。普通任务不匹配技能；定时触发、团队自动分配和 AI 按相关性规划都不能自动选择技能。技能节点需在工作流编辑器中手动添加，AI 工作流生成不按任务目标自动选择技能。

执行层同时关闭旧的 `retrieveSkills`、`enabledSkillContent` 自动正文入口；`searchSkills` 只保留目录搜索。主对话、自动任务和团队路径区分人工调用上下文，Codex Harness 每轮也收到手动调用规则；当前对话明确保留的手动选择持续生效，历史正文中的调用记录不构成授权。原有禁用和删除选择保留。

## 运行和复现

在本工作区使用已安装的独立配置：

```powershell
npm start -- --stable-user-data="E:\Stable-codex-skill-tencenthub\.local\tencenthub-profile"
```

新检出准备好项目 Node/Electron 依赖后，无需再次下载来源即可安装此 617 项包：

```powershell
node scripts/install-filtered-skills.cjs --user-data .local/tencenthub-profile
npm run build
npm start -- --stable-user-data="E:\Stable-codex-skill-tencenthub\.local\tencenthub-profile"
```

安装器先校验全部资源，再获得指定配置的单实例锁、检查及备份 SQLite，最后事务登记；重复安装不会增加副本，保留用户编辑、停用和删除记录。启动同步仅作用于配置中指定的同一用户目录。其他目录不会被自动填入这些技能。

如需从原 1586 项源目录复核筛选，运行 `node scripts/prepare-filtered-skills.cjs <源目录> <新的空目标目录>`；源 manifest 必须匹配固定 SHA-256 `54d8091cbebce5f80fde384d18133ee92172bb886c0165d8560ef3fdd984589c`，目标已存在时拒绝覆盖。

## 验证与边界

已验证实际 617 项与筛选完全一致、资源哈希、数据库完整性、重复安装、用户编辑/停用/删除保留、手动调用与自动调用隔离、技能市场真实组件、Codex Harness 回归、TypeScript 检查及 Vite 构建。

“未检出外部服务线索”是源目录的静态标记，不代表已证明完全离线。第三方脚本未被批量执行，运行时依赖、账户或平台适配仍需按具体任务确认。源相对引用若指向未收录的其他技能，不会自动补装或连带调用。市场将这些条目标为“仅手动调用；静态筛选通过，脚本和依赖未作功能验证”。
