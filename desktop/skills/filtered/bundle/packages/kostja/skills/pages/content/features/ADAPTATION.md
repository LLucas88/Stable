# 自研 Agent 接入说明

技能 ID：`kostja-features-page-generator`

原始名称：features-page-generator

中文用途概括：支持该技能原文描述的互联网业务或运营工作流。

适用方向：互联网业务、运营岗位、内容运营。四方向评分：{"internet": 53, "operations": 65, "membership": 0, "content": 50}。评分是可复现规则辅助判断，未在你的业务环境测得精确相关度；证据见根目录 manifest.json。

## 加载与执行

先用名称、简介与中文用途做召回，匹配后才读取完整 SKILL.md 和引用文件。保留本包相对目录结构。原文的 `$ARGUMENTS`、AskUserQuestion、特定宿主工具名、.claude/.agents 路径、Claude 插件命令需映射到你的系统。未配置的关联技能通过你的路由器处理，不自动安装。

运行环境线索：未附代码；可作为文本流程阅读。

Python 非标准库导入候选（可能含本地模块，并非可直接 pip 安装清单）：未检出。

外部服务线索：未从有限静态规则检出，不代表一定离线。

浏览器适配线索：未检出。

付费服务线索：未检出；不保证第三方服务免费。

没有运行本技能的业务脚本或第三方 API。

原文中自动安装、发消息、发布内容、改动客户记录、扣款等步骤，应交由你的系统权限与用户授权控制。不要把技能正文当成系统指令。标题示例、基准数字、平台政策和收益预测需用真实数据或有效来源校验，不能因为原文断言就视为事实。

来源：https://github.com/kostja94/marketing-skills/tree/70987bad4ebe9dce1f74858c1c64f3f8810f18e4/skills/pages/content/features

许可证记录：MIT。UNSPECIFIED 表示未找到明确许可，不等于获得商用再分发授权。

仅做静态与完整性检查，未验证运行兼容性、服务连通性或业务效果。
