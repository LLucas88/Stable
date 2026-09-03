# Stable 内置浏览器与 Excel 工具

源码入口：`desktop/services/builtin-tools.cjs`；由每次 Harness 运行的双向 stdin/stderr 通道注册 `stable_browser` 和 `stable_excel`。无需用户安装 MCP、Python 或 Office，不开放本地 HTTP 控制端口，不修改共享 runtime/node_modules Junction。

## 安装与构建

在仓库根目录执行 `npm run tools:install`，按本目录 lockfile 安装固定的 ExcelJS 4.4.0；再执行 `npm run tools:verify`。依赖只装在此目录的 node_modules，不装到全局。完整包及轻量更新包包含 `resources/agent-tools`，源码服务仍包含于 app.asar；beforePack 检查依赖和许可，缺失会阻止打包。无发布、登录、短信或系统 PATH 变更。

ExcelJS 4.4.0 来源：https://github.com/exceljs/exceljs ，MIT，许可证位于 `node_modules/exceljs/LICENSE`。依赖原许可证随各包保留。浏览器使用已有 Electron 43.4.0 Chromium：https://www.electronjs.org/docs/latest/api/browser-window 。当前不是 Excel 桌面自动化，也没有安装浏览器扩展。

间接依赖 uuid 覆盖锁定为兼容 CommonJS 的 11.1.1，以修复 GHSA-w5hq-g745-h8pq（https://github.com/advisories/GHSA-w5hq-g745-h8pq）。ExcelJS 实际使用 `v4()`，已测试兼容性与修复后的边界校验。2026-09-04 官方 npm audit 在此独立依赖树报告 0 项已知漏洞；这不是对整个 Stable 依赖树的审计。npm 镜像不支持 audit 时，仅审计命令使用 `--registry=https://registry.npmjs.org`，没有改动系统 npm 配置。

## 使用

- 对 Stable 说“打开这个网页，读取表格，并另存为 Excel”；或“读取附件工作簿，把销售额列保留两位小数，另存一个新文件”。无需手写工具命令。
- `stable_browser`: open/read/click/fill/select/close。每次任务使用隐藏、沙箱化、内存隔离浏览器，结束/取消关闭。click/fill/select 经原审批界面单次确认；只读模式禁止交互。仅 HTTP(S)，拒绝本机文件/特殊协议、自动下载、弹窗和设备权限。不暴露 Cookie/浏览器存储，不接管用户登录会话，不提供任意 JS 执行。敏感登录信息请走专用登录流程；暂不提供通用可视登录、文件上传下载、iframe 穿透或反自动化绕过。
- `stable_excel`: inspect/read/create/update，工作区内 .xlsx，read 每次最多200行100列，create每次最多20000单元格，update每次最多2000单元格。可写数值、文本、公式、数字格式，创建表格默认加粗首行、冻结首行；编辑后必须另存未存在文件。原件不变，写出前回读检查结构。仅公式存储，不计算公式，缓存值不是新结果；复杂图表/透视表、宏、加密文件、旧 .xls 保真编辑不支持。解析在线程内运行，20MB文件/100MB解压上限、30秒超时，取消不写入半成品。

## 验证与回退

`node --test tests/builtin-excel.test.cjs tests/builtin-tools.test.cjs` 覆盖实际工作簿读写、样式保留、另存、越界/链接/覆盖拒绝、只读、取消、审批拒绝，以及本地模拟模型驱动的真实 Harness + 隐藏 Chromium 读网页/填表/点击/导出 Excel。此测试不证明真实站点登录态、数据访问权或各云模型的工具调用质量。

回退时移除 `createHarnessRunner` 的 builtinTools 工厂即可停止向 Agent 注册这两项工具；已生成文件和原件不受影响。不需要撤销系统权限。发布前仍需在干净构建目录打包并执行真实安装验收。
