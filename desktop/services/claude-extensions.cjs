'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const CONFIG_NAME = 'extensions.json'
const NAME = /^[a-z][a-z0-9-]{0,39}$/

function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function keys(value, allowed, label) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error(`${label} 包含不支持的字段。`)
}
function localPath(file, directory = false) {
  // Reject links in all ancestors: explicit config must not resolve elsewhere.
  for (let current = path.resolve(file);; current = path.dirname(current)) {
    const info = fs.lstatSync(current)
    if (info.isSymbolicLink()) throw Error('外部扩展配置与资源不能使用链接。')
    if (current === path.resolve(file) && (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)) throw Error('外部扩展路径类型无效。')
    if (current === path.dirname(current)) break
  }
  return fs.realpathSync(file)
}
function readJSON(file) {
  localPath(file)
  if (fs.statSync(file).size > 1_000_000) throw Error('外部扩展配置超过 1 MB。')
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw Error('外部扩展配置不是有效 JSON。') }
}
function configurationPath(userData) { return path.join(userData, 'claude', CONFIG_NAME) }

function loadClaudeExtensions(userData, { runtime = false, disabled = false } = {}) {
  const file = configurationPath(userData)
  let config
  try { config = disabled ? { version: 1 } : readJSON(file) } catch (error) { if (error.code === 'ENOENT') config = { version: 1 }; else throw error }
  keys(config, ['version', 'enabled', 'mcpServers', 'plugins'], '外部扩展配置')
  if (config.version !== 1) throw Error('外部扩展配置 version 必须为 1。')
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') throw Error('enabled 必须为布尔值。')
  const enabled = config.enabled === true
  // Existing declarations never become active merely because Stable upgraded.
  if (runtime && !enabled) config = { version: 1 }
  const servers = {}, grants = {}, skills = [], readableRoots = [], policies = []
  function addServers(values, prefix = '') {
    if (values === undefined) return
    if (!plain(values)) throw Error('mcpServers 必须是对象。')
    for (const [name, value] of Object.entries(values)) {
      if (!NAME.test(name) || name === 'stable') throw Error('MCP 名称无效或使用了 Stable 保留名称。')
      keys(value, ['type', 'url', 'headers', 'tools'], 'MCP 配置')
      if (!['http', 'sse'].includes(value.type)) throw Error('外部 MCP 当前支持 HTTP/SSE；stdio 进程尚未接入 WSL2，不能在 Windows 宿主启动。')
      let url
      try { url = new URL(value.url) } catch { throw Error('MCP URL 无效。') }
      if (url.username || url.password || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error('MCP 仅允许 HTTPS 或本机 HTTP 地址；凭据请使用 headers。')
      if (value.headers !== undefined && (!plain(value.headers) || Object.entries(value.headers).some(([k, v]) => !/^[\w-]+$/.test(k) || typeof v !== 'string' || /[\r\n]/.test(v)))) throw Error('MCP headers 无效。')
      if (value.tools !== undefined && (!Array.isArray(value.tools) || value.tools.some(n => typeof n !== 'string' || !/^[\w.-]{1,128}$/.test(n)))) throw Error('MCP tools 必须是精确工具名称数组，不支持通配符。')
      const id = prefix + name
      if (servers[id]) throw Error('MCP 名称重复。')
      servers[id] = { type: value.type, url: url.href, ...(value.headers ? { headers: value.headers } : {}) }
      grants[id] = value.tools || []
    }
  }
  addServers(config.mcpServers)
  if (config.plugins !== undefined && !Array.isArray(config.plugins)) throw Error('plugins 必须是数组。')
  for (const plugin of config.plugins || []) {
    keys(plugin, ['path'], '插件配置')
    if (typeof plugin.path !== 'string' || !path.isAbsolute(plugin.path)) throw Error('插件需要本机绝对路径。')
    const root = localPath(plugin.path, true)
    // Only declarative components enter the SDK. Hooks/mods/agents may run
    // arbitrary host code or bypass the fixed stable-worker permission policy.
    for (const name of ['hooks', 'agents', 'commands', 'mods', '.lsp.json', '.claude']) if (fs.existsSync(path.join(root, name))) throw Error(`插件组件 ${name} 尚未接入 WSL2 权限边界。`)
    const manifestFile = path.join(root, '.claude-plugin', 'plugin.json')
    const manifest = readJSON(manifestFile)
    keys(manifest, ['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords'], '插件清单')
    if (!NAME.test(manifest.name || '') || manifest.name === 'stable-authorized') throw Error('插件名称无效或保留。')
    policies.push({ root, manifest })
    const mcpFile = path.join(root, '.mcp.json')
    if (fs.existsSync(mcpFile)) {
      const mcp = readJSON(mcpFile); keys(mcp, ['mcpServers'], '插件 MCP 配置')
      addServers(mcp.mcpServers, `plugin-${manifest.name}-`)
    }
    const skillRoot = path.join(root, 'skills')
    if (fs.existsSync(skillRoot)) {
      localPath(skillRoot, true)
      for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
        const folder = localPath(path.join(skillRoot, entry.name), true)
        localPath(path.join(folder, 'SKILL.md'))
        skills.push({ name: `${manifest.name}:${entry.name}`, path: folder })
        readableRoots.push(folder)
      }
    }
  }
  if (Object.keys(servers).length > 32 || skills.length > 200) throw Error('外部扩展超过 32 个 MCP 或 200 个技能限制。')
  const skillHashes = skills.map(skill => {
    const file = localPath(path.join(skill.path, 'SKILL.md'))
    if (fs.statSync(file).size > 2_000_000) throw Error('插件 Skill 入口文件过大。')
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  })
  const fingerprint = createHash('sha256').update(JSON.stringify({ enabled, servers, grants, policies, skills, skillHashes })).digest('hex')
  return { file, enabled, servers, grants, skills, readableRoots, fingerprint,
    permits(name) { return Object.entries(grants).some(([server, tools]) => tools.some(tool => name === `mcp__${server}__${tool}`)) },
  }
}

module.exports = { loadClaudeExtensions, configurationPath }
