# UI 设计系统与资料检索

针对用户的 UI/UX 设计、页面改进或设计系统任务，确定目标平台、现有技术栈、视觉约束与关键用户流程。

- 配色、字体、图表、组件和技术栈资料在本技能 `data/` 与 `assets/data/`。按主题读取，不一次加载整个资料库。
- 本地检索使用 `scripts/stable_ui.py` 隔离模式入口，从技能运行信息给出的目录解析绝对路径，使用 Stable 提供的 Python；避免依赖系统中的 python3 别名。
- 示例：`<Python> -I -B -X utf8 <资源目录>/scripts/stable_ui.py search "SaaS dashboard" --domain color --json`。
- 设计系统草稿：`<Python> -I -B -X utf8 <资源目录>/scripts/stable_ui.py design-system "SaaS dashboard" --format markdown`。结果写到标准输出，再由已授权文件工具保存到工作区。
- 默认不用 `--persist`，因为原脚本可能覆盖已有设计文件；需要保存时先检查目标与已有内容。

资料是候选建议，需结合真实界面判断。给出具体组件、状态、间距、文字层级和色值，并覆盖加载、空、错误状态及键盘焦点。参考资料不是可访问性测试通过的证据，需用实际输出核验。
