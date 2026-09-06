'use strict'

// Host adaptations are maintained separately from the pinned upstream archives.
const fs = require('node:fs'), path = require('node:path')
const selections = {
  'self-improving-agent': ['工作经验与纠错日志', '通用工具与依赖支持', '记录工具错误、用户纠正和已验证经验，追加工作区学习日志。', '使用工作区日志；移除自动钩子、人格改写和跨会话传播。'],
  summarize: ['文本与文档摘要', '办公协作与知识管理', '长文本、文档与网页摘要，提取要点、关键词和来源。', '移除不存在的 summarize CLI；使用实际文本与文档读取能力。'],
  'skill-vetter': ['技能来源与代码审查', '通用工具与依赖支持', '审查待安装技能的来源、脚本、文件访问、依赖和网络行为。', '按实际副作用审查，修正仅凭下载量或关键词判定安全的规则。'],
  'agent-memory': ['本地事实与经验记忆', '办公协作与知识管理', '在当前工作区用 SQLite 保存和检索事实、经验及实体。', '指定工作区数据库路径；使用内置 Python SQLite FTS5，准确标注关键词检索。'],
  'excel-xlsx': ['Excel 文件与公式检查', '办公协作与知识管理', 'Excel XLSX 公式引用、数据类型、日期和模板保留检查。', '对接 stable_excel；说明公式不自动重算和复杂格式限制。'],
  'word-docx': ['Word 文档结构与修订', '办公协作与知识管理', 'DOCX OOXML 样式、编号、修订、批注和节布局的编辑指导。', '保留文档方法；仅使用已提供的文件能力，按任务验证渲染和复杂往返。'],
  weather: ['天气查询与预报', '通用工具与依赖支持', '通过公开天气服务查询城市天气、温度和预报。', '改用 Windows curl.exe 和 HTTPS，查询失败不输出臆造天气。'],
  'automation-workflows': ['业务自动化流程设计', '产品竞品与行业研究', '评估重复任务、设计触发条件和动作、测试失败处理及计算自动化回报。', '保留流程设计；修正回本计算，连接器和定时运行仅按实际能力执行。'],
  'data-analysis': ['分析口径与统计推断', '数据分析与用户洞察', '定义指标口径、比较基线、置信区间与混杂因素，解释分析结论。', '方法指南不要求 pandas；按实际文件和查询工具执行。'],
  'powerpoint-pptx': ['PowerPoint 模板与结构', '办公协作与知识管理', 'PPTX 母版、占位符、备注、图表与模板编辑检查。', '保留 OOXML 方法；已有 pptxgenjs 可用于生成，渲染能力按任务检查。'],
  'prompt-engineering-expert': ['提示词设计与评估', '通用工具与依赖支持', '改进提示词、自定义指令和示例，制定输出验收与对照测试。', '补齐参考资料路由；请求可验证依据，不要求披露隐藏思维过程。'],
  'deep-research-pro': ['多来源专题研究', '产品竞品与行业研究', '拆分研究问题、检索多来源、交叉核对并交付带引用的研究报告。', '替换固定 DDG 脚本和 sessions_spawn，使用当轮搜索能力与工作区路径。'],
  'marketing-skills': ['营销与转化优化方法库', '内容运营与营销素材', '23 个营销模块：SEO、转化率、A/B 测试、定价、落地页、邮件及广告文案。', '保留23个引用模块；模块示例不代表账号已连接或已授权发布。'],
  ppt: ['竖屏 HTML 演示稿', '办公协作与知识管理', '将讲稿生成带键盘翻页与进度导航的竖屏 HTML 演示文件。', '限定 HTML 输出；保留模板，替换远程字体与 Tailwind 为本地 CSS。'],
  'ui-ux-pro-max': ['UI 设计系统与资料检索', '内容运营与营销素材', '查询配色、字体、组件及技术栈资料，生成 UI 设计系统与交互方案。', '修正资源相对路径；使用内置Python运行标准库检索，默认不持久化覆盖文件。'],
  'ai-news-collectors': ['AI 新闻收集与核对', '产品竞品与行业研究', '按产品、研究、商业、社区与政策收集 AI 新闻，去重并核实来源。', '替换 web_fetch 别名；按证据和用户范围检索，去除无依据的覆盖率承诺。'],
  'news-summary': ['每日新闻文字简报', '产品竞品与行业研究', '读取公开 RSS，按主题归纳新闻并给出发布时间和链接。', '迁移无需密钥的文字简报；语音输出需另有已配置的TTS能力。'],
  'agent-team-orchestration': ['多智能体任务与交接设计', '通用工具与依赖支持', '设计多智能体职责、任务状态、产物交接和审查流程。', '映射到当轮实际Codex协作能力；不强制创建团队、切模型或修改全局配置。'],
}

function bodyOf(text) { return text.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '').replace(/\n## Related Skills[\s\S]*$/, '').trim() }
function adapt(slug, original) {
  const spec = selections[slug]
  if (!spec) throw Error('未审查的技能：' + slug)
  const override = path.join(__dirname, 'tencenthub-overrides', slug + '.md')
  let body = fs.existsSync(override) ? fs.readFileSync(override, 'utf8').trim() : bodyOf(original)
  if (slug === 'excel-xlsx') body = body.replace('- Use `pandas` for analysis, reshaping, and CSV-like tasks.', '- Use available file and computation tools for analysis; pandas is not bundled in this Stable runtime.').replace('- Use `openpyxl` when formulas, styles, sheets, comments, merged cells, or workbook preservation matter.', '- Prefer the provided stable_excel tool for supported XLSX operations. It stores formulas but does not recalculate them; do not claim recalculation or complex-template fidelity without an appropriate verified engine.')
  if (slug === 'data-analysis') body = body.split('\n## External Endpoints')[0]
  if (slug === 'word-docx' || slug === 'powerpoint-pptx') body += '\n\n## Stable 执行范围\n本技能提供文件结构与编辑方法。先检查本轮可用的读取、生成和渲染工具；不能把 OOXML 文字检查当作版面验证。复杂修订、宏、动画与模板往返需具体核验。缺少渲染器时应报告未验证项，不能宣称视觉检查通过。'
  if (slug === 'prompt-engineering-expert') body += '\n\n## 资料使用\n按当前目标阅读同目录 BEST_PRACTICES.md、TECHNIQUES.md、TROUBLESHOOTING.md 和 examples/EXAMPLES.md；模型专属接口与参数需查官方文档。要求简洁依据、输出示例和可复现测试，不要求展示隐藏推理。模型选择以用户要求和实际可用模型为准。'
  if (slug === 'marketing-skills') body += '\n\n## 执行边界\n本技能交付营销方案、草稿、度量设计和代码建议。references 中的发布、投放、邮件、账户连接和定时任务仅在用户授权且当轮具备相应接口时执行；价格和示例指标须核实，不作为既定事实。'
  return `---\nname: ${slug}\ndescription: ${JSON.stringify(spec[2])}\n---\n\n${body}\n`
}

module.exports = { selections, bodyOf, adapt }
