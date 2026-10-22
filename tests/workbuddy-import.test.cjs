'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { DatabaseSync } = require('node:sqlite')
const { StableStore } = require('../desktop/services/store.cjs')
const { scanWorkBuddy, parseSession, digest, regularPath } = require('../desktop/services/workbuddy-reader.cjs')
const { WorkBuddyImportService } = require('../desktop/services/workbuddy-import.cjs')
const { registerWorkBuddyIpc } = require('../desktop/services/workbuddy-ipc.cjs')

function fixture(t) {
  const parent = path.resolve(__dirname, '../.local/workbuddy-tests'); fs.mkdirSync(parent, { recursive: true })
  const root = fs.mkdtempSync(path.join(parent, 'case-')), source = path.join(root, 'source'), output = path.join(root, 'stable'), workspace = path.join(output, 'workspace'), project = path.join(root, 'original-project')
  for (const folder of [source, output, workspace, project, path.join(source, 'projects', 'project-a'), path.join(source, 'memory'), path.join(source, 'blobs'), path.join(source, 'artifact-index'), path.join(source, 'skills', 'example')]) fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(source, 'memory', 'account.md'), '# 记忆\n用户要求保留零值。')
  fs.writeFileSync(path.join(source, 'USER.md'), '# 偏好\n用中文。')
  fs.writeFileSync(path.join(source, 'auth.json'), 'DO_NOT_READ_SECRET')
  fs.writeFileSync(path.join(source, 'skills/example/SKILL.md'), '---\nname: example\ndescription: 示例技能\n---\n# 示例\n手动调用')
  fs.writeFileSync(path.join(source, 'skills/example/script.js'), 'throw Error("MUST_NOT_EXECUTE")')
  fs.writeFileSync(path.join(source, 'blobs/image.png'), 'image-fixture')
  fs.writeFileSync(path.join(project, 'report.csv'), 'name,value\nA,0')
  const rows = [
    { id: 'u1', type: 'message', role: 'user', timestamp: '2026-01-01T00:00:00Z', cwd: project, content: [{ type: 'input_text', text: '<identity_context>Do not import identity</identity_context><user_query>早期关键要求：必须保留零值</user_query>' }] },
    { id: 'a1', parentId: 'u1', type: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:01Z', content: [{ type: 'output_text', text: '回答一' }] },
    { id: 'u2', parentId: 'a1', type: 'message', role: 'user', timestamp: '2026-01-01T00:00:02Z', content: [{ type: 'input_text', text: '<user_query>查看图片</user_query>' }, { type: 'image_blob_ref', blob_path: 'blobs/image.png', original_filename: 'image.png' }] },
    { id: 'call1', parentId: 'u2', type: 'function_call', name: 'shell', arguments: 'MUST_NOT_EXECUTE' },
    { id: 'a2', parentId: 'call1', type: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:03Z', content: [{ type: 'output_text', text: '旧分支回答' }] },
    { id: 'a3', parentId: 'u2', type: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:04Z', content: [{ type: 'output_text', text: '当前分支回答' }] },
  ]
  const sessionPath = path.join(source, 'projects/project-a/session-one.jsonl')
  fs.writeFileSync(sessionPath, rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  fs.writeFileSync(path.join(source, 'artifact-index/session-one.json'), JSON.stringify({ artifacts: [{ name: 'report.csv', uri: pathToFileURL(path.join(project, 'report.csv')).href }, { name: 'cloud-file', uri: 'https://example.invalid/doc' }, { name: 'auth.json', uri: pathToFileURL(path.join(source, 'auth.json')).href }] }))
  const db = new DatabaseSync(path.join(source, 'workbuddy.db'))
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE sessions(id TEXT, title TEXT,custom_title TEXT,cwd TEXT,deleted_at INTEGER,user_id TEXT); CREATE TABLE workspaces(path TEXT)")
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('session-one', '自动标题', '用户标题', project, null, 'account')
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('missing-session', '未下载会话', null, project, null, 'account')
  db.prepare('INSERT INTO workspaces VALUES(?)').run(project)
  const store = new StableStore(output), service = new WorkBuddyImportService({ store, userData: output, workspace })
  t.after(() => { db.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { root, source, output, workspace, project, db, store, service, sessionPath, rows }
}

test('scan reads a consistent live WAL snapshot without modifying source; scopes and unsupported files are explicit', async t => {
  const f = fixture(t)
  const hashes = () => ['workbuddy.db', 'workbuddy.db-wal', 'workbuddy.db-shm', 'auth.json'].map(name => digest(fs.readFileSync(path.join(f.source, name))))
  const before = hashes(), preview = await f.service.scan(f.source)
  assert.deepEqual(hashes(), before)
  assert.equal(f.store.listConversations().length, 1, 'preview must not import')
  const session = preview.items.find(item => item.kind === 'session' && item.status === 'ready')
  assert.equal(session.name, '用户标题'); assert.equal(session.messageCount, 4); assert.equal(session.activeCount, 4)
  assert.equal(preview.items.find(item => item.name === '未下载会话').status, 'unavailable')
  assert.equal(preview.items.find(item => item.name === 'auth.json').status, 'unavailable')
  assert.equal(preview.items.find(item => item.name === 'cloud-file').status, 'unavailable')
  for (const kind of ['session', 'project', 'memory', 'instruction', 'skill', 'file']) assert(preview.items.some(item => item.kind === kind && item.status === 'ready'), kind)
  assert(!JSON.stringify(preview).includes('DO_NOT_READ_SECRET'))
  const detail = f.service.detail(preview.token, session.id)
  assert.match(detail.text, /早期关键要求/); assert(!detail.text.includes('Do not import identity'))
  assert(!JSON.stringify(preview).includes('早期关键要求'), 'list is metadata only')
  assert.throws(() => f.service.detail('stale', session.id), /失效/)
  await assert.rejects(f.service.importSelected(preview.token, ['invented']), /未知/)
})

test('selected assets import once, remain searchable, preserve branches and can seed a new isolated continuation', async t => {
  const f = fixture(t), preview = await f.service.scan(f.source)
  const selected = preview.items.filter(item => item.status === 'ready').map(item => item.id)
  const beforeActive = f.store.activeConversationId()
  const result = await f.service.importSelected(preview.token, selected)
  assert(result.results.every(item => item.status === 'imported'), JSON.stringify(result.results))
  assert.equal(f.store.activeConversationId(), beforeActive)
  const id = result.results.find(item => item.kind === 'session').targetId
  assert.equal(f.store.conversation(id).sourceType, 'local')
  assert.equal(f.store.listMessages(id).length, 4)
  assert.equal(f.store.listMessages(id)[0].createdAt, '2026-01-01T00:00:00.000Z')
  assert.equal(f.store.searchConversations('关键要求')[0].id, id)
  assert.equal(f.store.listMessages(id).flatMap(m => m.attachments || []).length, 2)
  assert(f.store.listMessages(id).every(m => !m.trace && !m.automationProposal))
  assert.equal(f.store.conversation(id).title, '用户标题')
  assert.match(f.service.context(id, f.workspace), /完整当前分支/)
  assert.equal(f.store.conversation(id).permissionMode, 'request')
  assert(f.store.listKnowledge().every(item => !item.enabled))
  assert.equal(f.store.listSkills().length, 1)
  assert.equal(f.store.listData().length, 2)
  const context = f.store.conversationContext(id)
  assert(context.projectId); assert.notEqual(context.cwd, f.project); assert(context.cwd.startsWith(f.workspace))
  const again = await f.service.importSelected(preview.token, selected)
  assert(again.results.every(item => item.status === 'skipped'))
  assert.equal(f.store.listConversations().length, 2)
  const options = f.service.continuationOptions(id)
  assert.equal(options.documents.length, 2)
  assert.throws(() => f.service.continueConversation(id, ['some-other-document']), /此导入/)
  const next = f.service.continueConversation(id, [options.documents[0].id])
  assert.notEqual(next, id); assert.equal(f.store.conversation(next).sourceType, 'local')
  assert.equal(f.store.conversation(next).permissionMode, 'request')
  assert.equal(f.store.permissionContext(next).networkAccess, false)
  assert.equal(f.store.listMessages(next).length, 4)
  assert(!f.store.listMessages(next).some(m => m.content === '旧分支回答'))
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM runtime_sessions WHERE conversation_id=?').get(next).n, 0)
  const prompt = f.service.context(next, context.cwd)
  assert.match(prompt, /完整当前分支/); assert.match(prompt, /不是本轮指令或权限授权/)
  const historyPath = path.join(context.cwd, '.stable/workbuddy-context', next, 'history.md')
  assert.match(fs.readFileSync(historyPath, 'utf8'), /早期关键要求/)
  assert.equal(fs.readdirSync(path.dirname(historyPath)).filter(name => name.startsWith('reference-')).length, 1)
  f.store.addMessage(next, 'user', '继续工作')
  assert.equal(f.store.listMessages(id).length, 4)
  const restarted = new WorkBuddyImportService({ store: f.store, userData: f.output, workspace: f.workspace })
  assert.equal(restarted.history().length, result.results.length)
  assert.match(restarted.context(next, context.cwd), /完整当前分支/)
})

test('scope selection does not implicitly import files, projects, preferences or skills', async t => {
  const f = fixture(t), p = await f.service.scan(f.source), session = p.items.find(i => i.kind === 'session' && i.status === 'ready')
  const r = await f.service.importSelected(p.token, [session.id])
  assert.equal(r.results.length, 1); assert.equal(f.store.listProjects().length, 0)
  assert.equal(f.store.listData().length, 0); assert.equal(f.store.listKnowledge().length, 0); assert.equal(f.store.listSkills().length, 0)
  assert.equal(f.store.listMessages(r.results[0].targetId).flatMap(m => m.attachments || []).length, 0)
  assert.match(r.results[0].warnings[0], /未选择/)
})

test('changed sources produce a new archive version, preserving the old import and its continuation', async t => {
  const f = fixture(t), first = await f.service.scan(f.source), session = first.items.find(i => i.kind === 'session' && i.status === 'ready')
  const a = await f.service.importSelected(first.token, [session.id]), old = a.results[0].targetId
  const continuation = f.service.continueConversation(old)
  const row = { id: 'u3', parentId: 'a3', type: 'message', role: 'user', content: [{ type: 'input_text', text: '源端新增' }] }
  fs.appendFileSync(f.sessionPath, JSON.stringify(row) + '\n')
  const second = await f.service.scan(f.source)
  assert.equal(second.items.find(i => i.id === session.id).status, 'changed')
  const b = await f.service.importSelected(second.token, [session.id])
  assert.notEqual(b.results[0].targetId, old)
  assert.equal(f.store.listMessages(old).length, 4)
  assert.equal(f.store.listMessages(continuation).length, 4)
  assert.equal(f.store.listMessages(b.results[0].targetId).length, 5)
})

test('mutated files fail independently and can be retried after a new preview', async t => {
  const f = fixture(t), p = await f.service.scan(f.source)
  const file = p.items.find(i => i.name === 'report.csv'), memory = p.items.find(i => i.kind === 'memory')
  fs.writeFileSync(path.join(f.project, 'report.csv'), 'changed')
  const result = await f.service.importSelected(p.token, [file.id, memory.id])
  assert.equal(result.results.find(i => i.id === file.id).status, 'failed')
  assert.equal(result.results.find(i => i.id === memory.id).status, 'imported')
  assert.equal(f.store.listData().length, 0)
  const next = await f.service.scan(f.source), retry = await f.service.importSelected(next.token, [file.id])
  assert.equal(retry.results[0].status, 'imported')
})

test('failed database writes roll back target rows and copied files', async t => {
  const f = fixture(t), p = await f.service.scan(f.source), memory = p.items.find(i => i.kind === 'memory')
  f.store.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON workbuddy_imports BEGIN SELECT RAISE(ABORT,'test failure'); END")
  const result = await f.service.importSelected(p.token, [memory.id])
  assert.equal(result.results[0].status, 'failed'); assert.equal(f.store.listKnowledge().length, 0)
  assert.deepEqual(fs.readdirSync(f.service.outputRoot), [])
})

test('session parser preserves raw text and handles partial tails, repeated IDs and legacy message blocks', () => {
  const row = (text) => JSON.stringify({ id: 'one', type: 'message', role: 'user', content: [{ type: 'input_text', text }] })
  const data = Buffer.from('\uFEFF' + row('first') + '\n' + row('latest') + '\n{"incomplete":')
  const parsed = parseSession(data)
  assert.equal(parsed.messages.length, 1); assert.equal(parsed.messages[0].content, 'latest'); assert.match(parsed.warnings[0], /不完整/)
  const legacy = parseSession(Buffer.from(JSON.stringify({ uuid: 'old', type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '| A | B |\n|---|---|\n| 0 | 1 |' }] } })))
  assert.match(legacy.messages[0].content, /\| 0 \| 1 \|/)
})

test('linked source directories are rejected without following them', t => {
  const f = fixture(t), link = path.join(f.root, 'link')
  try { fs.symlinkSync(f.source, link, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) { t.skip('Host does not allow fixture links: ' + error.code); return }
  assert.throws(() => regularPath(path.join(link, 'USER.md')), /链接|联接/)
  assert.throws(() => scanWorkBuddy(link, path.join(f.root, 'stage')), /链接|联接/)
})

test('explicit message attachments are resolved against their project, deduplicated with artifacts and remain selectable', async t => {
  const f = fixture(t)
  const row = { id: 'attachment', parentId: 'a3', type: 'message', role: 'user', content: [{ type: 'input_text', text: '<user_query>分析附件</user_query><attached_files><file path="report.csv" /></attached_files><local_files><file path="../source/auth.json" /></local_files>' }] }
  fs.appendFileSync(f.sessionPath, JSON.stringify(row) + '\n')
  const preview = await f.service.scan(f.source), session = preview.items.find(i => i.kind === 'session' && i.status === 'ready')
  const report = preview.items.filter(i => i.name === 'report.csv')
  assert.equal(report.length, 1); assert.equal(report[0].status, 'ready')
  assert(preview.items.filter(i => i.name === 'auth.json').every(i => i.status === 'unavailable'))
  const result = await f.service.importSelected(preview.token, [session.id, report[0].id])
  const id = result.results.find(i => i.kind === 'session').targetId
  const message = f.store.listMessages(id).find(m => m.content === '分析附件')
  assert.equal(message.attachments.length, 1); assert.equal(message.attachments[0].name, 'report.csv')
  assert.equal(f.store.listData().length, 1)
})

test('a new root after an older branch becomes the continuation instead of replaying the old branch', () => {
  const rows = [
    { id: 'u', type: 'message', role: 'user', content: 'old root' },
    { id: 'a', parentId: 'u', type: 'message', role: 'assistant', content: 'old answer' },
    { id: 'reset', parentId: null, type: 'message', role: 'user', content: 'new root' },
  ]
  const parsed = parseSession(Buffer.from(rows.map(row => JSON.stringify(row)).join('\n')))
  assert.equal(parsed.messages.length, 3)
  assert.deepEqual(parsed.messages.filter(m => m.active).map(m => m.content), ['new root'])
})

test('continuation offers only the newest imported reference version and refuses a modified history snapshot', async t => {
  const f = fixture(t), first = await f.service.scan(f.source)
  const session = first.items.find(i => i.kind === 'session' && i.status === 'ready'), memory = first.items.find(i => i.kind === 'memory')
  const imported = await f.service.importSelected(first.token, [session.id, memory.id]), id = imported.results.find(i => i.kind === 'session').targetId
  const oldDocumentId = f.service.continuationOptions(id).documents[0].id
  fs.writeFileSync(path.join(f.source, 'memory/account.md'), '最新记忆')
  const next = await f.service.scan(f.source)
  await f.service.importSelected(next.token, [memory.id])
  const options = f.service.continuationOptions(id)
  assert.equal(options.documents.length, 1); assert.notEqual(options.documents[0].id, oldDocumentId)
  assert.throws(() => f.service.continueConversation(id, [oldDocumentId]), /最新/)
  const row = f.store.db.prepare('SELECT path FROM workbuddy_imports WHERE target_id=?').get(id)
  fs.appendFileSync(path.join(row.path, 'messages.json'), ' ')
  assert.throws(() => f.service.continueConversation(id), /快照已变化/)
})

test('long imported conversations keep early context beyond the UI page in their continuation transcript', async t => {
  const f = fixture(t)
  const rows = Array.from({ length: 260 }, (_, i) => ({ id: 'm' + i, parentId: i ? 'm' + (i - 1) : null, type: 'message', role: i % 2 ? 'assistant' : 'user', content: '历史消息 ' + i }))
  fs.writeFileSync(f.sessionPath, rows.map(row => JSON.stringify(row)).join('\n'))
  const p = await f.service.scan(f.source), item = p.items.find(i => i.kind === 'session' && i.status === 'ready')
  const result = await f.service.importSelected(p.token, [item.id]), id = result.results[0].targetId
  assert.equal(f.store.messagePage(id).messages.length, 200)
  assert.equal(f.store.messagePage(id, f.store.messagePage(id).beforeCursor).messages.length, 60)
  const next = f.service.continueConversation(id)
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id=?').get(next).n, 260)
  f.service.context(next, f.workspace)
  const transcript = fs.readFileSync(path.join(f.workspace, '.stable/workbuddy-context', next, 'history.md'), 'utf8')
  assert.match(transcript, /历史消息 0\n/); assert.match(transcript, /历史消息 259/)
})

test('IPC accepts only native-selected sources and scan IDs; cancellation leaves state intact', async t => {
  const f = fixture(t), handlers = {}, dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }
  registerWorkBuddyIpc({ ipcMain: { handle: (name, handler) => handlers[name] = handler }, service: () => f.service, dialog, getWindow: () => null, agentState: id => ({ activeConversationId: id }) })
  const call = (name, payload) => handlers['stable:workbuddy:' + name](null, payload)
  assert.equal(await call('scan', { chooseDirectory: true, root: '/untrusted' }), null)
  assert.equal(call('state').preview, null)
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f.source] })
  const p = await call('scan', { chooseDirectory: true }), item = p.items.find(i => i.kind === 'session' && i.status === 'ready')
  const result = await call('import', { token: p.token, ids: [item.id], root: '/untrusted', content: 'injected' })
  const next = call('continue', { id: result.results[0].targetId, documentIds: [] })
  assert.notEqual(next.activeConversationId, result.results[0].targetId)
  assert(!f.store.listMessages(next.activeConversationId).some(m => m.content === 'injected'))
})

test('Q/A import excludes intermediate analysis and tool blocks without guessing by language', () => {
  const rows = [
    { id:'u',type:'message',role:'user',content:'Question' },
    { id:'progress',parentId:'u',type:'message',role:'assistant',content:'Let me examine the code' },
    { id:'tool',parentId:'progress',type:'function_call',name:'read',arguments:'not executed' },
    { id:'reason',parentId:'tool',type:'reasoning',content:'private thinking' },
    { id:'hidden',parentId:'reason',type:'message',role:'assistant',channel:'analysis',content:'analysis' },
    { id:'final',parentId:'hidden',type:'message',role:'assistant',content:[{type:'thinking',thinking:'secret'},{type:'output_text',text:'The answer is 42.'}] },
  ]
  const result=parseSession(Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')), {qaOnly:true})
  assert.deepEqual(result.messages.map(m=>m.content),['Question','The answer is 42.'])
})

test('existing archives are backed up before in-place native conversion and are not converted twice', async t => {
  const f=fixture(t), p=await f.service.scan(f.source), session=p.items.find(i=>i.kind==='session'&&i.status==='ready')
  const result=await f.service.importSelected(p.token,[session.id]), id=result.results[0].targetId
  const record=f.store.db.prepare('SELECT * FROM workbuddy_imports WHERE target_id=?').get(id)
  fs.writeFileSync(path.join(record.path,'original.jsonl'), fs.readFileSync(f.sessionPath))
  f.store.db.prepare("UPDATE conversations SET source_type='workbuddy',title='[WorkBuddy] 用户标题' WHERE id=?").run(id)
  f.store.db.prepare('INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?)').run('old-thought',id,'assistant','old analysis','2026-01-01')
  const upgraded=new WorkBuddyImportService({store:f.store,userData:f.output,workspace:f.workspace})
  assert.deepEqual(upgraded.migrationErrors,[])
  assert.equal(f.store.conversation(id).sourceType,'local')
  assert.equal(f.store.conversation(id).title,'用户标题')
  assert.equal(f.store.listMessages(id).length,4)
  const metadata=JSON.parse(f.store.db.prepare('SELECT metadata_json FROM workbuddy_imports WHERE target_id=?').get(id).metadata_json)
  const backup=JSON.parse(fs.readFileSync(path.join(metadata.backup,'record.json')))
  assert(backup.messages.some(m=>m.content==='old analysis'))
  assert.equal(digest(fs.readFileSync(path.join(metadata.backup,'original.jsonl'))),record.fingerprint)
  f.store.addMessage(id,'user','在原对话中继续')
  new WorkBuddyImportService({store:f.store,userData:f.output,workspace:f.workspace})
  assert.equal(f.store.listMessages(id).length,5)
  assert.equal(fs.readdirSync(path.dirname(metadata.backup)).length,1)
})

test('failed old archive conversion preserves database history and reports the failure', async t => {
  const f=fixture(t), p=await f.service.scan(f.source), session=p.items.find(i=>i.kind==='session'&&i.status==='ready')
  const result=await f.service.importSelected(p.token,[session.id]), id=result.results[0].targetId
  const record=f.store.db.prepare('SELECT * FROM workbuddy_imports WHERE target_id=?').get(id)
  fs.writeFileSync(path.join(record.path,'original.jsonl'),fs.readFileSync(f.sessionPath))
  f.store.db.prepare("UPDATE conversations SET source_type='workbuddy' WHERE id=?").run(id)
  const before=f.store.listMessages(id)
  f.store.db.exec("CREATE TRIGGER fail_native BEFORE UPDATE OF source_type ON conversations BEGIN SELECT RAISE(ABORT,'failure'); END")
  const service=new WorkBuddyImportService({store:f.store,userData:f.output,workspace:f.workspace})
  assert.equal(service.migrationErrors.length,1)
  assert.deepEqual(f.store.listMessages(id),before)
  assert.equal(f.store.conversation(id).sourceType,'workbuddy')
})

test('connector imports strip credentials and remain disabled until explicitly configured', async t => {
  const f=fixture(t)
  fs.writeFileSync(path.join(f.source,'mcp.json'),JSON.stringify({mcpServers:{sample:{type:'http',url:'https://user:secret@example.com/mcp?token=secret',headers:{Authorization:'SECRET'}}}}))
  const p=await f.service.scan(f.source), item=p.items.find(i=>i.kind==='connector')
  assert(item); assert(!f.service.detail(p.token,item.id).text.includes('secret'))
  const result=await f.service.importSelected(p.token,[item.id])
  assert.equal(result.results[0].status,'imported')
  const extensions=require('../desktop/services/claude-extensions.cjs')
  assert.deepEqual(extensions.loadClaudeExtensions(f.output,{runtime:true}).servers,{})
  const record=f.service.history().find(i=>i.kind==='connector')
  const configFile=extensions.configurationPath(f.output);fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify({version:1,enabled:false,mcpServers:{old:{type:'http',url:'https://example.org/mcp',tools:['old']}}}));
  f.service.activateConnector(record.id,{authorization:'Bearer fixture',tools:['search']})
  const config=extensions.loadClaudeExtensions(f.output,{runtime:true})
  assert.equal(Object.keys(config.servers).length,1)
  assert.equal(Object.values(config.servers)[0].url,'https://example.com/mcp')
  assert.throws(()=>f.service.activateConnector(record.id,{authorization:'bad\nheader'}),/无效/)
})

test('usage metadata does not hide the final WorkBuddy answer stored on the outer record',()=>{
 const rows=[{id:'u',type:'message',role:'user',content:'Question'},{id:'t',parentId:'u',type:'function_call',name:'read',message:{usage:{}}},{id:'a',parentId:'t',type:'message',role:'assistant',content:[{type:'output_text',text:'Final delivery'}],message:{usage:{output_tokens:12}}}]
 assert.deepEqual(parseSession(Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')),{qaOnly:true}).messages.map(m=>m.content),['Question','Final delivery'])
})
