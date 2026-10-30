# Explorer 首次打开后消失排查

## 已观察到的差异

用户确认已重启 Stable，首次点击后窗口消失，第二次才显示。
本机后台调用旧的真实文件定位链路时，`D:\_report_work\打杂陈经营数据分析报告.html` 首次出现的 Shell 窗口句柄为 7611994，文件已选中，但 `IsWindowVisible=false`；第二次调用恢复相同句柄为可见。最近四小时 Application 日志没有发现 Explorer 崩溃记录。这次捕捉到的是隐藏窗口，而不是句柄销毁，不能将所有用户描述的消失都归为进程崩溃。

旧实现首次走 SHOpenFolderAndSelectItems，已有窗口走恢复/激活，两条路径行为不同。隐藏辅助进程的启动显示状态是需要消除的变量，尚未通过 Explorer 内部调用栈确认具体的隐藏原因。

## 修复

- 无已有窗口时，通过系统 explorer.exe `/select,"完整路径"` 显式以 Normal 显示状态启动，使用 ShellExecute；不再调用旧首次打开分支。辅助 PowerShell 继续隐藏。
- 已有目录只选择并恢复/激活一次。观察循环不重新激活、不补开第二个窗口。
- 成功条件增加连续一秒可见、非最小化、文件已选中；不再接受瞬时可见。
- 同一文件的同时定位请求共用一次启动，结束后可再次正常定位；失败后解除占用。
- 保留路径校验和错误反馈。没有关闭窗口、改变账号、修改会话或报告的产品代码。

显示状态背景：[Microsoft ShowWindow 文档](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindow)。

## 验证和边界

`node --test --test-concurrency=1 tests/file-actions.test.cjs tests/file-location.test.cjs`：16/16。包含隔离隐藏 Electron 菜单、路径范围、错误反馈、并发合并、失败后重试及不同文件独立定位。

实际 Windows 调用，临时目录、无模型调用：

| 场景 | 最终句柄 | 辅助进程退出后观察 | 结果 |
| --- | --- | --- | --- |
| 关闭测试窗口后首次打开 A | 5379566 | 5241ms | 单窗口、可见、已选中 |
| 首次打开 B，中文/空格/逗号/%/& 文件名 | 61020324 | 5068ms | 单窗口、可见、已选中 |
| 从 B 返回 A | 5379566 | 5058ms | 复用同一窗口、仍可见、已选中 |

复现脚本 `.local/reveal-lifetime-check.ps1`，对应结果 `.local/reveal-{first,switch,return}-after-fix.json`。脚本观测 Shell 窗口状态，不操作原聊天历史。仅关闭本轮创建的两个临时测试目录窗口，以验证首次打开。

未操作原 Stable 窗口完成用户点击验收；后台测试部分窗口未成为前台，因此本记录不声称前台焦点效果已完整验收。没有改前端，无需重新构建前端资源；重启本地版加载更新后的主进程服务。未打包、部署或推送。
