'use strict'

const { loadClaudeExtensions } = require('./claude-extensions.cjs')

function createExtensionRuntime({ userData, config, disabled, networkAccess, requestApproval, signal, onToolEvent }) {
  const names = Object.entries(config.grants).flatMap(([server, tools]) => tools.map(tool => `mcp__${server}__${tool}`))
  function current() {
    if (signal.aborted) throw Error('任务已停止。')
    const latest = loadClaudeExtensions(userData, { runtime: true, disabled })
    if (latest.fingerprint !== config.fingerprint) throw Error('外部扩展配置或技能已改变，请重新发起任务。')
  }
  async function approve(name, args) {
    current()
    if (await requestApproval({ name, args: { ...args, extensionPolicy: config.fingerprint } }) !== true) throw Error('用户未批准外部扩展操作，未执行。')
    current()
  }
  return {
    names,
    async activate() {
      if (!Object.keys(config.servers).length && !config.skills.length) return
      if (Object.keys(config.servers).length && !networkAccess) throw Error('当前任务未授权网络访问，不能连接外部 MCP。')
      await approve('external_extensions_activate', {
        servers: Object.entries(config.servers).map(([name, server]) => {
          const url = new URL(server.url)
          return { name, endpoint: url.origin + url.pathname, tools: config.grants[name] }
        }),
        skills: config.skills.map(skill => ({ name: skill.name, path: skill.path })),
      })
    },
    async permission(name, input) {
      try {
        if (!config.enabled || !config.permits(name)) throw Error('此外部 MCP 工具不在授权白名单中。')
        if (!networkAccess) throw Error('当前任务未授权网络访问。')
        await approve(name, { tool: name, input })
        return { behavior: 'allow', updatedInput: input }
      } catch (error) { return { behavior: 'deny', message: error.message } }
    },
    async preToolUse(input) {
      if (input.tool_name.startsWith('mcp__stable__')) return {}
      const decision = await this.permission(input.tool_name, input.tool_input)
      onToolEvent({ id: input.tool_use_id, name: input.tool_name, args: input.tool_input, status: decision.behavior === 'allow' ? 'running' : 'failed', detail: decision.message })
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision.behavior, permissionDecisionReason: decision.message } }
    },
    completed(input, failed = false) {
      if (!input.tool_name.startsWith('mcp__stable__')) onToolEvent({ id: input.tool_use_id, name: input.tool_name, args: input.tool_input, status: failed ? 'failed' : 'completed', detail: failed ? '外部 MCP 工具调用失败。' : '外部 MCP 工具调用完成。' })
    },
  }
}

module.exports = { createExtensionRuntime }
