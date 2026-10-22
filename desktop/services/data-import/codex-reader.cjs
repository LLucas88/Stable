'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { fileURLToPath } = require('node:url')
const { readFile, regularPath, skillFiles, digest } = require('./workbuddy-reader.cjs')
const { inspectSkillFolder } = require('../importers.cjs')
const MB = 1024 * 1024
const artifactType = /\.(pdf|docx?|xlsx?|pptx?|html?|md|txt|csv|tsv|png|jpe?g|gif|webp|svg|mp[34]|wav)$/i
const privatePath = /(?:^|[\\/])(?:auth(?:\.[^\\/]*)?|config\.toml|credentials?[^\\/]*|secrets?[^\\/]*|tokens?[^\\/]*|\.env[^\\/]*|\.git|\.ssh|\.aws)(?:[\\/]|$)/i

function userText(text) {
  // These are client-injected context, not questions authored by the user.
  if (/^\s*(?:# AGENTS\.md instructions|<(?:environment_context|external_codex_apps_open_page|system_reminder|permissions instructions)>)/.test(text)) return ''
  const reply = text.match(/<send_user_message_question_reply>([\s\S]*?)<\/send_user_message_question_reply>/)
  if (reply) {
    try { return JSON.parse(reply[1]).map(item => [item.question, item.answer].filter(Boolean).join('\n')).join('\n\n') } catch { return '' }
  }
  return text.replace(/<image\b[^>]*>|<\/image>/g, '').replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, '').trim()
}

function parseRollout(bytes) {
  let meta = {}, malformed = 0
  const messages = [], seen = new Set()
  const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
  const confirmedFinals = new Set()
  for (const line of lines) if (/"type"\s*:\s*"task_complete"/.test(line)) {
    try { const row = JSON.parse(line); if (row.type === 'event_msg' && row.payload?.type === 'task_complete' && typeof row.payload.last_agent_message === 'string') confirmedFinals.add(row.payload.last_agent_message.trim()) } catch {}
  }
  for (const line of lines) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { malformed++; continue }
    const p = row.payload || {}
    if (row.type === 'session_meta') { meta = p; continue }
    if (row.type !== 'response_item' || p.type !== 'message' || !['user', 'assistant'].includes(p.role)) continue
    if (p.id && seen.has(p.id)) continue
    const raw = (Array.isArray(p.content) ? p.content : []).filter(c => ['input_text', 'output_text'].includes(c.type)).map(c => c.text || '').join('\n')
    if (p.role === 'assistant' && !['final_answer', 'final'].includes(p.phase || p.channel) && !(!p.phase && !p.channel && confirmedFinals.has(raw.trim()))) continue
    if (p.id) seen.add(p.id)
    const content = p.role === 'user' ? userText(raw) : raw.replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, '').trim()
    if (!content) continue
    const refs = []
    for (const m of raw.matchAll(/\]\((<[^>]+>|[^\n)]+)\)/g)) refs.push(m[1].replace(/^<|>$/g, ''))
    for (const m of raw.matchAll(/<image\b[^>]*\bpath="([^"]+)"/g)) refs.push(m[1])
    const date = new Date(row.timestamp || meta.timestamp || 0)
    messages.push({ sourceId: p.id || String(messages.length), role: p.role, content, refs, fileIds: [], active: true, createdAt: Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString() })
  }
  return { meta, messages, malformed }
}

function sessionHeader(file) {
  regularPath(file)
  const fd = fs.openSync(file, 'r')
  try {
    const chunks = []
    for (let size = 0; size < MB;) {
      const buffer = Buffer.alloc(8192), count = fs.readSync(fd, buffer)
      if (!count) break
      chunks.push(buffer.subarray(0, count)); size += count
      const end = buffer.subarray(0, count).indexOf(10)
      if (end >= 0) {
        const row = JSON.parse(Buffer.concat(chunks).toString('utf8').split('\n')[0].replace(/^\uFEFF/, ''))
        return row.type === 'session_meta' ? row.payload : {}
      }
    }
    return {}
  } finally { fs.closeSync(fd) }
}

function scanCodex(input, staging) {
  const root = path.resolve(input || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'))
  fs.mkdirSync(staging, { recursive: true })
  if (!fs.existsSync(root)) return { provider: 'codex', root, items: [], warnings: ['未发现本机 Codex 数据，请选择 .codex 数据目录。'], scannedAt: new Date().toISOString() }
  regularPath(root, true)
  const items = [], warnings = [], names = new Map(), seen = new Set()
  const add = (kind, key, values) => {
    if (items.length >= 5000) throw Error('可导入条目超过 5000 项，请选择较小的数据目录。')
    const sourceKey = `codex:${kind}:${key}`
    const item = { id: digest(sourceKey), kind, sourceKey, name: key, status: 'ready', warnings: [], fingerprint: '', ...values }
    items.push(item); return item
  }
  function files(folder, accept, depth = 0) {
    if (!fs.existsSync(folder) || depth > 8) return []
    regularPath(folder, true)
    const result = []
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || privatePath.test(entry.name)) continue
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) result.push(...files(file, accept, depth + 1))
      else if (entry.isFile() && accept(file)) result.push(file)
      if (result.length > 10000) throw Error('数据目录条目过多，请选择较小的数据目录。')
    }
    return result
  }
  let global = {}
  try {
    const state = path.join(root, '.codex-global-state.json')
    if (fs.existsSync(state)) global = JSON.parse(readFile(state, 32 * MB).toString('utf8'))
    const index = path.join(root, 'session_index.jsonl')
    if (fs.existsSync(index)) for (const line of readFile(index, 32 * MB).toString('utf8').split('\n')) {
      try { const row = JSON.parse(line); if (typeof row.thread_name === 'string') names.set(row.id, row.thread_name) } catch {}
    }
  } catch { warnings.push('部分项目名称未能读取，将使用会话标题和工作目录。') }
  const projects = new Map()
  for (const p of Object.values(global['local-projects'] || {})) if (p && typeof p.id === 'string') projects.set(p.id, p)
  const projectless = new Set(global['projectless-thread-ids'] || [])
  const projectFor = meta => {
    if (projectless.has(meta.id)) return null
    const assignment = global['thread-project-assignments']?.[meta.id]
    const saved = projects.get(assignment?.projectId)
    const cwd = typeof meta.cwd === 'string' && path.isAbsolute(meta.cwd) ? path.resolve(meta.cwd) : ''
    const key = saved?.id || cwd
    if (!key || (!saved && cwd.startsWith(path.join(root, 'worktrees')))) return null
    let item = items.find(i => i.kind === 'project' && i.sourceKey === `codex:project:${key}`)
    if (!item) item = add('project', key, { name: saved?.name || path.basename(cwd) || cwd, fingerprint: digest(key), data: {} })
    return item.id
  }
  const roots = ['sessions', 'archived_sessions'].map(name => path.join(root, name)).filter(p => fs.existsSync(p))
  const rollouts = roots.length ? roots.flatMap(p => files(p, f => f.endsWith('.jsonl'))) : files(root, f => /^rollout-.*\.jsonl$/.test(path.basename(f)))
  rollouts.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  let scannedBytes = 0
  for (const file of rollouts) {
    try { const meta = sessionHeader(file); if (meta.source?.subagent || meta.thread_source?.kind === 'subagent') continue } catch { continue }
    const size = fs.statSync(file).size
    if (size > 100 * MB) { warnings.push('部分单条会话超过 100 MB，未纳入本次导入。'); continue }
    if (scannedBytes + size > 512 * MB) { warnings.push('本次仅扫描最近 512 MB 会话，可选择较早的 sessions 子目录继续导入。'); break }
    scannedBytes += size
    let item
    try {
      const parsed = parseRollout(readFile(file, 100 * MB)), { meta, messages } = parsed
      if (!meta.id || seen.has(meta.id) || meta.source?.subagent || meta.thread_source?.kind === 'subagent') continue
      seen.add(meta.id)
      if (!messages.length) continue
      item = add('session', meta.id, { name: names.get(meta.id) || messages.find(m => m.role === 'user')?.content.slice(0, 100) || 'Codex 对话', fileIds: [], messageCount: messages.length, activeCount: messages.length })
      if (parsed.malformed) item.warnings.push('部分记录不完整，已跳过。')
      item.projectItemId = projectFor(meta)
      for (const message of messages) {
        message.fileReferences = []
        for (const reference of new Set(message.refs)) {
          let target = reference
          try {
            if (/^file:\/\//i.test(target)) target = fileURLToPath(target)
            else { try { target = decodeURIComponent(target) } catch {} }
            target = target.replace(/(?::\d+(?::\d+)?|#L\d+(?:-L\d+)?)$/, '')
            if (!path.isAbsolute(target) && !/^[a-z]+:/i.test(target) && meta.cwd) target = path.resolve(meta.cwd, target)
            if (!path.isAbsolute(target) || !artifactType.test(target) || privatePath.test(target)) continue
            const fid = digest(`codex:file:${meta.id}:${target}`)
            if (!items.some(i => i.id === fid)) {
              const artifact = add('file', `${meta.id}:${target}`, { name: path.basename(target), owner: item.id, status: 'unavailable', detail: target, warnings: ['文件无本地副本。'] })
              try {
                const bytes = readFile(target)
                Object.assign(artifact, { status: 'ready', warnings: [], size: bytes.length, fingerprint: digest(bytes), data: { sourcePath: target, allowedRoot: path.dirname(target) } })
              } catch {}
            }
            message.fileIds.push(fid); item.fileIds.push(fid)
            message.fileReferences.push({ id: fid, reference })
          } catch {}
        }
        delete message.refs
      }
      item.fileIds = [...new Set(item.fileIds)]
      // Snapshot Q/A only: reasoning, credentials and tool outputs never enter staging.
      const snapshot = Buffer.from(JSON.stringify(messages))
      item.fingerprint = digest(snapshot)
      item.data = { messages, originalPath: '', account: '', fileIds: item.fileIds }
      item.preview = messages.slice(0, 4).map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n\n').slice(0, 6000)
      fs.writeFileSync(path.join(staging, item.id + '.jsonl'), snapshot, { flag: 'wx' })
    } catch (error) {
      if (item) { item.status = 'unavailable'; item.warnings.push(error.message) }
      else warnings.push('部分会话正在写入、过大或无法读取，请稍后重新扫描。')
    }
  }
  for (const file of files(path.join(root, 'skills'), f => path.basename(f) === 'SKILL.md')) {
    const folder = path.dirname(file), item = add('skill', path.relative(root, folder), { name: path.basename(folder) })
    try {
      const inspected = inspectSkillFolder(folder), list = skillFiles(folder)
      Object.assign(item, { name: inspected.name, preview: inspected.content.slice(0, 6000), size: inspected.size, fingerprint: digest(JSON.stringify(list)), data: { folder, files: list } })
    } catch (error) { item.status = 'unavailable'; item.warnings.push(error.message) }
  }
  const memory = [...['AGENTS.md'].map(p => path.join(root, p)).filter(p => fs.existsSync(p)), ...files(path.join(root, 'memories'), f => /\.md$/i.test(f))]
  for (const file of memory) {
    const item = add('memory', path.relative(root, file), { name: path.basename(file) })
    try {
      const bytes = readFile(file), content = bytes.toString('utf8')
      Object.assign(item, { size: bytes.length, preview: content.slice(0, 6000), fingerprint: digest(bytes), data: { content, scope: 'global' } })
    } catch (error) { item.status = 'unavailable'; item.warnings.push(error.message) }
  }
  const config = path.join(root, 'config.toml')
  if (fs.existsSync(config)) {
    try {
      // Only recognize literal URL declarations. Never migrate commands, headers, env or OAuth tokens.
      const text = readFile(config, 4 * MB).toString('utf8')
      for (const match of text.matchAll(/^\[mcp_servers\.("[^"\r\n]+"|'[^'\r\n]+'|[\w-]+)\]\s*(?:#[^\n]*)?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) {
        const name = match[1].replace(/^["']|["']$/g, ''), item = add('connector', name, { name, status: 'unavailable', warnings: ['该连接器配置暂不支持导入。'] })
        const urlText = match[2].match(/^url\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#[^\n]*)?$/m)
        if (!urlText) continue
        try {
          const value = urlText[1].startsWith('"') ? JSON.parse(urlText[1]) : urlText[1].slice(1, -1), url = new URL(value)
          if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) continue
          url.username = ''; url.password = ''; url.search = ''; url.hash = ''
          Object.assign(item, { status: 'ready', warnings: [], data: { type: 'http', url: url.href }, fingerprint: digest(url.href), preview: url.href })
        } catch {}
      }
    } catch { warnings.push('连接器配置未能读取。') }
  }
  if (!items.length) warnings.push('未找到可读取的 Codex 本机数据。')
  return { provider: 'codex', root, items, warnings: [...new Set(warnings)], scannedAt: new Date().toISOString() }
}

module.exports = { scanCodex, parseRollout }
if (!require('node:worker_threads').isMainThread && (require.main === module || require.main?.filename === require.resolve('../codex-reader.cjs'))) {
  const { parentPort, workerData } = require('node:worker_threads')
  try { parentPort.postMessage({ result: scanCodex(workerData.root, workerData.staging) }) }
  catch (error) { parentPort.postMessage({ error: error.message }) }
}
