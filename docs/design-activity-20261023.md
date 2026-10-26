# 活动视图与 Design 聊天

本轮仅修改本地源码和构建产物。未发布、未推送、未重新打包安装器；未改动原账号和原会话数据。

## 交互

- 侧栏新聊天按钮高 42px；右侧增加活动铃铛，保留搜索。活动按钮切换项目列表和活动列表。
- 活动按优先级（运行、审批、待回答）及本地日期分组；显示标题、项目、最新消息摘要、运行与未读标记。点击打开原会话，支持只看未读和全部已读。摘要来自本地消息，不额外调用模型。未读标记沿用当前应用会话机制。
- 工作与实验室入口顶置，随后是调色盘 Design 入口和模块导航。
- Design 复用普通会话、权限、附件、队列、预览和交付链路。新建 Design 与普通新聊天保持独立；切回 Design 恢复已有设计会话。
- 输入框提供参考图、拖放／粘贴、@图序号引用、GLM-image、比例／分辨率、1–4 张、图中文字。使用已配置的智谱标准 API；对话模型负责理解、脚本合成与检查。
- “生成背景 + 原图合成”要求原始图片。GLM-image 为文本生图，不宣称支持原生参考图编辑或遮罩接口。

## 参数与执行

`DesignRequest` 随每条排队消息保存快照，后端校验并将设计约束传给实际执行模型；用户消息中不插入内部系统文本。会话参数存于独立 settings 项，无数据库结构迁移。

Design 排队消息在当前任务结束后执行；运行中不使用会丢失设计参数的“调整方向”入口。普通聊天保留原行为。

生图工具在服务端强制使用用户选择的尺寸，并限制本轮新的生成请求数量；相同调用复用结果。普通会话保留现有默认行为。图中文字作为数据交给执行模型，保留原图约束与 GLM 新素材生成要求同时生效。

## 即梦拆解依据

使用 REA `capture_browser_scenario` 启动后台无界面 Chrome，未登录、未上传用户图片、未点击生成。

- URL：https://jimeng.jianying.com/ai-tool/home?createTab=chat&type=image
- 初始 SSR 暂时显示 Agent 模式，客户端加载后切为图片生成。以加载完成后的状态为准。
- 实际打开比例面板：智能、1:1、3:4、16:9、4:3、9:16、2:3、3:2、21:9；分辨率 1.5K / 2K / 4K；宽高字段在该状态不可编辑。
- 实际打开张数面板：1 / 2 / 3 / 4，默认 2。
- Stable 保留相同参数分层交互，但仅展示当前 GLM 接口可执行的选项（五种比例、标准／2K、1–4 张）。不照搬 Seedream 专属功能、积分或价格。
- 可复核摘要：`.local/jimeng-design-evidence.json`。REA 最后一次采集在成功观察面板后报告临时浏览器 profile 清理超时；随后 close_binary 返回无活动应用。此次证据不包括登录后生成和扣费行为。

## 验证

- TypeScript 检查与 Vite 本地构建通过；52 项相关回归通过。最终活动状态修正后另复跑 14 项界面与导航回归，全部通过。
- 参数校验、实际 IPC 约束传递、用户历史内容不污染、SQLite 重启恢复、GLM 请求尺寸及并发张数限制。
- 隐藏 Electron 完整 App 回归：按钮大小及顺序、活动日期／运行优先级、参考图拖入和 @ 引用、参数发送、队列隔离、工作区切换、明暗主题、发送按钮不被裁切。
- 复现：`node --test tests/design-request.test.cjs tests/image-generation.test.cjs tests/clarification-ipc.test.cjs tests/store.test.cjs tests/design-activity-ui.test.cjs tests/navigation-workspace-ui.test.cjs tests/conversation-activity.test.cjs`。
- 离线测试使用临时数据及模拟接口；随后按用户批准的 1 元预算完成以下真实验收。

## 真实验收（2026-10-23）

- 使用原账号数据副本，通过实际 `stable:agent:run` IPC、Claude Agent SDK、线上网关 GLM-5.3-Flash 对话模型与智谱 GLM-image 工具执行。测试限制一张图片、最多八次对话请求，每次请求前保守预留费用，累计不得超过 1 元。
- 实际链路：需求检查 → ToolSearch → stable_image_generate → Read 图片 → 最终交付。共五次网关请求、一次生图请求，全部成功；包含图片证据的后续模型请求已确认。
- 生成 `design-acceptance.png`，实际尺寸 1280×1280；文本“春日灵感”可见。模型正确描述蓝色花朵、橙色圆点和生成标记。
- 完整任务 145.619 秒，其中生图接口约 80.199 秒。此为一次真实验收结果，不代表所有任务耗时。
- 网关按本次专用幂等标识查询，5 条均 settled，实际扣费 **0.082953 元**；GLM-image 按[官方定价](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image) **0.10 元/次**，本次一张，合计 **0.182953 元**。生图金额依据公开单价计算，未取得供应商账单明细；测试保守成本上界为 0.199036 元。
- 将实际模型回复交给真实 MarkdownContent 渲染，交付链接点击目标与生成文件一致；隐藏 Chromium 打开实际图片并验证自然尺寸通过。
- 原数据库全部消息的 ID/内容与测试前副本逐条比较一致，原 secrets.json SHA-256 一致。
- 原始证据：`.local/design-live-hyKMk7/result.json`。图片已另存到 `qa-artifacts/design-activity/design-acceptance.png`。

边界：本轮真实验收覆盖单张文本生图、模型看图及交付；多图、参考图保真合成尚未做付费实测，参数和队列传递已通过离线回归。即梦仅复刻已观察的交互并映射到 GLM 当前能力，不包含 Seedream、视频或其付费服务。

界面截图：`qa-artifacts/design-activity/design-light.png`、`design-dark.png`。
