# Agent 专家市场

`agent-team` 从 `codex-harness-integration` 的 `26d405d` 创建，工作区为 `E:/Stable-agent-team`。图中的市场组件当时尚未提交，因此独立工作区带入了原目录当前改动作为实现基础；原目录与原分支未修改。基础文件哈希记录在本机 `E:/outputs/agent-team-baseline.json`。合并时以已提交公共基线 b655e6a 整理独立专家功能提交，不包含其他工作区的未提交修改。

## 交付行为

技能市场 → Agent专家提供 444 个离线条目：WorkBuddy 429 个（377 个单专家、52 个专家团队），豆包工作 15 个。只迁入已取得定义正文的条目；未迁入只有目录的豆包模板，也不把 8 个协作流程算作专家。合计 872 份定义文件，原文和逐文件 SHA-256 保留。

界面提供三列头像卡片、分类、名称/简介/标签搜索、来源筛选、我的专家、原文文件切换和依赖说明。426 张来源头像本地缓存，18 个条目使用文字头像；应用运行时不请求头像来源站点。布局在窄窗口切换为两列或一列，沿用 Stable 的主题。

专家目录默认不安装、不启用。添加时在用户数据目录 market-experts/<id>/ 创建 SKILL.md 和逐份定义副本，保存到现有技能存储；试用时创建对话并设置该专家的技能引用。停用、移除和重新添加均走现有存储语义，移除后目录条目仍可再次添加。本轮测试全部使用隔离数据目录，未修改真实用户的专家列表。

## 设定与运行能力

WorkBuddy 来源是原始专家定义。豆包包含 14 个团队专家的官方预览职责/约束字段，以及数据分析师当前已安装伙伴的 IDENTITY.md、SOUL.md、AGENTS.md；后者未与官方模板 ZIP 逐字比对。来源信息保留在内部资源中。专家详情隐藏平台标注，并对正文、文件名和依赖说明里的平台名称做展示层替换；原始定义与安装内容保留。

迁移的是角色定义和工作方法，不自动安装或执行原平台连接器、依赖脚本或云端能力。团队条目保留多角色设定，不声称已实现原平台多 Agent 调度。原文只作为角色参考，不能覆盖宿主规则。个人档案、USER.md、记忆、对话、凭据均未复制；原文可能提及这些名称，但未包含对应用户数据。

## 文件与复现

- desktop/assets/experts/catalog.json：目录及来源信息。
- desktop/assets/experts/definitions/：逐专家原文，每份文件附来源路径及哈希。
- desktop/assets/experts/source-checksums.json：定义包校验值。
- public/expert-avatars/：离线头像，由 Vite 构建复制到 dist。
- desktop/services/expert-catalog.cjs：目录、详情和安装封装。
- scripts/import-expert-catalog.cjs：从已有迁移目录重新导入。
- scripts/cache-expert-avatars.cjs：构建时缓存来源头像；无需登录。

数据已随本分支资源保存，运行项目不依赖 E 盘导出包。重新导入时才需要原迁移目录：

```powershell
node scripts/import-expert-catalog.cjs <WorkBuddy迁移目录> <豆包delivery-v3目录>
node scripts/cache-expert-avatars.cjs
npm run build
```

原项目的 node_modules 在本机作为目录联接复用；迁移到其他机器时正常 npm ci。没有打包或发布安装器。

## 验证

- npm run typecheck
- npm run build
- node --test tests/expert-catalog.test.cjs tests/feature-v2-services.test.cjs
- node --test tests/expert-market-ui.test.cjs tests/skill-market-ui.test.cjs tests/ops-skill-market-ui.test.cjs

10 个服务测试及 3 个隐藏 Electron 界面测试通过。界面测试使用真实 SkillMarket 与隔离 SQLite 存储，覆盖 444 条目录、原文切换、离线头像、筛选、添加、引用进入对话、移除、窄屏及原有市场回归。未调用真实模型验证每位专家的业务输出，也未执行任何来源脚本。

渲染截图在 qa-artifacts/agent-team/expert-market.png 与 expert-detail.png。
