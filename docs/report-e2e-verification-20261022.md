# 原报告会话端到端验收（2026-10-22）

已使用原 Stable 配置目录、原 Cloud 登录账号和会话 `70d8b034-ed1b-4569-b032-1ece66fd2248` 完成真实续跑。用户先手动退出原进程；测试通过 Electron 加载实际 main.cjs，并调用正常的 stable:agent:run IPC 处理函数。未使用独立账号、替代会话或模拟模型。窗口后台隐藏，无 computer-use 操控。

## 验收结果

- Stable 自行修改 svgcharts.py、样式与设计记录，重建原 HTML。实际浏览器截图进入 SDK 图片内容，模型据此修复末月标签、布局和组合图端点标签避让。
- 最终1440×900桌面、390×844手机、CRM清单、卡片放大/关闭及标签避让检查通过；最终检查簿六项 passed。检查簿是模型附带截图的审查记录，不等同于独立自动视觉测试。
- 独立运行原 `_work/verify.py`：`RESULT: ALL PASS`。raw.json、metrics.json、analyze.py、extract.py、build.py、verify.py 均与测试前哈希相同。
- HTML 119538字节，SHA256 `0ef49619d4c97a80f3f129163fd501bec896afec6724088e710c281b7a56c371`，与测试前不同。
- 最终答复及HTML路径已写入原报告会话，运行事件为任务完成。全部1166条测试前历史消息的角色和正文逐条比对无变化。
- 145次真实网关请求均HTTP200，线上账本全部settled，实际费用1,992,609微元，即人民币1.992609元，无遗留inflight。

## 测试边界

测试脚本最初40次、随后100次请求上限分别提前阻断了一次续跑；这两次错误来自验收脚本，不是线上模型或网关错误。保留累计10元费用保护并增加请求次数上限后，第三次续跑完成。原会话保留这两条失败记录及后续成功交付，不伪称一次不中断完成。

本轮实际最大单请求输入167131 tokens；它验证原会话的多步工具、截图、修复和交付链路，不能单独视为294k输入的复现。较大输入420043 tokens的线上验证另见 gateway-context-root-cause-20261022.md。未推送Git，未新增部署。

## 本地证据

- `.local/report-e2e/before.db`、`before/`：测试前备份。
- `.local/report-e2e/result.json`：每次请求状态、用量、最终回答。
- `.local/report-e2e/events.jsonl`：真实运行和工具事件。
- `.local/report-e2e/final-review.json`：最终检查簿与截图路径。
- `.local/report-e2e/final-integrity.json`：原历史及数据文件对比。
- 原HTML：`C:\Users\HUAWEI\AppData\Roaming\stable-desktop\workspace\.stable\workbuddy-imports\116a836b-0e89-4eae-990a-2c05ac2eda1f\workspace\打杂陈-经营分析报告-2026年9月.html`。
