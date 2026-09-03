'use strict'
const path = require('node:path')
const { BrowserTool } = require('./browser-tool.cjs')
const { executeExcel } = require('./excel-tool.cjs')

class BuiltinTools {
  constructor({ workspace, electron, packaged = false, resourcesPath }) {
    this.workspace = workspace
    this.browser = new BrowserTool({ electron })
    this.dependencyRoot = packaged ? path.join(resourcesPath, 'agent-tools') : path.resolve(__dirname, '../../vendor/agent-tools')
    this.controllers = new Map()
  }
  async execute({ requestId, name, args, approved }, sandboxMode) {
    if (this.controllers.has(requestId)) throw new Error('重复的工具请求。')
    if (!args || typeof args !== 'object' || JSON.stringify(args).length > 2_000_000) throw new Error('工具参数无效或过大。')
    const mutatesBrowser = name === 'stable_browser' && ['click', 'fill', 'select'].includes(args.action)
    const writesFile = name === 'stable_excel' && ['create', 'update'].includes(args.action)
    if (sandboxMode === 'read-only' && (mutatesBrowser || writesFile)) throw new Error('当前为只读模式，请切换访问权限后再操作。')
    if (mutatesBrowser && approved !== true) throw new Error('网页交互需要单次审批。')
    const controller = new AbortController(); this.controllers.set(requestId, controller)
    try {
      if (name === 'stable_browser') return await this.browser.execute(args, controller.signal)
      if (name === 'stable_excel') return await executeExcel({ workspace: this.workspace, dependencyRoot: this.dependencyRoot, args, signal: controller.signal })
      throw new Error('未知内置工具。')
    } finally { this.controllers.delete(requestId) }
  }
  cancel(id) { this.controllers.get(id)?.abort() }
  dispose() { for (const controller of this.controllers.values()) controller.abort(); this.controllers.clear(); this.browser.dispose() }
}

module.exports = { BuiltinTools }
