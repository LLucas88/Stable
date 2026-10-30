# 文件定位与回答间距修复

## 问题与修改

- 产物菜单的 reveal 分支原先调用 Electron `shell.showItemInFolder()` 后直接返回 true；该接口没有可等待的成功或失败结果，无法给界面反馈系统定位失败。已确认这条静默成功路径，但未独立复现用户那次 Explorer 未出现的底层系统原因。
- Windows 改用现有隐藏 PowerShell 辅助进程：初始化 STA COM、解析完整文件 PIDL、调用 `SHOpenFolderAndSelectItems` 并检查 HRESULT。IPC 等待完成，最长 20 秒，失败后显示中文提示；非 Windows 保留原生 shell 行为。
- 文件路径通过环境变量传递，不插入脚本或命令字符串；原有工作区范围与文件存在校验继续生效。
- 仅缩小正文与回答工具栏之间的距离：16px flex gap + 10px margin 共 26px，调整为 13px；执行记录到正文的间距保持 16px。

## 验证

- `node --test --test-concurrency=1 tests/file-actions.test.cjs tests/file-location.test.cjs`：14/14 通过。包含 Windows 等待结果、失败传播、原生分支、文件范围、菜单重试、后台 Electron 界面和实际间距测量。
- 隐藏界面输出：`ANSWER_GAP {"before":26,"after":13,"traceGap":16}`。
- Windows `probeReveal` 对真实临时文件 `中文 (一), 100% & 报告.html` 完成 COM 初始化和系统 PIDL 解析。
- `npm run typecheck`、`npm run build` 通过。沙箱无法执行硬链接/Electron 启动与 Vite 模块解析，相关检查转到真实本机隔离环境完成；首次组合 UI 检查超时，单独运行和随后整组回归均通过。
- 本轮未实际弹出 Explorer：文件选中界面的端到端效果仍需重启本地 Stable 后确认。后台测试使用临时数据，不修改原账号、会话或历史；未调用模型、打包安装程序或推送。

Windows API 依据：[SHOpenFolderAndSelectItems](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shopenfolderandselectitems)。count=0 时完整文件 PIDL 用于打开父文件夹并选中文件。
