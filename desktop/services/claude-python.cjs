'use strict'
const fs = require('node:fs'), path = require('node:path')
function bundledPython(options = {}, platform = process.platform) {
  if (platform !== 'win32') return null
  const root = options.packaged ? options.resourcesPath && path.join(options.resourcesPath, 'wending-cli') : path.resolve(__dirname, '../../vendor/wending-cli')
  if (!root) return null
  const file = path.join(root, 'python', 'python.exe')
  try { return fs.statSync(file).isFile() ? file : null } catch { return null }
}
function pythonGuidance(file) {
  return file ? `本机内置 Python：${file.replaceAll('\\', '/')}。Bash 中使用带引号的完整路径并加 -I -X utf8；环境变量 STABLE_BUNDLED_PYTHON 指向同一解释器。不要猜测其他软件的 Python 安装位置或使用 WindowsApps 的 python/python3 占位程序。先读取真实表头；模块不可用时如实报告，并使用已提供且适用的 stable_excel 等工具，不自行安装依赖。
-I 不自动把脚本目录加入模块搜索路径。同一任务确需拆分自己的模块时，在主脚本的本地 import 之前加入以下代码；仅导入自己创建或已确认的同目录模块，不添加整个工作区、当前 shell 目录或未知目录。不把本地模块导入失败误判成缺第三方包，也不要反复安装或更换解释器。
\`\`\`python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
\`\`\``
    : '本轮没有可核实的内置 Python 路径。不要假设 python/python3 可用或搜索其他软件的安装目录；Excel 可使用已提供且适用的 stable_excel。确需其他运行时而不可用时明确说明。'
}
module.exports = { bundledPython, pythonGuidance }
