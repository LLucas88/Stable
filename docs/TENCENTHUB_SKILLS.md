# 腾讯 SkillHub 技能迁移

分支 `codex-skill-tencenthub` 基于 `codex-harness-integration` 的 `8afa67c` 创建。原工作区的未提交改动不属于本次迁移。

候选来自 2026-09-05 23:37（北京时间）SkillHub 安装量前100项快照；排序字段为 installs，不是 downloads。95个指定版本可以下载，5个返回404。固定源地址、版本、压缩包及文件 SHA-256 保存在 `desktop/skills/tencenthub/catalog.json`，适配后文件锁保存在同目录 `content-lock.json`。

本次范围：18项已迁移；9项重复或已有功能覆盖；68项因依赖、账户配置、宿主协议或执行链路未验证而暂缓；5项原包无法获取。暂缓不等于永远无法迁移，补齐条件后需要逐项复核。没有为这些技能安装额外Python包、模型权重、外部CLI或建立第三方账户连接。

## 安装位置和运行

本机18项已登记并启用在这个分支工作区的独立 Stable 配置 `.local/tencenthub-profile`。适配包在 `.local/tencenthub/20260906-final`，包含167个有效资源文件和独立的原始来源副本。当前没有写入日常 Stable 用户数据库，也没有安装到 Codex 全局技能目录。

在此工作区查看独立技能市场：

```powershell
npm run build
npm start -- --stable-user-data="E:\Stable-codex-skill-tencenthub\.local\tencenthub-profile"
```

这是独立配置，不包含日常配置中的模型凭据和对话。上面的命令由用户需要预览时运行；迁移过程未主动打开或控制客户端界面。分支启动配置绑定安装器明确指定的用户数据目录，启动其他配置时跳过同步。

## 新检出上的可复现安装

Git 保存目录清单、适配文本、脚本和哈希锁。下载内容、数据库、路径配置和安装报告在 `.local` 中，不进入版本库；新检出不会自动取得这些本机文件。先按仓库原有流程准备 Node/Electron 依赖，再执行：

```powershell
node scripts/prepare-tencenthub-skills.cjs
node scripts/install-tencenthub-skills.cjs --user-data .local/tencenthub-profile
```

prepare 下载固定版本，检查归档路径、大小上限和原件哈希，应用适配。输出目录已存在时拒绝覆盖；可用 `--output <新目录>` 保留不同准备结果，然后给安装器传 `--source <新目录>`。已审查来源缓存可用 `--cache <sources目录>`，仍逐文件校验。上游改变固定版本或失去下载能力会失败，不会静默安装新版本。

安装器在数据库写入前验证全部锁定文件，获取目标配置的 Electron 单实例锁；有客户端占用时拒绝写入。已有数据库先完成完整性检查和备份，再用事务登记。重装保留用户编辑、禁用状态、删除标记，并跳过同原始ID的已有技能；编号冲突会整批回滚。备份保存在 `.local/skill-backups`，报告为 `.local/tencenthub-installation.json`。新建独立配置没有旧数据库，因此本次不需要备份。

日常 Stable 配置需要用户另行明确允许写入后，才能用同一安装器指定该目录。不会通过启动配置间接把独立安装传播到其他配置。

## 适配和能力边界

- 登记到 Stable 原有市场和按需检索流程，保留分组、版本、原始编号及来源；没有改动 Harness 协议和全局系统指令。
- 参考资料和脚本相对路径解析到技能资源目录，输出写入当前任务工作区。使用当轮实际提供的工具，原平台工具名不代表接口已连接。
- UI 检索保留原始 CSV 和脚本，新增隔离模式入口，使用 Stable 自带 Python 的 `-I -B -X utf8` 运行；默认不使用覆盖输出的 `--persist`。
- agent-memory 使用明确工作区路径的 SQLite/FTS5。它是关键词检索，中文分词有限；recall 会更新访问统计，不是纯只读操作。
- ppt 迁移为离线竖屏 HTML 模板，去掉外部字体和 CDN；不能把 HTML 文件声称为 PPTX。
- 办公类保留格式方法，按真实工具能力处理。Excel 工具存储公式但不重算；Word/PPT 的复杂模板往返和最终版面需针对产物另行核验。
- 外部账户、定时任务、邮件和发布按用户请求及实际配置执行。已验证的离线功能不代表每种外部服务都已连通。

## 已迁移18项

|原排名|Skill / 版本|市场名称|用途|适配说明|
|---:|---|---|---|---|
|1|[self-improving-agent](https://skillhub.cn/skills/clawhub_pskoett/self-improving-agent) / 3.0.24|工作经验与纠错日志|记录工具错误、用户纠正和已验证经验，追加工作区学习日志。|使用工作区日志；移除自动钩子、人格改写和跨会话传播。|
|4|[summarize](https://skillhub.cn/skills/clawhub_paudyyin/summarize) / 1.0.0|文本与文档摘要|长文本、文档与网页摘要，提取要点、关键词和来源。|移除不存在的 summarize CLI；使用实际文本与文档读取能力。|
|5|[skill-vetter](https://skillhub.cn/skills/clawhub_spclaudehome/skill-vetter) / 1.0.0|技能来源与代码审查|审查待安装技能的来源、脚本、文件访问、依赖和网络行为。|按实际副作用审查，修正仅凭下载量或关键词判定安全的规则。|
|11|[agent-memory](https://skillhub.cn/skills/clawhub_dennis-da-menace/agent-memory) / 1.0.0|本地事实与经验记忆|在当前工作区用 SQLite 保存和检索事实、经验及实体。|指定工作区数据库路径；使用内置 Python SQLite FTS5，准确标注关键词检索。|
|12|[excel-xlsx](https://skillhub.cn/skills/clawhub_ivangdavila/excel-xlsx) / 1.0.2|Excel 文件与公式检查|Excel XLSX 公式引用、数据类型、日期和模板保留检查。|对接 stable_excel；说明公式不自动重算和复杂格式限制。|
|13|[word-docx](https://skillhub.cn/skills/clawhub_ivangdavila/word-docx) / 1.0.2|Word 文档结构与修订|DOCX OOXML 样式、编号、修订、批注和节布局的编辑指导。|保留文档方法；仅使用已提供的文件能力，按任务验证渲染和复杂往返。|
|14|[weather](https://skillhub.cn/skills/clawhub_steipete/weather) / 1.0.0|天气查询与预报|通过公开天气服务查询城市天气、温度和预报。|改用 Windows curl.exe 和 HTTPS，查询失败不输出臆造天气。|
|24|[automation-workflows](https://skillhub.cn/skills/clawhub_jk-0001/automation-workflows) / 0.1.0|业务自动化流程设计|评估重复任务、设计触发条件和动作、测试失败处理及计算自动化回报。|保留流程设计；修正回本计算，连接器和定时运行仅按实际能力执行。|
|26|[data-analysis](https://skillhub.cn/skills/clawhub_ivangdavila/data-analysis) / 1.0.2|分析口径与统计推断|定义指标口径、比较基线、置信区间与混杂因素，解释分析结论。|方法指南不要求 pandas；按实际文件和查询工具执行。|
|35|[powerpoint-pptx](https://skillhub.cn/skills/clawhub_ivangdavila/powerpoint-pptx) / 1.0.1|PowerPoint 模板与结构|PPTX 母版、占位符、备注、图表与模板编辑检查。|保留 OOXML 方法；已有 pptxgenjs 可用于生成，渲染能力按任务检查。|
|37|[prompt-engineering-expert](https://skillhub.cn/skills/clawhub_tomstools11/prompt-engineering-expert) / 1.0.0|提示词设计与评估|改进提示词、自定义指令和示例，制定输出验收与对照测试。|补齐参考资料路由；请求可验证依据，不要求披露隐藏思维过程。|
|38|[deep-research-pro](https://skillhub.cn/skills/clawhub_parags/deep-research-pro) / 1.0.2|多来源专题研究|拆分研究问题、检索多来源、交叉核对并交付带引用的研究报告。|替换固定 DDG 脚本和 sessions_spawn，使用当轮搜索能力与工作区路径。|
|40|[marketing-skills](https://skillhub.cn/skills/clawhub_jchopard69/marketing-skills) / 0.1.2|营销与转化优化方法库|23 个营销模块：SEO、转化率、A/B 测试、定价、落地页、邮件及广告文案。|保留23个引用模块；模块示例不代表账号已连接或已授权发布。|
|48|[ppt](https://skillhub.cn/skills/clawhub_zhj7860/ppt) / 1.0.0|竖屏 HTML 演示稿|将讲稿生成带键盘翻页与进度导航的竖屏 HTML 演示文件。|限定 HTML 输出；保留模板，替换远程字体与 Tailwind 为本地 CSS。|
|54|[ui-ux-pro-max](https://skillhub.cn/skills/clawhub_xobi667/ui-ux-pro-max) / 0.1.0|UI 设计系统与资料检索|查询配色、字体、组件及技术栈资料，生成 UI 设计系统与交互方案。|修正资源相对路径；使用内置Python运行标准库检索，默认不持久化覆盖文件。|
|64|[news-summary](https://skillhub.cn/skills/clawhub_joargp/news-summary) / 1.0.1|每日新闻文字简报|读取公开 RSS，按主题归纳新闻并给出发布时间和链接。|迁移无需密钥的文字简报；语音输出需另有已配置的TTS能力。|
|74|[agent-team-orchestration](https://skillhub.cn/skills/clawhub_arminnaimi/agent-team-orchestration) / 1.0.0|多智能体任务与交接设计|设计多智能体职责、任务状态、产物交接和审查流程。|映射到当轮实际Codex协作能力；不强制创建团队、切模型或修改全局配置。|
|84|[ai-news-collectors](https://skillhub.cn/skills/clawhub_kenxcomp/ai-news-collectors) / 1.0.0|AI 新闻收集与核对|按产品、研究、商业、社区与政策收集 AI 新闻，去重并核实来源。|替换 web_fetch 别名；按证据和用户范围检索，去除无依据的覆盖率承诺。|

## 全部100项决定

|原排名|Skill|决定|依据 / 待补条件|
|---:|---|---|---|
|1|[self-improving-agent](https://skillhub.cn/skills/clawhub_pskoett/self-improving-agent)|已迁移|使用工作区日志；移除自动钩子、人格改写和跨会话传播。|
|2|[find-skills](https://skillhub.cn/skills/clawhub_root/find-skills)|暂缓|原件依赖 SkillHub/ClawHub 查找与安装流程，不能直接写入 Stable 市场；当前已有专门安装器。|
|3|[self-improving](https://skillhub.cn/skills/clawhub_ivangdavila/self-improving)|去重|与本次 self-improving-agent 重叠，并包含原宿主的主动执行与全局记忆约定。|
|4|[summarize](https://skillhub.cn/skills/clawhub_paudyyin/summarize)|已迁移|移除不存在的 summarize CLI；使用实际文本与文档读取能力。|
|5|[skill-vetter](https://skillhub.cn/skills/clawhub_spclaudehome/skill-vetter)|已迁移|按实际副作用审查，修正仅凭下载量或关键词判定安全的规则。|
|6|[agent-browser](https://skillhub.cn/skills/clawhub_rez0/agent-browser)|暂缓|缺少 agent-browser CLI，且原件要求优先于宿主浏览器，尚未适配其命令协议。|
|7|[github](https://skillhub.cn/skills/clawhub_steipete/github)|暂缓|缺少 gh CLI；本次未建立 GitHub 登录环境。|
|8|[humanizer](https://skillhub.cn/skills/clawhub_biostartechnology/humanizer)|去重|已安装 ops-market-humanizer，已有文案自然化工作流。|
|9|[ontology](https://skillhub.cn/skills/clawhub_oswalpalash/ontology)|暂缓|图谱 schema 读写依赖未提供的 PyYAML；原脚本 create 与 validate 分离，不能照搬每次写入已校验的承诺。|
|10|[proactive-agent](https://skillhub.cn/skills/clawhub_halthelobster/proactive-agent)|暂缓|依赖 OpenClaw 工作区、心跳、WAL 和主动任务机制，不能用技能文本接管 Harness 生命周期。|
|11|[agent-memory](https://skillhub.cn/skills/clawhub_dennis-da-menace/agent-memory)|已迁移|指定工作区数据库路径；使用内置 Python SQLite FTS5，准确标注关键词检索。|
|12|[excel-xlsx](https://skillhub.cn/skills/clawhub_ivangdavila/excel-xlsx)|已迁移|对接 stable_excel；说明公式不自动重算和复杂格式限制。|
|13|[word-docx](https://skillhub.cn/skills/clawhub_ivangdavila/word-docx)|已迁移|保留文档方法；仅使用已提供的文件能力，按任务验证渲染和复杂往返。|
|14|[weather](https://skillhub.cn/skills/clawhub_steipete/weather)|已迁移|改用 Windows curl.exe 和 HTTPS，查询失败不输出臆造天气。|
|15|[auto-updater](https://skillhub.cn/skills/clawhub_maximeprades/auto-updater)|原包不可获取|SkillHub 指定版本下载返回404，无法获取与核验原件。|
|16|[gog](https://skillhub.cn/skills/clawhub_steipete/gog)|暂缓|缺少 gog CLI 与 Google Workspace 账户授权。|
|17|[akshare-stock](https://skillhub.cn/skills/clawhub_mbpz/akshare-stock)|暂缓|Stable 内置 Python 未提供 AkShare 及其行情分析依赖。|
|18|[nano-pdf](https://skillhub.cn/skills/clawhub_steipete/nano-pdf)|暂缓|缺少 nano-pdf CLI 及其模型配置。|
|19|[ima-skills](https://skillhub.cn/skills/tencent-adm/ima-skills)|暂缓|需要腾讯 ima 用户凭据和专用 API 配置，本次未提供。|
|20|[openai-whisper](https://skillhub.cn/skills/clawhub_steipete/openai-whisper)|原包不可获取|SkillHub 指定版本下载返回404，无法获取与核验原件。|
|21|[api-gateway](https://skillhub.cn/skills/clawhub_byungkyu/api-gateway)|暂缓|需要 Maton 账户、凭据和目标应用 OAuth 连接。|
|22|[gemini](https://skillhub.cn/skills/clawhub_steipete/gemini)|暂缓|缺少 Gemini CLI 及账户配置。|
|23|[notion](https://skillhub.cn/skills/clawhub_steipete/notion)|暂缓|需要 Notion API 令牌及目标工作区授权。|
|24|[automation-workflows](https://skillhub.cn/skills/clawhub_jk-0001/automation-workflows)|已迁移|保留流程设计；修正回本计算，连接器和定时运行仅按实际能力执行。|
|25|[self-improving-agent-cn](https://skillhub.cn/skills/clawhub_zhengxinjipai/self-improving-agent-cn)|去重|与本次 self-improving-agent 的错误、纠正与学习日志核心流程重叠。|
|26|[data-analysis](https://skillhub.cn/skills/clawhub_ivangdavila/data-analysis)|已迁移|方法指南不要求 pandas；按实际文件和查询工具执行。|
|27|[pdf-extract](https://skillhub.cn/skills/clawhub_xejrax/pdf-extract)|暂缓|依赖原件要求的 PDF 提取运行工具，Stable 内置 Python 未提供对应 PDF 库。|
|28|[self-reflection](https://skillhub.cn/skills/clawhub_hopyky/self-reflection)|暂缓|依赖 jq/date 与原宿主反思脚本，核心日志范围已由 self-improving-agent 覆盖。|
|29|[memory-setup](https://skillhub.cn/skills/clawhub_jrbobbyhansen-pixel/memory-setup)|暂缓|修改 Moltbot/Clawdbot memorySearch 配置，不适用于 Codex Harness。|
|30|[wechat-article-search](https://skillhub.cn/skills/clawhub_wuchubuzai2018/wechat-article-search)|暂缓|搜索脚本需要专用抓取依赖及可访问的微信搜索链路，尚未验证运行路径。|
|31|[openclaw-tavily-search](https://skillhub.cn/skills/clawhub_jacky1n7/openclaw-tavily-search)|暂缓|需要 TAVILY_API_KEY，不能把其他搜索接口冒充 Tavily。|
|32|[markdown-converter](https://skillhub.cn/skills/clawhub_steipete/markdown-converter)|原包不可获取|SkillHub 指定版本下载返回404，无法获取与核验原件。|
|33|[a-stock-analysis](https://skillhub.cn/skills/clawhub_cnyezi/a-stock-analysis)|暂缓|行情脚本需要额外网络/数据依赖和实时行情验证，本次未提供。|
|34|[tencent-docs](https://skillhub.cn/skills/tencent-adm/tencent-docs)|暂缓|需要 TENCENT_DOCS_TOKEN 与腾讯文档账户授权；不能从 Stable 登录推定已具备。|
|35|[powerpoint-pptx](https://skillhub.cn/skills/clawhub_ivangdavila/powerpoint-pptx)|已迁移|保留 OOXML 方法；已有 pptxgenjs 可用于生成，渲染能力按任务检查。|
|36|[brave-search](https://skillhub.cn/skills/clawhub_steipete/brave-search)|暂缓|需要 Brave Search API 密钥及其脚本依赖。|
|37|[prompt-engineering-expert](https://skillhub.cn/skills/clawhub_tomstools11/prompt-engineering-expert)|已迁移|补齐参考资料路由；请求可验证依据，不要求披露隐藏思维过程。|
|38|[deep-research-pro](https://skillhub.cn/skills/clawhub_parags/deep-research-pro)|已迁移|替换固定 DDG 脚本和 sessions_spawn，使用当轮搜索能力与工作区路径。|
|39|[memory-manager](https://skillhub.cn/skills/clawhub_marmikcfc/memory-manager)|暂缓|依赖原宿主记忆布局和 shell 管理脚本，不能直接读取或替换 Stable 会话记忆。|
|40|[marketing-skills](https://skillhub.cn/skills/clawhub_jchopard69/marketing-skills)|已迁移|保留23个引用模块；模块示例不代表账号已连接或已授权发布。|
|41|[sonoscli](https://skillhub.cn/skills/clawhub_steipete/sonoscli)|暂缓|缺少 sonos CLI 与目标音箱连接。|
|42|[local-whisper](https://skillhub.cn/skills/clawhub_araa47/local-whisper)|暂缓|缺少 Whisper、音频运行依赖与模型权重。|
|43|[video-frames](https://skillhub.cn/skills/clawhub_steipete/video-frames)|暂缓|缺少 ffmpeg；原 shell 脚本未完成 Windows 运行适配。|
|44|[xiucheng-self-improving-agent](https://skillhub.cn/skills/clawhub_xiucheng/xiucheng-self-improving-agent)|去重|与本次 self-improving-agent 的对话反思和改进记录重叠。|
|45|[mx-finance-data](https://skillhub.cn/skills/clawhub_financial-ai-analyst/mx-finance-data)|暂缓|依赖东方财富金融数据服务的专用访问配置，尚未验证。|
|46|[admapix](https://skillhub.cn/skills/clawhub_fly0pants/admapix)|原包不可获取|SkillHub 指定版本下载返回404，无法获取与核验原件。|
|47|[wechat-article-spider](https://skillhub.cn/skills/clawhub_chenchaoqun/wechat-article-spider)|暂缓|爬虫需要额外抓取与解析依赖，原件执行链路尚未验证。|
|48|[ppt](https://skillhub.cn/skills/clawhub_zhj7860/ppt)|已迁移|限定 HTML 输出；保留模板，替换远程字体与 Tailwind 为本地 CSS。|
|49|[stock-monitor-skill](https://skillhub.cn/skills/clawhub_thirtyfang/stock-monitor-skill)|暂缓|依赖行情库、预警调度和消息渠道，不能用文本登记替代。|
|50|[stock-watcher](https://skillhub.cn/skills/clawhub_robin797860/stock-watcher)|暂缓|依赖同花顺抓取脚本与额外 Python 库，尚未验证。|
|51|[remotion-video-toolkit](https://skillhub.cn/skills/clawhub_shreefentsar/remotion-video-toolkit)|暂缓|需要 Remotion、React 视频项目及渲染环境，本次未配置。|
|52|[stock-market-pro](https://skillhub.cn/skills/clawhub_kys42/stock-market-pro)|暂缓|缺少 yfinance、matplotlib 等行情和制图依赖。|
|53|[using-superpowers](https://skillhub.cn/skills/clawhub_zlc000190/using-superpowers)|暂缓|强制每次回复前调用原 Skill 工具，与 Stable 按需检索和用户指令边界冲突。|
|54|[ui-ux-pro-max](https://skillhub.cn/skills/clawhub_xobi667/ui-ux-pro-max)|已迁移|修正资源相对路径；使用内置Python运行标准库检索，默认不持久化覆盖文件。|
|55|[swelist](https://skillhub.cn/skills/user_159cc044/swelist)|暂缓|缺少 swelist CLI，原说明不包含可直接运行的完整实现。|
|56|[ai-persona-os](https://skillhub.cn/skills/clawhub_jeffjhunter/ai-persona-os)|暂缓|强依赖 OpenClaw 5.x 人格、心跳、频道路由和记忆工具，迁移需要宿主级重写。|
|57|[ai-ppt-generator](https://skillhub.cn/skills/clawhub_ide-rea/ai-ppt-generator)|暂缓|需要百度文库 API 密钥及其服务访问配置。|
|58|[youtube-watcher](https://skillhub.cn/skills/clawhub_michaelgathara/youtube-watcher)|暂缓|缺少 yt-dlp 及字幕提取运行依赖。|
|59|[humanizer-zh](https://skillhub.cn/skills/clawhub_liuxy951129-cpu/humanizer-zh)|去重|现有 ops-market-humanizer 与 doubao-human-signal 已覆盖中文自然化改写。|
|60|[wps](https://skillhub.cn/skills/user_7368e5a9/wps)|暂缓|需要 WPS 应用控制或命令行；当前后台路径未验证。|
|61|[memory](https://skillhub.cn/skills/clawhub_ivangdavila/memory)|暂缓|采用原宿主的分类记忆协议，尚未完成与 Stable 会话隔离的适配。|
|62|[tavily-search-pro](https://skillhub.cn/skills/clawhub_shaharsha/tavily-search-pro)|暂缓|需要 TAVILY_API_KEY 和 tavily-python。|
|63|[cognitive-memory](https://skillhub.cn/skills/clawhub_icemilo414/cognitive-memory)|暂缓|依赖原宿主记忆、反思周期和知识图谱机制；本次只迁移独立工作区 SQLite 记忆。|
|64|[news-summary](https://skillhub.cn/skills/clawhub_joargp/news-summary)|已迁移|迁移无需密钥的文字简报；语音输出需另有已配置的TTS能力。|
|65|[clawddocs](https://skillhub.cn/skills/clawhub_nicholasspisak/clawddocs)|暂缓|功能是 OpenClaw 文档与配置管理，不是 Stable/Codex 的文档接口。|
|66|[trello](https://skillhub.cn/skills/clawhub_steipete/trello)|暂缓|需要 Trello API_KEY/TOKEN 及 jq，未提供账户授权。|
|67|[openai-image-gen](https://skillhub.cn/skills/clawhub_steipete/openai-image-gen)|暂缓|需要 OpenAI Images API 凭据及图像生成服务配置。|
|68|[firecrawl-search](https://skillhub.cn/skills/clawhub_ashwingupy/firecrawl-search)|暂缓|需要 FIRECRAWL_API_KEY 及其脚本依赖。|
|69|[superdesign](https://skillhub.cn/skills/clawhub_mpociot/superdesign)|去重|入口原名 frontend-design，与已安装 ops-market-frontend-design 重复。|
|70|[skill-finder-cn](https://skillhub.cn/skills/clawhub_guohongbin-git/skill-finder-cn)|暂缓|依赖 clawhub CLI，不能直接注册 Stable 技能市场。|
|71|[youtube-api-skill](https://skillhub.cn/skills/clawhub_byungkyu/youtube-api-skill)|暂缓|需要 Maton API 密钥及 YouTube OAuth 连接。|
|72|[edge-tts](https://skillhub.cn/skills/clawhub_i3130002/edge-tts)|暂缓|缺少 node-edge-tts 及已验证的网络语音合成链路。|
|73|[image-ocr](https://skillhub.cn/skills/clawhub_xejrax/image-ocr)|暂缓|缺少 Tesseract OCR 引擎及语言包。|
|74|[agent-team-orchestration](https://skillhub.cn/skills/clawhub_arminnaimi/agent-team-orchestration)|已迁移|映射到当轮实际Codex协作能力；不强制创建团队、切模型或修改全局配置。|
|75|[copywriting](https://skillhub.cn/skills/clawhub_jk-0001/copywriting)|去重|本次 marketing-skills 的 references/copywriting 已包含对应营销文案模块。|
|76|[feishu-evolver-wrapper](https://skillhub.cn/skills/clawhub_autogame-17/feishu-evolver-wrapper)|暂缓|原件标注停止维护，且强依赖飞书与原能力演化宿主。|
|77|[playwright-mcp](https://skillhub.cn/skills/clawhub_spiceman161/playwright-mcp)|暂缓|当前没有配置该 Playwright MCP 服务；不能按工具名相似认定兼容。|
|78|[microsoft-excel](https://skillhub.cn/skills/clawhub_byungkyu/microsoft-excel)|暂缓|需要 Maton/托管 OAuth 的微软账户连接；本地 stable_excel 不是该远程 API。|
|79|[gemini-deep-research](https://skillhub.cn/skills/clawhub_arun-8687/gemini-deep-research)|暂缓|需要 Gemini 深度研究 API 账户与异步任务配置。|
|80|[finance](https://skillhub.cn/skills/clawhub_anton-roos/finance)|暂缓|金融数据脚本的提供商与依赖尚未完成验证。|
|81|[imap-smtp-email](https://skillhub.cn/skills/clawhub_gzlicanyi/imap-smtp-email)|暂缓|需要 IMAP/SMTP 账户配置和运行依赖。|
|82|[office](https://skillhub.cn/skills/clawhub_ivangdavila/office)|去重|通用办公入口与本次 excel-xlsx、word-docx、powerpoint-pptx 重叠，保留具体格式入口。|
|83|[ppt-generator](https://skillhub.cn/skills/clawhub_wwlyzzyorg/ppt-generator)|去重|与本次 ppt 使用相同 HTML 演示入口与资源结构，保留排名较高的版本。|
|84|[ai-news-collectors](https://skillhub.cn/skills/clawhub_kenxcomp/ai-news-collectors)|已迁移|替换 web_fetch 别名；按证据和用户范围检索，去除无依据的覆盖率承诺。|
|85|[openclaw-backup](https://skillhub.cn/skills/clawhub_alex3alex/openclaw-backup)|暂缓|备份目标是 ~/.openclaw，不是 Stable 数据库或 Codex 会话结构。|
|86|[x-ai](https://skillhub.cn/skills/clawhub_blueberrywoodsym/x-ai)|暂缓|需要 XAI_API_KEY，不复用 Stable 模型账户凭据。|
|87|[ai-ppt-generate](https://skillhub.cn/skills/clawhub_jlpjavawayup/ai-ppt-generate)|暂缓|需要百度 PPT 生成服务的账户或专用访问配置。|
|88|[tmux](https://skillhub.cn/skills/clawhub_steipete/tmux)|暂缓|原件仅支持 Linux/macOS，Windows 当前没有 tmux。|
|89|[himalaya](https://skillhub.cn/skills/clawhub_lamelas/himalaya)|暂缓|缺少 Himalaya CLI 与邮件账户配置。|
|90|[larry](https://skillhub.cn/skills/clawhub_olliewazza/larry)|暂缓|需要 Postiz、TikTok 账户、图像服务和发布链路。|
|91|[liang-tavily-search](https://skillhub.cn/skills/clawhub_matthew77/liang-tavily-search)|暂缓|需要 Tavily API 密钥，未配置。|
|92|[ocr-local](https://skillhub.cn/skills/clawhub_shaw555/ocr-local)|暂缓|需要 Tesseract.js 及中英语言数据包。|
|93|[playwright](https://skillhub.cn/skills/clawhub_ivangdavila/playwright)|暂缓|依赖未配置的 Playwright MCP 工具，尚未进行调用协议适配。|
|94|[slack](https://skillhub.cn/skills/clawhub_steipete/slack)|暂缓|原件调用 Clawdbot 的 slack 工具，Stable 没有对应账户接口。|
|95|[reflect-learn](https://skillhub.cn/skills/clawhub_stevengonsalvez/reflect-learn)|暂缓|依赖原平台反思脚本、钩子及配置文件，不能自动写入 Codex 全局规则。|
|96|[wechat-publisher](https://skillhub.cn/skills/clawhub_0731coderlee-sudo/wechat-publisher)|暂缓|缺少 wenyan-cli 与公众号 AppID/Secret；不建立未经提供的发布凭据。|
|97|[wechat-article-extractor-skill](https://skillhub.cn/skills/clawhub_freestylefly/wechat-article-extractor-skill)|暂缓|需要微信文章解析专用依赖和抓取链路，尚未完成运行验证。|
|98|[image](https://skillhub.cn/skills/clawhub_ivangdavila/image)|暂缓|图像变换依赖 Pillow/ImageMagick 等，Stable 内置 Python 没有 Pillow。|
|99|[search-with-tavily](https://skillhub.cn/skills/clawhub_chasehl/search-with-tavily)|暂缓|需要 Tavily API 密钥与脚本依赖，未配置。|
|100|[obsidian](https://skillhub.cn/skills/clawhub_steipete/obsidian)|原包不可获取|SkillHub 指定版本下载返回404，无法获取与核验原件。|

## 验证

已验证登记与市场选用、重装、禁用、删除标记、用户编辑、重复项、事务回滚、文件篡改、路径越界，以及原有技能市场UI回归。真实附件测试覆盖隔离Python下UI搜索与设计系统输出、SQLite事实/实体/经验持久化，以及离线HTML翻页边界与输入框键盘处理。类型检查和生产构建通过。构建仍提示已有前端主包大于500 kB，不影响本次生成结果。

```powershell
$env:STABLE_TENCENTHUB_TEST_BUNDLE = (Resolve-Path .local/tencenthub/20260906-final).Path
node --test tests/tencenthub-skill-bundle.test.cjs tests/tencenthub-resources.test.cjs tests/ops-skill-bundle.test.cjs tests/store.test.cjs tests/skill-market-ui.test.cjs tests/ops-skill-market-ui.test.cjs
npm run typecheck
npm run build
```

新检出使用默认准备目录时，将测试环境变量改为 `.local/tencenthub/20260906`。未提供测试包路径时，真实附件测试会标记跳过，其余登记测试仍运行。

技能 frontmatter 已用仓库内 YAML 库校验名称、字段和描述约束。系统 skill-creator 的 Python 校验器因其运行环境缺少 PyYAML 未能运行；没有把这一项记录为通过。
