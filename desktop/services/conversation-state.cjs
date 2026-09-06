 'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
function directoryIdentity(value) {
  const canonical = fs.realpathSync(path.resolve(value)), stat = fs.statSync(canonical)
  if (!stat.isDirectory()) throw new Error('项目路径不是文件夹。')
  return { path: canonical, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` }
}
function initializeConversationState(store, root) {
  if (store.getSetting('conversationStateV2')) return
  // VACUUM INTO creates a consistent snapshot including WAL before this migration.
  const backup = path.join(root, 'backups', `before-conversation-v2-${randomUUID()}.db`)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  store.db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
  const fingerprint=()=>{const hash=createHash('sha256');let count=0;for(const row of store.db.prepare('SELECT id,conversation_id,role,content,created_at FROM messages ORDER BY rowid').iterate()){hash.update(JSON.stringify(row));count++}return {count,digest:hash.digest('hex')}}
  const before=fingerprint(), mappings=[]
  const sessions=path.join(root,'codex','sessions'),mappingRoot=backup+'.sessions'
  if(fs.existsSync(sessions))for(const dir of fs.readdirSync(sessions,{withFileTypes:true})){if(!dir.isDirectory()||dir.isSymbolicLink())continue;const pointer=path.join(sessions,dir.name,'stable-thread.json');if(!fs.existsSync(pointer)||fs.lstatSync(pointer).isSymbolicLink())continue;fs.mkdirSync(mappingRoot,{recursive:true});fs.copyFileSync(pointer,path.join(mappingRoot,dir.name+'.json'),fs.constants.COPYFILE_EXCL);mappings.push(dir.name)}
  store.db.exec('BEGIN IMMEDIATE')
  try {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,root_path TEXT NOT NULL,identity TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversation_contexts (conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,project_id TEXT,cwd TEXT,identity TEXT,generation INTEGER NOT NULL DEFAULT 1,archived_at TEXT,deletion_state TEXT NOT NULL DEFAULT 'active');
      CREATE TABLE IF NOT EXISTS runtime_sessions (conversation_id TEXT PRIMARY KEY,thread_id TEXT,runtime_home TEXT,model_identity TEXT,version TEXT,state TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversation_view_state (conversation_id TEXT PRIMARY KEY,value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_operations (id TEXT PRIMARY KEY,conversation_id TEXT,kind TEXT NOT NULL,state TEXT NOT NULL,detail_json TEXT NOT NULL,updated_at TEXT NOT NULL);
    `)
    if (!store.db.prepare('PRAGMA table_info(messages)').all().some(c => c.name === 'seq')) {
      store.db.exec(`ALTER TABLE messages ADD COLUMN seq INTEGER;
        WITH ordered AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY created_at,rowid) AS n FROM messages)
        UPDATE messages SET seq=(SELECT n FROM ordered WHERE ordered.id=messages.id);`)
    }
    store.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS message_sequence ON messages(conversation_id,seq);
      CREATE TRIGGER IF NOT EXISTS message_sequence_insert AFTER INSERT ON messages WHEN NEW.seq IS NULL BEGIN
        UPDATE messages SET seq=(SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE conversation_id=NEW.conversation_id AND id<>NEW.id) WHERE id=NEW.id;
      END;
      CREATE INDEX IF NOT EXISTS project_conversations ON conversation_contexts(project_id,archived_at);`)
    const after=fingerprint();if(before.count!==after.count||before.digest!==after.digest)throw Error('迁移前后消息不一致，已停止。')
    fs.writeFileSync(backup+'.audit.json',JSON.stringify({before,after,mappingCount:mappings.length,stableIds:true},null,2))
    store.setSetting('conversationStateV2', { version: 2, backup, audit:backup+'.audit.json' })
    store.db.exec('COMMIT')
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
}
function initializeProjectFolders(store) {
  // Additive migration: retain every existing project, context and message.
  store.db.exec(`CREATE TABLE IF NOT EXISTS project_folders (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,root_path TEXT NOT NULL,identity TEXT NOT NULL,
    PRIMARY KEY(project_id,position));
    INSERT OR IGNORE INTO project_folders SELECT id,0,root_path,identity FROM projects;`)
}
function initializeMessageSearch(store) {
  if (store.getSetting('messageSearchV1')) return
  store.db.exec('BEGIN IMMEDIATE')
  try {
    store.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(content,content='messages',content_rowid='rowid',tokenize='trigram');
      CREATE TRIGGER IF NOT EXISTS message_search_insert AFTER INSERT ON messages BEGIN INSERT INTO message_search(rowid,content) VALUES(new.rowid,new.content); END;
      CREATE TRIGGER IF NOT EXISTS message_search_delete AFTER DELETE ON messages BEGIN INSERT INTO message_search(message_search,rowid,content) VALUES('delete',old.rowid,old.content); END;
      CREATE TRIGGER IF NOT EXISTS message_search_update AFTER UPDATE OF content ON messages BEGIN INSERT INTO message_search(message_search,rowid,content) VALUES('delete',old.rowid,old.content); INSERT INTO message_search(rowid,content) VALUES(new.rowid,new.content); END;
      INSERT INTO message_search(message_search) VALUES('rebuild');`)
    store.setSetting('messageSearchV1', { version: 1, tokenizer: 'trigram' })
    store.db.exec('COMMIT')
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
}
const mapMessage = row => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at, seq: row.seq,
  ...(row.trace_json ? { trace: JSON.parse(row.trace_json) } : {}), ...(row.attachments_json ? { attachments: JSON.parse(row.attachments_json) } : {}), ...(row.automation_json ? { automationProposal: JSON.parse(row.automation_json) } : {}) })
const methods = {
  relocateProject(id, rootPath) {
    const resolved=directoryIdentity(rootPath),project=this.listProjects().find(p=>p.id===id)
    if(!project)throw Error('找不到项目。')
    this.db.exec('BEGIN IMMEDIATE')
    try { this.db.prepare('UPDATE projects SET root_path=?,identity=? WHERE id=?').run(resolved.path,resolved.identity,id);this.db.prepare('UPDATE project_folders SET root_path=?,identity=? WHERE project_id=? AND position=0').run(resolved.path,resolved.identity,id);this.db.prepare('UPDATE conversation_contexts SET cwd=?,identity=?,generation=generation+1 WHERE project_id=?').run(resolved.path,resolved.identity,id);this.db.exec('COMMIT') } catch(error){this.db.exec('ROLLBACK');throw error}
    for(const row of this.db.prepare('SELECT conversation_id FROM conversation_contexts WHERE project_id=?').all(id))this.revokeConversationGrants(row.conversation_id)
  },
  setProjectPinned(id,pinned) {
    if(!this.db.prepare('SELECT id FROM projects WHERE id=?').get(id))throw Error('找不到项目。')
    this.setSetting('project-pinned:'+id,Boolean(pinned))
  },
  removeProject(id) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('UPDATE conversation_contexts SET project_id=NULL WHERE project_id=?').run(id)
      this.db.prepare('DELETE FROM project_folders WHERE project_id=?').run(id)
      this.db.prepare('DELETE FROM projects WHERE id=?').run(id)
      this.db.prepare('DELETE FROM settings WHERE key=?').run('project-pinned:'+id)
      this.db.exec('COMMIT')
    }catch(error){this.db.exec('ROLLBACK');throw error}
  },
  permissionContext(id) {
    const key = `permission-boundary:${id}`
    let value = this.getSetting(key)
    if (!value) { const row = this.db.prepare('SELECT permission_mode FROM conversations WHERE id=?').get(id); value = { networkAccess: row?.permission_mode === 'full', sandbox: 'workspace-write', policyVersion: 3 }; this.setSetting(key,value) }
    return value
  },
  setConversationNetwork(id, enabled) { this.setSetting(`permission-boundary:${id}`, { ...this.permissionContext(id), networkAccess: Boolean(enabled) }); this.revokeConversationGrants(id) },
  messagePage(id, before, limit = 200) {
    const size = Math.min(200, Math.max(1, Number(limit) || 200))
    const cursor = before === undefined || before === null ? Number.MAX_SAFE_INTEGER : Number(before)
    if (!Number.isSafeInteger(cursor) || cursor < 1) throw new Error('无效的消息游标。')
    const rows = this.db.prepare('SELECT * FROM messages WHERE conversation_id=? AND seq<? ORDER BY seq DESC LIMIT ?').all(id, cursor, size + 1)
    const hasMore = rows.length > size, page = rows.slice(0, size).reverse()
    return { messages: page.map(mapMessage), beforeCursor: hasMore ? page[0].seq : null }
  },
  recentContext(id, budget = 24000) {
    const rows = this.messagePage(id, undefined, 200).messages.reverse(), result = []; let chars = 0
    for (const row of rows) { if (result.length && chars + row.content.length > budget * 4) break; result.push(row); chars += row.content.length }
    return result.reverse()
  },
  listProjects() { return this.db.prepare('SELECT id,name,root_path AS rootPath,identity,created_at AS createdAt FROM projects ORDER BY created_at DESC,id').all().map(project=>({...project,name:String(project.name||'').trim()||path.basename(project.rootPath)||project.rootPath,pinned:Boolean(this.getSetting('project-pinned:'+project.id)),folders:this.projectFolders(project.id)})).sort((a,b)=>Number(b.pinned)-Number(a.pinned)) },
  projectFolders(id) { return this.db.prepare('SELECT root_path AS path,identity FROM project_folders WHERE project_id=? ORDER BY position').all(id) },
  createProject(name, folders) {
    const title=String(name || '').trim()
    if(!title || title.length>80)throw Error('请填写不超过 80 字的项目名称。')
    if(!Array.isArray(folders)||!folders.length||folders.length>20||folders.some(folder=>typeof folder!=='string'||!path.isAbsolute(folder)))throw Error('请选择 1 至 20 个源文件夹。')
    const resolved=[...new Map(folders.map(folder=>{const value=directoryIdentity(folder);return [process.platform==='win32'?value.path.toLowerCase():value.path,value]})).values()]
    const id=randomUUID()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(id,title,resolved[0].path,resolved[0].identity,new Date().toISOString())
      const insert=this.db.prepare('INSERT INTO project_folders VALUES(?,?,?,?)')
      resolved.forEach((folder,index)=>insert.run(id,index,folder.path,folder.identity))
      this.db.exec('COMMIT');return id
    } catch(error){this.db.exec('ROLLBACK');throw error}
  },
  registerProject(name, rootPath) {
    const resolved = directoryIdentity(rootPath), id = randomUUID()
    const existing = this.db.prepare('SELECT id FROM projects WHERE root_path=? AND identity=?').get(resolved.path, resolved.identity)
    if (existing) return existing.id
    return this.createProject(String(name || path.basename(resolved.path)).trim().slice(0,80),[resolved.path])
  },
  bindProject(id, projectId, fallback) {
    if (!this.db.prepare('SELECT id FROM conversations WHERE id=?').get(id)) throw new Error('找不到对话。')
    const project = projectId ? this.db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) : null
    if (projectId && !project) throw new Error('找不到项目。')
    const resolved = directoryIdentity(project?.root_path || fallback)
    if (project && project.identity !== resolved.identity) throw new Error('项目目录身份已变化，请重新定位项目。')
    this.db.prepare(`INSERT INTO conversation_contexts(conversation_id,project_id,cwd,identity) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET project_id=excluded.project_id,cwd=excluded.cwd,identity=excluded.identity`).run(id, projectId || null, resolved.path, resolved.identity)
    return this.conversationContext(id)
  },
  conversationContext(id) { return this.db.prepare('SELECT project_id AS projectId,cwd,identity,generation,archived_at AS archivedAt,deletion_state AS deletionState FROM conversation_contexts WHERE conversation_id=?').get(id) || { projectId: null, generation: 1, archivedAt: null, deletionState: 'active' } },
  resolveRunContext(id, fallback) {
    let context = this.conversationContext(id)
    if (!context.cwd) context = this.bindProject(id, null, fallback)
    if (context.archivedAt || context.deletionState !== 'active') throw new Error('请先恢复此对话，再开始新任务。')
    let resolved
    try { resolved = directoryIdentity(context.cwd) } catch { throw new Error('项目目录不可用，历史仍可查看；请重新定位后发送。') }
    if (resolved.identity !== context.identity) throw new Error('项目目录身份已变化，请重新绑定后发送。')
    const folders=context.projectId?this.projectFolders(context.projectId):[resolved]
    for(const folder of folders){
      let current
      try { current=directoryIdentity(folder.path) } catch { throw Error('项目源文件夹不可用：'+folder.path) }
      if(current.identity!==folder.identity)throw Error('项目源文件夹身份已变化：'+folder.path)
    }
    return Object.freeze({ conversationId: id, ...context, cwd: resolved.path, writableRoots:Object.freeze(folders.map(folder=>folder.path)) })
  },
  archiveConversation(id, archived) {
    this.db.prepare('INSERT OR IGNORE INTO conversation_contexts(conversation_id) VALUES(?)').run(id)
    this.db.prepare('UPDATE conversation_contexts SET archived_at=? WHERE conversation_id=?').run(archived ? new Date().toISOString() : null, id)
  },
  viewState(id, value) {
    if (value !== undefined) this.db.prepare('INSERT INTO conversation_view_state VALUES(?,?) ON CONFLICT(conversation_id) DO UPDATE SET value_json=excluded.value_json').run(id, JSON.stringify(value))
    const row = this.db.prepare('SELECT value_json FROM conversation_view_state WHERE conversation_id=?').get(id); return row ? JSON.parse(row.value_json) : {}
  },
  saveRuntimeSession(id, value) { this.db.prepare('INSERT INTO runtime_sessions VALUES(?,?,?,?,?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET thread_id=excluded.thread_id,runtime_home=excluded.runtime_home,model_identity=excluded.model_identity,version=excluded.version,state=excluded.state,updated_at=excluded.updated_at').run(id, value.threadId || null, value.home || null, value.model || null, value.version || null, value.state || 'ready', new Date().toISOString()) },
  syncOperation(id, kind, state, detail, operationId = randomUUID()) { this.db.prepare('INSERT INTO sync_operations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,detail_json=excluded.detail_json,updated_at=excluded.updated_at').run(operationId, id, kind, state, JSON.stringify(detail), new Date().toISOString()); return operationId },
}
module.exports = { initializeProjectFolders, initializeMessageSearch, initializeConversationState, methods, directoryIdentity }
