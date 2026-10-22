'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const JSZip = require('jszip')
const { readFile, regularPath, digest, inside } = require('./workbuddy-reader.cjs')
const LIMIT = 256 * 1024 * 1024
const allowedFile = /\.(?:pdf|docx?|xlsx?|pptx?|html?|md|txt|csv|tsv|json|png|jpe?g|gif|webp|svg|mp[34]|wav)$/i
const privateName = /(?:^|[\\/])(?:cookies|network|auth[^/]*|credentials|secrets?|token[^/]*|\.env[^/]*)(?:[\\/.]|$)/i

function clientRoots(home = os.homedir()) {
  const roots = ['AppData/Roaming/ChatGPT', 'AppData/Local/ChatGPT'].map(p => path.join(home, p))
  const packages = path.join(home, 'AppData/Local/Packages')
  if (fs.existsSync(packages)) for (const entry of fs.readdirSync(packages, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink() && /^OpenAI\.ChatGPT(?:-Desktop)?_/i.test(entry.name)) {
      for (const sub of ['LocalCache', 'LocalState', 'RoamingState']) roots.push(path.join(packages, entry.name, sub))
    }
  }
  return roots.filter(p => fs.existsSync(p))
}

function conversations(value) {
  if (Array.isArray(value)) return value.filter(v => v?.mapping && typeof v.mapping === 'object')
  if (value?.mapping) return [value]
  if (Array.isArray(value?.conversations)) return conversations(value.conversations)
  return []
}

function parseConversation(conversation) {
  const mapping = conversation.mapping
  if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object') throw Error('无法识别 ChatGPT 会话。')
  let node = mapping[conversation.current_node]
  if (!node) {
    const leaves = Object.values(mapping).filter(n => n && (!n.children || !n.children.length))
    if (leaves.length !== 1) throw Error('无法确定当前会话分支。')
    node = leaves[0]
  }
  const chain = [], seen = new Set()
  while (node) {
    if (seen.has(node)) throw Error('会话分支存在循环。')
    seen.add(node); chain.unshift(node)
    if (node.parent && !mapping[node.parent]) throw Error('会话分支不完整。')
    node = node.parent ? mapping[node.parent] : null
  }
  return chain.flatMap(n => {
    const m = n.message, role = m?.author?.role
    if (!['user', 'assistant'].includes(role) || m.metadata?.is_visually_hidden_from_conversation || (m.recipient && m.recipient !== 'all')) return []
    if (role === 'assistant' && (['analysis', 'commentary', 'summary', 'confidence', 'justify'].includes(m.channel) || (m.channel && m.channel !== 'final'))) return []
    if (['thoughts', 'reasoning_recap', 'code', 'execution_output'].includes(m.content?.content_type)) return []
    const text = [], refs = []
    for (const part of m.content?.parts || []) {
      if (typeof part === 'string') text.push(part)
      else if (part?.asset_pointer) refs.push({ ref: part.asset_pointer, name: part.name })
    }
    for (const file of m.metadata?.attachments || []) if (file && typeof file === 'object') refs.push({ ref: file.id || file.name, name: file.name })
    const content = text.join('\n\n')
    for (const match of content.matchAll(/(?:sandbox:)?\/mnt\/data\/([^\s)\]<>"']+)/g)) {
      let name = match[1]; try { name = decodeURIComponent(name) } catch {}
      refs.push({ ref: match[0], name: path.posix.basename(name) })
    }
    if (!content && !refs.length) return []
    const timestamp = new Date((m.create_time || conversation.create_time || 0) * 1000)
    return [{ sourceId: m.id || n.id, role, content: content || '（文件附件）', createdAt: Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date(0).toISOString(), active: true, refs, fileIds: [] }]
  })
}

async function scanChatGPT(input, staging, { roots = clientRoots() } = {}) {
  fs.mkdirSync(staging, { recursive: true })
  let total = 0, inspected = 0
  const files = [], docs = [], warnings = [], items = []
  const budget = size => { total += size; if (total > LIMIT) throw Error('ChatGPT 数据超过 256 MB，请分批导入。') }
  if (input && /\.zip$/i.test(input)) {
    const zip = await JSZip.loadAsync(readFile(input, LIMIT))
    if (Object.keys(zip.files).length > 5000) throw Error('导出包文件过多，请分批导入。')
    for (const entry of Object.values(zip.files)) {
      const name = entry.unsafeOriginalName || entry.name
      if (entry.dir) continue
      if (name !== entry.name || /[\\:]|(^|\/)\.\.?(\/|$)|^\//.test(name) || /[. ]($|\/)/.test(name) || ((Number(entry.unixPermissions) & 0xf000) === 0xa000)) throw Error('导出包含有不安全路径。')
      if (privateName.test(name) || !allowedFile.test(name)) continue
      const chunks = []; let size = 0
      await new Promise((resolve, reject) => {
        const stream = entry.nodeStream()
        stream.on('data', chunk => { size += chunk.length; if (size > 100 * 1024 * 1024 || total + size > LIMIT) stream.destroy(Error('解压后的文件超过导入限制。')); else chunks.push(chunk) })
        stream.on('error', reject); stream.on('end', resolve)
      })
      budget(size)
      const target = path.join(staging, 'assets', name)
      if (!inside(path.join(staging, 'assets'), target)) throw Error('导出包路径无效。')
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.concat(chunks), { flag: 'wx' })
      files.push({ name, path: target, root: path.join(staging, 'assets') })
    }
  } else {
    const visit = (folder, base, depth = 0) => {
      regularPath(folder, true)
      if (depth > 7) return
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (++inspected > 10000) throw Error('客户端目录过大，请选择导出文件。')
        if (entry.isSymbolicLink() || privateName.test(entry.name)) continue
        const file = path.join(folder, entry.name)
        if (entry.isDirectory()) visit(file, base, depth + 1)
        else if (entry.isFile() && allowedFile.test(entry.name)) files.push({ name: path.relative(base, file).replaceAll('\\', '/'), path: file, root: base })
      }
    }
    if (input) {
      regularPath(input)
      files.push({ name: path.basename(input), path: input, root: path.dirname(input) })
    } else for (const root of roots) visit(root, root)
  }
  for (const file of files.filter(f => /\.json$/i.test(f.name))) {
    try {
      const bytes = readFile(file.path, 100 * 1024 * 1024); budget(bytes.length)
      for (const conversation of conversations(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')))) docs.push({ conversation, root: file.root })
    } catch (error) { if (!(error instanceof SyntaxError)) warnings.push('部分本地数据未能读取。') }
  }
  if (!docs.length) warnings.push(input ? '未找到可识别的 ChatGPT 会话。' : roots.length ? '客户端缓存中没有可读取的完整会话，可选择导出文件。' : '未发现本机 ChatGPT 客户端数据，可选择导出文件。')
  const seen = new Set()
  for (const { conversation: c, root } of docs) {
    const key = String(c.id || c.conversation_id || digest(JSON.stringify(c))), sourceKey = `chatgpt:session:${key}`
    if (seen.has(sourceKey)) continue
    seen.add(sourceKey)
    const id = digest(sourceKey), snapshot = Buffer.from(JSON.stringify(c)), item = { id, kind: 'session', name: typeof c.title === 'string' && c.title ? c.title.slice(0, 300) : 'ChatGPT 对话', sourceKey, status: 'ready', warnings: [], fileIds: [], fingerprint: digest(snapshot) }
    items.push(item)
    try {
      const messages = parseConversation(c)
      if (!messages.length) throw Error('没有可导入的问答。')
      for (const message of messages) {
        for (const ref of message.refs) {
          const value = String(ref.ref || '').replace(/^file-service:\/\//, ''), name = ref.name || path.posix.basename(value)
          const matches = files.filter(f => f.root === root && (f.name === value || path.posix.basename(f.name) === name || path.posix.basename(f.name).startsWith(value + '-')))
          // A JSON file alone may reference sibling artifacts; never walk outside its directory.
          if (!matches.length && input && !/\.zip$/i.test(input) && name && path.basename(name) === name && !privateName.test(name)) {
            const candidate = path.join(root, name)
            if (fs.existsSync(candidate) && allowedFile.test(name)) matches.push({ name, path: candidate, root })
          }
          const fid = digest(id + ':' + value), existing = items.find(i => i.id === fid)
          if (!existing) {
            const artifact = { id: fid, kind: 'file', name: name || '文件', owner: id, sourceKey: `chatgpt:file:${key}:${value}`, status: 'unavailable', warnings: ['文件无本地副本。'], fingerprint: '', detail: '' }
            if (matches.length === 1) {
              const f = matches[0]
              try { const bytes = readFile(f.path); budget(bytes.length); Object.assign(artifact, { status: 'ready', warnings: [], fingerprint: digest(bytes), size: bytes.length, data: { sourcePath: f.path, allowedRoot: root }, detail: f.name }) } catch { artifact.warnings = ['文件无法读取或超过大小限制。'] }
            }
            items.push(artifact)
          }
          message.fileIds.push(fid); item.fileIds.push(fid)
        }
        delete message.refs
      }
      item.fileIds = [...new Set(item.fileIds)]
      if (typeof c.project_id === 'string' && c.project_id) {
        const projectId = digest('chatgpt:project:' + c.project_id)
        if (!items.some(i => i.id === projectId)) items.push({ id: projectId, kind: 'project', name: typeof c.project_name === 'string' ? c.project_name : c.project_id, sourceKey: 'chatgpt:project:' + c.project_id, fingerprint: digest(c.project_id), status: 'ready', warnings: [], data: {} })
        item.projectItemId = projectId
      }
      item.messageCount = item.activeCount = messages.length
      item.data = { messages, originalPath: '', account: '', fileIds: item.fileIds }
      item.preview = messages.slice(0, 4).map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n\n').slice(0, 6000)
      fs.writeFileSync(path.join(staging, id + '.jsonl'), snapshot, { flag: 'wx' })
    } catch (error) { item.status = 'unavailable'; item.warnings.push(error.message) }
    if (items.length > 5000) throw Error('可导入条目超过 5000 项，请分批导入。')
  }
  return { provider: 'chatgpt', root: input || roots.join('; '), items, warnings: [...new Set(warnings)], scannedAt: new Date().toISOString() }
}
module.exports = { scanChatGPT, clientRoots, parseConversation }
if (!require('node:worker_threads').isMainThread && (require.main === module || require.main?.filename === require.resolve('../chatgpt-reader.cjs'))) {
  const { parentPort, workerData } = require('node:worker_threads')
  scanChatGPT(workerData.root, workerData.staging).then(result => parentPort.postMessage({ result }), error => parentPort.postMessage({ error: error.message }))
}
