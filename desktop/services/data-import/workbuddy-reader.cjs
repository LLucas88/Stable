'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { fileURLToPath } = require('node:url')
const { DatabaseSync } = require('node:sqlite')
const { inspectSkillFolder } = require('../importers.cjs')

const MAX_FILE = 50 * 1024 * 1024
const MAX_SESSION = 100 * 1024 * 1024
const MAX_ITEMS = 5000
const DOCUMENT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.html', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp3', '.mp4', '.wav'])
const digest = value => createHash('sha256').update(value).digest('hex')
const inside = (root, target) => { const rel = path.relative(root, target); return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)) }

// Reject links in every component, including junctions above the selected file.
function regularPath(value, directory = false) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /^\\\\/.test(value)) throw Error('路径必须是本地绝对路径。')
  const resolved = path.resolve(value)
  let current = path.parse(resolved).root
  for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('导入不支持符号链接或目录联接。')
  }
  const stat = fs.statSync(resolved)
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw Error(directory ? '来源不是文件夹。' : '来源不是普通文件。')
  return resolved
}

function readFile(value, limit = MAX_FILE) {
  const source = regularPath(value), before = fs.statSync(source)
  if (before.size > limit) throw Error(`文件超过 ${Math.round(limit / 1024 / 1024)} MB，请拆分后导入。`)
  const data = fs.readFileSync(source), after = fs.statSync(source)
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || data.length !== before.size) throw Error('文件正在变化，请稍后重新扫描。')
  return data
}

function readJson(value, limit) { return JSON.parse(readFile(value, limit).toString('utf8').replace(/^\uFEFF/, '')) }
function iso(value, fallback = '1970-01-01T00:00:00.000Z') {
  const date = new Date(typeof value === 'number' && value < 1e11 ? value * 1000 : value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}

// Work on a private DB+WAL copy. Never open the source with SQLite (even a
// read-only SQLite connection may create/update shared-memory files).
function readMetadata(root, staging) {
  const source = path.join(root, 'workbuddy.db')
  if (!fs.existsSync(source)) return { sessions: [], workspaces: [], warning: '未找到会话数据库，将从本地会话文件恢复标题和分组。' }
  const target = path.join(staging, 'metadata.db')
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = readFile(source, MAX_SESSION), walPath = source + '-wal'
    const wal = fs.existsSync(walPath) ? readFile(walPath, MAX_SESSION) : null
    if (digest(data) !== digest(readFile(source, MAX_SESSION))) continue
    const nextWal = fs.existsSync(walPath) ? readFile(walPath, MAX_SESSION) : null
    if (Boolean(wal) !== Boolean(nextWal) || (wal && digest(wal) !== digest(nextWal))) continue
    fs.writeFileSync(target, data)
    if (wal) fs.writeFileSync(target + '-wal', wal)
    let db
    try {
      db = new DatabaseSync(target)
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name))
      if (!tables.has('sessions')) throw Error('WorkBuddy 数据库缺少 sessions 表。')
      const columns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(r => r.name))
      const fields = ['id', 'cwd', 'user_id', 'title', 'custom_title', 'created_at', 'updated_at', 'deleted_at', 'project_id'].filter(k => columns.has(k))
      if (!columns.has('id')) throw Error('无法识别 WorkBuddy 会话数据库版本。')
      const sessions = db.prepare(`SELECT ${fields.join(',')} FROM sessions`).all()
      const workspaces = tables.has('workspaces') ? db.prepare('SELECT path FROM workspaces').all() : []
      return { sessions, workspaces }
    } finally {
      db?.close()
      for (const suffix of ['', '-wal', '-shm']) fs.rmSync(target + suffix, { force: true })
    }
  }
  throw Error('WorkBuddy 数据库持续变化，未获得一致快照；请暂停 WorkBuddy 任务后重试。')
}

function userText(text) {
  const matches = [...text.matchAll(/<user_query(?:\s[^>]*)?>([\s\S]*?)<\/user_query>/g)]
  if (matches.length) return matches.map(m => m[1].trim()).join('\n\n')
  // Do not promote WorkBuddy's injected identity/tool prompts into user messages.
  if (/<(?:identity_context|memory_and_skills_reminder|product_identity|project_context)>/.test(text)) return ''
  return text
}

function parseSession(data, { qaOnly = false } = {}) {
  const records = [], messages = [], byId = new Map(), warnings = []
  const messageOf = row => row.message && typeof row.message.role === 'string' ? row.message : row
  let malformed = 0, unsupported = 0
  for (const line of data.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue
    try { const row = JSON.parse(line); if (row && typeof row === 'object') records.push(row) } catch { malformed++ }
  }
  if (malformed) warnings.push(`${malformed} 行记录不完整或损坏，原始文件保留，未作为消息导入。`)
  for (const row of records) if (typeof row.id === 'string') byId.set(row.id, row)
  const linked = records.some(row => typeof row.id === 'string' && Object.hasOwn(row, 'parentId'))
  let leaf = linked ? [...records].reverse().find(row => typeof row.id === 'string' && (Object.hasOwn(row, 'parentId') || ['user', 'assistant'].includes(messageOf(row).role))) : null
  const active = new Set()
  while (leaf && !active.has(leaf.id)) { active.add(leaf.id); leaf = byId.get(leaf.parentId) }
  // WorkBuddy emits progress/analysis as output_text before tool calls. Only
  // the answer after the final tool in each active user turn is conversational.
  const transient = new Set()
  if (qaOnly) {
    let toolsAhead = false
    for (const row of [...records].reverse()) {
      if (linked && !active.has(row.id)) continue
      const message = messageOf(row)
      const blocks = Array.isArray(message.content) ? message.content : []
      if (['function_call', 'function_call_result'].includes(row.type) || blocks.some(b => ['tool_use', 'tool_result'].includes(b?.type))) toolsAhead = true
      if (message.role === 'user' && !blocks.some(b => b?.type === 'tool_result')) toolsAhead = false
      if (message.role === 'assistant' && (toolsAhead || ['analysis', 'commentary'].includes(message.channel || row.channel) || message.stop_reason === 'tool_use')) transient.add(row)
    }
  }
  const messageIds = new Map()
  for (const row of records) {
    const message = messageOf(row)
    const role = message.role
    if (!['user', 'assistant'].includes(role) || !['message', 'user', 'assistant'].includes(row.type)) continue
    if (qaOnly && ((linked && !active.has(row.id)) || transient.has(row))) continue
    const blocks = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content || '' }]
    const text = [], files = []
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue
      if (['text', 'input_text', 'output_text'].includes(block.type) && typeof block.text === 'string') {
        const value = role === 'user' ? userText(block.text) : block.text
        if (value) text.push(value)
        if (role === 'user') {
          for (const section of block.text.matchAll(/<(attached_files|local_files)>[\s\S]*?<\/\1>/g)) {
            for (const file of section[0].matchAll(/<file\s+[^>]*?path=["']([^"']+)["'][^>]*\/?\s*>/g)) {
              const filename = file[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
              files.push({ path: filename, name: path.basename(filename), origin: 'project' })
            }
          }
          for (const match of block.text.matchAll(/<image_local_path>([^<]+)<\/image_local_path>/g)) files.push({ path: match[1].trim(), name: path.basename(match[1].trim()), origin: 'project' })
        }
      } else if (block.type === 'image_blob_ref' && typeof block.blob_path === 'string') {
        files.push({ path: block.blob_path, name: block.original_filename || path.basename(block.blob_path), type: 'image' })
      } else if (!['tool_use', 'tool_result', 'thinking', 'redacted_thinking'].includes(block.type)) unsupported++
    }
    if (!text.length && !files.length) continue
    const item = { sourceId: String(row.id || row.uuid || messages.length), role, content: text.join('\n\n') || '（文件附件）', createdAt: iso(row.timestamp), files, active: !linked || active.has(row.id) }
    if (messageIds.has(item.sourceId)) messages[messageIds.get(item.sourceId)] = item
    else { messageIds.set(item.sourceId, messages.length); messages.push(item) }
  }
  if (linked && !messages.some(m => m.active)) throw Error('无法识别当前会话分支，未自动合并不同分支。')
  if (unsupported) warnings.push(`${unsupported} 个暂不支持的内容块仅保存在原始记录中。`)
  const activeCount = messages.filter(m => m.active).length
  if (activeCount !== messages.length) warnings.push(`包含历史分支：共 ${messages.length} 条消息，续聊使用当前分支 ${activeCount} 条。`)
  const title = [...records].reverse().find(row => row.type === 'ai-title')?.aiTitle
  return { messages, warnings, title, cwd: records.find(row => typeof row.cwd === 'string')?.cwd, activeCount }
}

function skillFiles(folder) {
  inspectSkillFolder(folder)
  const files = []
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(target)
      else files.push({ relative: path.relative(folder, target), hash: digest(readFile(target)) })
    }
  }
  visit(folder)
  return files
}

function scanWorkBuddy(root, staging) {
  root = regularPath(root, true)
  if (!['workbuddy.db', 'projects', 'memory', 'skills'].some(name => fs.existsSync(path.join(root, name)))) throw Error('这个文件夹不是 WorkBuddy 数据目录，请选择 .workbuddy 文件夹。')
  fs.mkdirSync(staging, { recursive: true })
  const items = [], warnings = [], source = digest(process.platform === 'win32' ? root.toLowerCase() : root)
  let totalSessionBytes = 0
  const metadata = readMetadata(root, staging)
  const sessions = new Map(metadata.sessions.map(row => [row.id, row]))
  const add = (kind, key, values) => {
    if (items.length >= MAX_ITEMS) throw Error(`一次最多扫描 ${MAX_ITEMS} 项，请缩小来源目录。`)
    const id = digest(kind + ':' + key)
    const prior = items.find(item => item.id === id)
    if (prior) return prior
    const item = { id, kind, name: key, status: 'ready', warnings: [], sourceKey: `${source}:${kind}:${key}`, fingerprint: '', ...values }
    items.push(item); return item
  }
  const safeList = folder => {
    if (!fs.existsSync(folder)) return []
    regularPath(folder, true)
    return fs.readdirSync(folder, { withFileTypes: true })
  }
  const projectMap = new Map()
  const addProject = cwd => {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null
    if (projectMap.has(cwd)) return projectMap.get(cwd)
    const item = add('project', cwd, { name: path.basename(cwd) || cwd, detail: cwd, fingerprint: digest(cwd), data: { originalPath: cwd } })
    projectMap.set(cwd, item); return item
  }
  for (const row of metadata.workspaces) addProject(row.path)

  const addFile = (candidate, owner, allowedRoot, name) => {
    const resolved = path.resolve(candidate), key = `${owner || 'standalone'}:${resolved}`
    const item = add('file', key, { name: name || path.basename(resolved), detail: resolved, owner, sourcePath: resolved })
    try {
      if (!inside(allowedRoot, resolved)) throw Error('文件不在此会话的来源目录内，未读取。')
      if (!DOCUMENT_EXTENSIONS.has(path.extname(resolved).toLowerCase()) || /(?:^|[\\/])(?:\.env(?:\..*)?|auth\.json|keyblob|credentials|\.ssh|\.aws|\.codex|\.git)(?:[\\/]|$)/i.test(resolved)) throw Error('此文件类型不在资料导入范围内。')
      if (!inside(root, resolved) && /(?:^|[\\/])(?:AppData|ProgramData|Windows|Program Files(?: \(x86\))?)(?:[\\/]|$)/i.test(resolved)) throw Error('系统及应用配置目录不作为附件迁移。')
      const bytes = readFile(resolved)
      item.size = bytes.length; item.fingerprint = digest(bytes)
      item.data = { sourcePath: resolved, allowedRoot, hash: item.fingerprint }
    } catch (error) { item.status = 'unavailable'; item.warnings = [error.message] }
    return item
  }

  const projectsRoot = path.join(root, 'projects')
  for (const folder of safeList(projectsRoot)) {
    if (!folder.isDirectory() || folder.isSymbolicLink()) continue
    for (const entry of safeList(path.join(projectsRoot, folder.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const sourceId = entry.name.slice(0, -6), meta = sessions.get(sourceId)
      if (meta?.deleted_at) continue
      const file = path.join(projectsRoot, folder.name, entry.name)
      const item = add('session', sourceId, { name: meta?.custom_title || meta?.title || sourceId, detail: folder.name, sourcePath: file })
      try {
        const size = fs.statSync(regularPath(file)).size
        if (totalSessionBytes + size > 256 * 1024 * 1024) throw Error('本次会话数据超过 256 MB，请选择较小的来源备份分批导入。')
        const bytes = readFile(file, MAX_SESSION)
        totalSessionBytes += bytes.length
        const parsed = parseSession(bytes, { qaOnly: true })
        if (!parsed.messages.length) throw Error('没有可导入的用户或助手消息。')
        const cwd = meta?.cwd || parsed.cwd
        const project = addProject(cwd)
        const fileIds = []
        for (const message of parsed.messages) {
          message.fileIds = []
          for (const ref of message.files) {
            const base = ref.origin === 'project' && cwd && path.isAbsolute(cwd) ? path.resolve(cwd) : root
            const candidate = path.isAbsolute(ref.path) ? ref.path : path.join(base, ref.path)
            const allowed = inside(root, candidate) ? root : base
            const attachment = addFile(candidate, item.id, allowed, ref.name)
            fileIds.push(attachment.id); message.fileIds.push(attachment.id)
          }
          delete message.files
        }
        const indexPath = path.join(root, 'artifact-index', sourceId + '.json')
        if (fs.existsSync(indexPath)) {
          try {
            const index = readJson(indexPath)
            for (const artifact of Array.isArray(index.artifacts) ? index.artifacts : []) {
              if (!artifact || typeof artifact.uri !== 'string') continue
              if (!artifact.uri.startsWith('file:')) {
                const external = add('file', `${sourceId}:${artifact.uri}`, { name: artifact.name || '云端文件', detail: '云端链接，未下载', owner: item.id, status: 'unavailable', warnings: ['此文件没有可迁移的本地副本。'] })
                fileIds.push(external.id); continue
              }
              const filename = fileURLToPath(artifact.uri)
              // Inspect only explicit artifact references, never enumerate the
              // original workspace (which may be an entire drive).
              const allowed = inside(root, filename) ? root : cwd && path.isAbsolute(cwd) ? path.resolve(cwd) : root
              const attachment = addFile(filename, item.id, allowed, artifact.name)
              fileIds.push(attachment.id)
            }
          } catch (error) { parsed.warnings.push(`产物索引未完整读取：${error.message}`) }
        }
        item.name = meta?.custom_title || meta?.title || parsed.title || sourceId
        item.fingerprint = digest(bytes); item.messageCount = parsed.messages.length; item.activeCount = parsed.activeCount
        item.warnings = parsed.warnings; item.projectItemId = project?.id; item.fileIds = [...new Set(fileIds)]
        item.data = { messages: parsed.messages, activeCount: parsed.activeCount, projectItemId: project?.id, originalPath: cwd || '', account: meta?.user_id || '', fileIds: item.fileIds }
        item.preview = parsed.messages.slice(0, 4).map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n\n').slice(0, 6000)
        fs.writeFileSync(path.join(staging, item.id + '.jsonl'), bytes)
      } catch (error) { item.status = 'unavailable'; item.warnings.push(error.message) }
    }
  }
  for (const meta of metadata.sessions) {
    if (!meta.deleted_at && !items.some(item => item.kind === 'session' && item.sourceKey.endsWith(':' + meta.id))) add('session', meta.id, { name: meta.custom_title || meta.title || meta.id, status: 'unavailable', warnings: ['数据库中存在会话，但未找到本地 JSONL，未假定云端记录已下载。'] })
  }

  const addText = (file, kind, scope) => {
    const item = add(kind, path.relative(root, file), { name: `${scope ? scope + ' / ' : ''}${path.basename(file)}`, detail: path.relative(root, file) })
    try {
      const data = readFile(file, 2 * 1024 * 1024), content = data.toString('utf8').replace(/^\uFEFF/, '')
      item.size = data.length; item.fingerprint = digest(data); item.preview = content.slice(0, 6000); item.data = { content, scope }
    } catch (error) { item.status = 'unavailable'; item.warnings.push(error.message) }
  }
  for (const entry of safeList(path.join(root, 'memory'))) if (entry.isFile() && /\.md$/i.test(entry.name)) addText(path.join(root, 'memory', entry.name), 'memory', '个人记忆')
  for (const folder of ['', ...safeList(root).filter(e => e.isDirectory() && /^user-[\w-]+$/.test(e.name)).map(e => e.name)]) {
    for (const name of ['USER.md', 'SOUL.md', 'IDENTITY.md', 'BOOTSTRAP.md', 'AGENTS.md', 'CODEBUDDY.md']) {
      const file = path.join(root, folder, name)
      if (fs.existsSync(file)) addText(file, 'instruction', folder || '全局')
    }
  }
  const skillRoots = [path.join(root, 'skills')]
  const installedPath = path.join(root, 'plugins', 'installed_plugins.json')
  if (fs.existsSync(installedPath)) {
    try {
      const installed = readJson(installedPath)
      for (const versions of Object.values(installed.plugins || {})) for (const entry of Array.isArray(versions) ? versions : []) {
        if (typeof entry.installPath !== 'string' || !inside(path.join(root, 'plugins', 'cache'), path.resolve(entry.installPath))) continue
        if (fs.existsSync(path.join(entry.installPath, 'skills'))) skillRoots.push(path.join(entry.installPath, 'skills'))
        if (fs.existsSync(path.join(entry.installPath, 'SKILL.md'))) skillRoots.push(entry.installPath)
      }
    } catch (error) { warnings.push(`插件技能索引未完整读取：${error.message}`) }
  }
  const visited = new Set()
  function scanSkills(folder, depth = 0) {
    if (depth > 4 || visited.has(folder)) return
    visited.add(folder)
    if (fs.existsSync(path.join(folder, 'SKILL.md'))) {
      const item = add('skill', path.relative(root, folder), { name: path.basename(folder), detail: path.relative(root, folder), sourcePath: folder })
      try {
        regularPath(folder, true)
        const inspected = inspectSkillFolder(folder), files = skillFiles(folder)
        item.name = inspected.name; item.size = inspected.size; item.preview = inspected.content.slice(0, 6000)
        item.fingerprint = digest(JSON.stringify(files)); item.data = { folder, files, name: inspected.name, description: inspected.description }
      } catch (error) { item.status = 'unavailable'; item.warnings.push(error.message) }
      return
    }
    for (const entry of safeList(folder)) if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')) scanSkills(path.join(folder, entry.name), depth + 1)
  }
  for (const folder of skillRoots) scanSkills(folder)
  const connectorConfigs = ['mcp.json', '.mcp.json']
  for (const account of safeList(path.join(root, 'connectors'))) {
    if (!account.isDirectory() || account.isSymbolicLink()) continue
    const stateFile = path.join(root, 'connectors', account.name, 'connector-states.v3.json')
    if (!fs.existsSync(stateFile)) continue
    try {
      const state = readJson(stateFile, 1024 * 1024)
      for (const id of new Set([...(Array.isArray(state.enabled) ? state.enabled : []), ...(Array.isArray(state.everConnected) ? state.everConnected : [])])) {
        if (typeof id !== 'string' || !/^[a-z0-9_-]+$/i.test(id)) continue
        const name = `connectors-marketplace/connectors/${id}/mcp.json`
        if (fs.existsSync(path.join(root, name))) connectorConfigs.push(name)
        else add('connector', id, { name: id, status: 'unavailable', warnings: ['未找到可读取的连接器配置。'] })
      }
    } catch { warnings.push('部分连接器配置无法读取。') }
  }
  for (const name of new Set(connectorConfigs)) {
    const file = path.join(root, name)
    if (!fs.existsSync(file)) continue
    try {
      const config = readJson(file, 1024 * 1024)
      for (const [key, value] of Object.entries(config.mcpServers || {})) {
        const item = add('connector', `${name}:${key}`, { name: key })
        try {
          const url = new URL(value.url)
          if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw Error('不支持此连接器地址。')
          // Credentials and source grants never migrate, including URL secrets.
          url.username = ''; url.password = ''; url.search = ''; url.hash = ''
          item.data = { type: value.type === 'sse' ? 'sse' : 'http', url: url.href, enabled: false }
          item.fingerprint = digest(JSON.stringify(item.data)); item.preview = JSON.stringify(item.data, null, 2)
        } catch { item.status = 'unavailable'; item.warnings = ['此连接器需要手动重新配置。'] }
      }
    } catch { warnings.push('连接器配置无法读取。') }
  }
  return { provider: 'workbuddy', root, source, items, warnings, scannedAt: new Date().toISOString() }
}

module.exports = { scanWorkBuddy, parseSession, readMetadata, regularPath, readFile, skillFiles, digest, inside, MAX_FILE }

if (!require('node:worker_threads').isMainThread && (require.main === module || require.main?.filename === require.resolve('../workbuddy-reader.cjs'))) {
  const { parentPort, workerData } = require('node:worker_threads')
  try { parentPort.postMessage({ result: scanWorkBuddy(workerData.root, workerData.staging) }) }
  catch (error) { parentPort.postMessage({ error: error.message }) }
}
