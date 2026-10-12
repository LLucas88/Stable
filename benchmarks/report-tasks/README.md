# Stable 报告任务 Benchmark v1

基于最近在 Stable 测试的两份经营分析 Excel 和报告迭代要求，交付可运行用例、独立数值校验、评分规范与结果模板。当前只准备数据和验证测试框架，**真实模型成绩尚未运行**。

本次实际验证范围及证据见 [VALIDATION.md](VALIDATION.md)，空白结果表见 [results-template.md](results-template.md)。

## 用例与来源

| 用例 | 内容 | 来源与会话关系 |
|---|---|---|
| report-a | 虾姐蟹妹首版报告 | 实际首版任务，开始新会话 |
| polish-a | 图表更精致细腻 | 实际修改要求，补充保留项，承接上例 |
| revise-a | CRM 清单前置、口语化、移动端对齐 | 根据迭代需求设计的测试，承接上例 |
| switch-b | 同会话换齐品达数据 | 根据换数据源场景设计的测试，承接上例 |
| report-b | 齐品达独立首版 | 实际首版任务，独立新会话 |
| resume-b | 写入检查点后取消，再发送“继续” | 根据实际续跑场景设计的可控故障测试，独立新会话 |

`brief.md` 保留实际首版任务说明；`suite.json` 标记 observed / derived。后两类不是逐字历史重放。实际来源为 2026-10-10 和 2026-10-12 的报告任务；本地 provenance 记录会话 ID、输入路径及哈希。未复制历史 AI 报告作为答案。

两份原始 Excel 各有 37 个页签，核心工作表的真实表头分别位于第 7 行和第 1 行，包含汇总、明细及重复命名的月环比列。固定校验全量、新客、老客、会员 × 净G、订单量、MAC、净客单，共 16 项数值及各自环比；并核对来源单元格与涨跌幅排序。报告本身仍需完成原任务全部章节，不能只交这些指标。

## 本机现在可运行（不调用真实 API）

在 PowerShell 中：

```powershell
Set-Location 'D:\stable\.local\cluade-sdk-bash'
node benchmarks/report-tasks/benchmark.cjs plan --data .local/report-benchmark/data-v1
node --test tests/report-benchmark.test.cjs
node benchmarks/report-tasks/benchmark.cjs context-check
```

本机数据快照在 `.local/report-benchmark/data-v1`；准备记录、计划和本地检查结果放在 `.local/report-benchmark`。这些包含真实业务数据的文件均被 Git 忽略，不会提交。重新准备或在其他机器使用时，按 `sources.example.json` 配置两个 Excel 的路径及品牌，然后执行：

```powershell
node benchmarks/report-tasks/benchmark.cjs prepare --sources sources.local.json --data .local/report-benchmark/data-v2
node benchmarks/report-tasks/benchmark.cjs plan --data .local/report-benchmark/data-v2 --output .local/report-benchmark/plan-v2.json
```

`prepare` 只读取原件，复制出新快照并从原始单元格生成 oracle。已有目录或结果文件会拒绝覆盖。每次运行前核验快照 SHA-256，避免比较不同输入。

`context-check` 运行真实 Claude Agent SDK，模型响应由本地测试桩提供，不访问供应商 API。覆盖 128k、200k、1M：总用量 79% 时不压缩、81% 后出现真实压缩事件，验证摘要保留、继续响应和压缩后占用下降。它独立于六例业务评分，**不能证明真实供应商上的长报告任务已通过**。

## 未来需要跑真实模型时

本轮不执行这一节。依赖沿用该分支 Node、Electron、SDK、Windows Git Bash 和内置工具；使用 `model.example.json` 创建本地配置，填写实际 API baseURL 和型号。示例只是配置格式，不代表账号已具备该模型权限。推理强度、模型容量覆盖值和可选 skills 都要在对比时保持一致。

凭据只从 `STABLE_BENCH_API_KEY` 环境变量读取，不读取 Stable 已保存的密钥，不在配置中填写密钥。设置凭据后运行：

```powershell
node benchmarks/report-tasks/benchmark.cjs run --data .local/report-benchmark/data-v1 --config .local/report-benchmark/model.json --run .local/report-benchmark/runs/model-r1 --live --allow-bash
```

两项显式开关缺一不可。真实运行会产生 API 费用，并允许 SDK 原生 Bash 执行命令。目录隔离是工作约定，不是操作系统沙箱；建议在专用测试环境运行。不要把密钥写进提示词。oracle 放在任务工作目录之外，提示词禁止读取，但这也不是对抗性防作弊隔离。

默认每例最多 20 分钟、60 次模型请求，并发 1；超限结束该例，同一 journey 后续用例记为 blocked，独立场景继续。每个 flow 有全新 SDK 历史，journey 内延续同一历史和文件。每次 run 使用独立 Electron profile，无需打开或操控用户浏览器，不触碰现有 Stable 对话数据库。

模型获得 `input/a.xlsx` 或 `input/b.xlsx`、任务说明、工具及明确配置的 skills。必须输出 `report.html` 和供核对的 `metrics.json`。后者是为了可重复评分增加的统一输出要求，会与原始手工测试有差异。每例保留独立产物快照，后续修改不会覆盖前一例证据。

## 评分与结果

| 维度 | 分值 | 验证方式 |
|---|---:|---|
| HTML 与指标文件 | 10 | 文件基本存在、品牌及结构完整；不等于渲染合格 |
| 核心数值和环比 | 30 | 32 个值独立核对，环比使用小数比例 |
| 来源单元格 | 5 | 16 对 value / mom 单元格 |
| 涨跌排序 | 5 | 16 项中正、负增长各取前 5 项，不足则全部 |
| 分析与 CRM 建议 | 20 | 人工检查依据、排序、影响和可执行性 |
| 图表与布局 | 15 | 桌面及手机宽度截图；美化例比较修改前后 |
| 整卡放大与动画 | 10 | 实际交互验证，不能用 HTML 关键词替代 |
| 本轮需求与保留项 | 5 | 逐例对照本轮要求及前一版 |

详细锚点见 `rubric.json`。总分至少 80 且所有门槛通过才算通过：输入未改动、32 个核心值正确、品牌正确、续跑确实发生检查点中断，以及页面可用、页面数值一致、章节完整、换数据无污染等人工门槛。机器只校验 sidecar，人工必须核对实际页面，防止“JSON 正确、图表错误”。

运行后编辑 run 目录中的 `review.json`，填写 reviewer、每例 evidence、四个布尔 gates 和各项分数，再评分：

```powershell
node benchmarks/report-tasks/benchmark.cjs score --run .local/report-benchmark/runs/model-r1 --review .local/report-benchmark/runs/model-r1/review.json --output .local/report-benchmark/runs/model-r1/score-reviewed.json
```

未人工评审的成功用例总分为 null、通过状态为 null；未运行保持空值，失败和依赖阻塞计 0，不能从平均分中剔除。六例都有最终结果才能计算宏平均和通过率。业务交付使用 `results-template.md`，附上截图、交互记录及失败原因；缺证据不能填写“已通过”。

每例记录总耗时、首次答案或工具事件时间、模型请求数、工具耗时/失败及压缩事件。首次输出不是首 token 延迟。账单 tokens 和金额保持未知，不把上下文估算当成累计计费。至少重复三次独立 run，报告各次成绩、失败和耗时中位数，不只取最好一次。

## 验证边界

- 此版衡量 Stable 后端 SDK、内置工具与报告产物；不衡量桌面消息动画、复制、Trace 展示等 UI。
- 后台浏览器支持读取、点击和隐藏截图；需要可见窗口的键盘、拖动等能力不纳入自动验收。整卡放大、动画、不同宽度及控制台由人工按评分规范验收。
- skills 默认为空，避免机器个人环境差异。若启用报告 skill，所有对比运行须使用同一配置并记录指纹；当前记录 SKILL.md 的哈希，相关脚本版本另附。
- oracle 覆盖核心概览指标，其他页签分析、业务解释和图表质量由人工评价；并不声称全工作簿数值已全部自动验收。
