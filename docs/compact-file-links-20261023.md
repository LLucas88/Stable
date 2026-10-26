# 会话悬停按钮与文件交付链接

用户确认：会话行悬停按钮贴齐内部右端；文件交付使用 Codex 风格精简链接，去掉重复产物卡片。

## Codex 本地证据

静态读取本机 OpenAI.Codex 26.1016.8622.0 的 app.asar，不运行或修改 Codex 包。REA 对 conversation-markdown 两个入口做选择性分析，随后读取关联的 app-initial-ad16eaadf81f.js。

- `epd`：区分外部链接与文件引用；解析文件引用后进入 `Uld` 文件组件。
- `opd`：链接文本为空、等于完整路径或格式化路径时使用精简展示标签；用户自定义名称保留。
- `spd`：保留行列引用标签。
- `thd`：行内代码中的可识别文件引用也可进入同一文件渲染入口。

证据包SHA256：`a05dfd86ca508148c83c25590639cf91a52c6647733cdf200723d85357052b49`。REA记录 `ev_ebb812a9665adba6fae197ce754738900bfb27f766c5047bd685a4a83d426892`。部分未分析的原生伴随文件与ASAR完整性元数据不符，因此使用record-and-continue保留限制；上述结论限于所读取JS的静态逻辑，不宣称完整复刻Codex。

## Stable 改动

- 会话行操作按钮右偏移从4px改为0；悬停、键盘聚焦和菜单展开时为标题保留28px操作区。
- 文件引用显示类型图标与短名称，完整路径保留在悬停提示。支持裸Windows路径、Markdown链接、绝对路径行内代码、中文、空格、括号、URI编码及行列标签。
- 普通网页链接仍走网页预览；文件路径去除行列后传入现有文件预览，未增加源代码行定位能力。
- 原有文件存在性检查用于链接可用状态；删除独立的重复产物卡片。用户上传附件仍保留卡片及其右键操作。
- 仅变更渲染，不修改历史消息或产物内容。原有工作区未提交的SDK/网关修复保留，未推送。

## 验证

- TypeScript检查、本地Vite生产构建通过。
- 相关13项回归通过，最终追加的裸路径检查也通过。
- 隐藏Electron窗口使用真实Markdown与会话行组件：按钮28×28、距行右边缘0px、标题不侵入按钮；文件点击保留真实路径，行号不传入文件系统；不存在文件禁用、恢复后可用；自定义HTML名称正确且无重复卡片。
- 检查截图：`qa-artifacts/trace-groups/reply-attachments.png`（上传卡片是独立测试项，下面交付仅显示精简链接）。不使用computer-use，不连接模型或原账号。
- 扩展运行agent-composer-ui时，两个旧源码断言失败：`showTimeline`旧条件及`streaming={running ? streamingAnswer : undefined}`。以HEAD版本App.tsx复测同样失败，确认不是本次引入；原始结果在`.local/codex-file-links/baseline-tests.txt`。

本地dist已生成。运行中的Stable需重新启动后加载；本轮未强制关闭用户进程。
