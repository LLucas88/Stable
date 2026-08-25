'use strict'

const { DatabaseSync } = require('node:sqlite')
const { mkdirSync } = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { normalizeWorkflowGraph } = require('./workflow-graph.cjs')

const DEFAULT_IDENTITY = 'Stable 是你的本地智能工作助理，擅长数据分析、知识管理、Skills 调用和自动化工作流。它优先保护本地数据，执行涉及文件修改、脚本运行或外部请求的操作前会明确说明，并保留可追溯的运行记录。'

function searchTerms(query) {
  const terms = new Set()
  for (const token of String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (/\p{Script=Han}/u.test(token) && token.length > 4) {
      for (let index = 0; index < token.length - 1; index += 1) terms.add(token.slice(index, index + 2))
    } else if (token.length > 1) terms.add(token)
  }
  return [...terms].slice(0, 48)
}

function occurrences(content, term) {
  let count = 0; let offset = 0
  while ((offset = content.indexOf(term, offset)) >= 0 && count < 20) { count += 1; offset += term.length }
  return count
}

function knowledgeExcerpt(content, terms) {
  const text = String(content)
  const lower = text.toLowerCase()
  const positions = terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0)
  const center = positions.length ? Math.min(...positions) : 0
  const start = Math.max(0, center - 1_500)
  return text.slice(start, start + 20_000)
}

class StableStore {
  constructor(root) {
    mkdirSync(root, { recursive: true })
    this.db = new DatabaseSync(path.join(root, 'stable.db'))
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS data_items (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, path TEXT NOT NULL,
        size INTEGER NOT NULL, text_content TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, path TEXT NOT NULL,
        content TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, steps_json TEXT NOT NULL,
        last_status TEXT, last_result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, capability TEXT NOT NULL DEFAULT 'auto',
        collaboration INTEGER NOT NULL DEFAULT 0, permission_mode TEXT NOT NULL DEFAULT 'request', data_ids_json TEXT NOT NULL DEFAULT '[]',
        source_type TEXT NOT NULL DEFAULT 'local', source_device_id TEXT NOT NULL DEFAULT '', source_device_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL,
        trace_json TEXT, attachments_json TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_logs (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT, status TEXT NOT NULL,
        input TEXT NOT NULL, output TEXT, error TEXT, started_at TEXT NOT NULL, ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS data_library (
        id TEXT PRIMARY KEY, category TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
        description TEXT NOT NULL, path TEXT NOT NULL, extension TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
        last_status TEXT NOT NULL DEFAULT 'idle', last_output TEXT NOT NULL DEFAULT '', last_run_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL,
        content TEXT NOT NULL, summary TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, mode TEXT NOT NULL,
        components_json TEXT NOT NULL, html_content TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS team_devices (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
        capabilities_json TEXT NOT NULL, last_seen TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_work_tasks (
        id TEXT PRIMARY KEY, direction TEXT NOT NULL, source_device_id TEXT NOT NULL,
        target_device_id TEXT NOT NULL, source_conversation_id TEXT, title TEXT NOT NULL,
        instruction TEXT NOT NULL, context_json TEXT NOT NULL, status TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_work_events (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS team_conversation_offers (
        id TEXT PRIMARY KEY, source_device_id TEXT NOT NULL, source_device_name TEXT NOT NULL,
        title TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `)
    const conversationColumns = this.db.prepare('PRAGMA table_info(conversations)').all()
    if (!conversationColumns.some((column) => column.name === 'collaboration')) this.db.exec('ALTER TABLE conversations ADD COLUMN collaboration INTEGER NOT NULL DEFAULT 0')
    if (!conversationColumns.some((column) => column.name === 'permission_mode')) this.db.exec("ALTER TABLE conversations ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'request'")
    if (!conversationColumns.some((column) => column.name === 'source_type')) this.db.exec("ALTER TABLE conversations ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local'")
    if (!conversationColumns.some((column) => column.name === 'source_device_id')) this.db.exec("ALTER TABLE conversations ADD COLUMN source_device_id TEXT NOT NULL DEFAULT ''")
    if (!conversationColumns.some((column) => column.name === 'source_device_name')) this.db.exec("ALTER TABLE conversations ADD COLUMN source_device_name TEXT NOT NULL DEFAULT ''")
    const messageColumns = this.db.prepare('PRAGMA table_info(messages)').all()
    if (!messageColumns.some((column) => column.name === 'trace_json')) this.db.exec('ALTER TABLE messages ADD COLUMN trace_json TEXT')
    if (!messageColumns.some((column) => column.name === 'conversation_id')) this.db.exec('ALTER TABLE messages ADD COLUMN conversation_id TEXT')
    if (!messageColumns.some((column) => column.name === 'attachments_json')) this.db.exec('ALTER TABLE messages ADD COLUMN attachments_json TEXT')
    this.initializeConversations()
    if (this.getSetting('identity') === undefined) this.setSetting('identity', DEFAULT_IDENTITY)
    if (this.getSetting('theme') === undefined) this.setSetting('theme', 'dark')
    if (this.getSetting('model') === undefined) {
      this.setSetting('model', {
        providerId: 'deepseek', displayName: 'DeepSeek', baseURL: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash', hasApiKey: false,
      })
    }
  }

  getSetting(key) {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key)
    return row ? JSON.parse(row.value_json) : undefined
  }

  setSetting(key, value) {
    this.db.prepare('INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key, JSON.stringify(value))
  }

  initializeConversations() {
    let first = this.db.prepare('SELECT id FROM conversations ORDER BY created_at ASC LIMIT 1').get()
    if (!first) {
      const id = randomUUID(); const now = new Date().toISOString()
      const hasMessages = Boolean(this.db.prepare('SELECT id FROM messages LIMIT 1').get())
      this.db.prepare('INSERT INTO conversations(id,title,capability,data_ids_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
        .run(id, hasMessages ? '历史对话 1' : '新对话', 'auto', '[]', now, now)
      first = { id }
    }
    this.db.prepare("UPDATE messages SET conversation_id=? WHERE conversation_id IS NULL OR conversation_id=''").run(first.id)
    const activeId = this.getSetting('activeConversationId')
    if (!activeId || !this.db.prepare('SELECT id FROM conversations WHERE id=?').get(activeId)) this.setSetting('activeConversationId', first.id)
  }

  listConversations() {
    return this.db.prepare(`SELECT c.*,COUNT(m.id) AS message_count
      FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id
      GROUP BY c.id ORDER BY c.updated_at DESC`).all().map((row) => ({
      id: row.id, title: row.title, capability: row.capability || 'auto',
      permissionMode: ['request', 'auto', 'full'].includes(row.permission_mode) ? row.permission_mode : 'request',
      dataIds: JSON.parse(row.data_ids_json || '[]'), messageCount: Number(row.message_count || 0),
      sourceType: row.source_type === 'team' ? 'team' : 'local',
      ...(row.source_device_id ? { sourceDeviceId: row.source_device_id } : {}),
      ...(row.source_device_name ? { sourceDeviceName: row.source_device_name } : {}),
      createdAt: row.created_at, updatedAt: row.updated_at,
    }))
  }

  conversation(id) { return this.listConversations().find((item) => item.id === id) }
  activeConversationId() { return this.getSetting('activeConversationId') }

  createConversation() {
    const id = randomUUID(); const now = new Date().toISOString()
    this.db.prepare('INSERT INTO conversations(id,title,capability,data_ids_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(id, '新对话', 'auto', '[]', now, now)
    this.setSetting('activeConversationId', id)
    return id
  }

  selectConversation(id) {
    if (!this.db.prepare('SELECT id FROM conversations WHERE id=?').get(id)) throw new Error('找不到这个对话。')
    this.setSetting('activeConversationId', id)
    return id
  }

  renameConversation(id, title) {
    this.db.prepare('UPDATE conversations SET title=?,updated_at=? WHERE id=?').run(title, new Date().toISOString(), id)
  }

  updateConversationContext(id, capability, dataIds) {
    this.db.prepare('UPDATE conversations SET capability=?,collaboration=?,data_ids_json=?,updated_at=? WHERE id=?')
      .run(capability, 0, JSON.stringify(dataIds), new Date().toISOString(), id)
  }

  updateConversationPermission(id, permissionMode) {
    this.db.prepare('UPDATE conversations SET permission_mode=?,updated_at=? WHERE id=?')
      .run(permissionMode, new Date().toISOString(), id)
  }

  removeConversation(id) {
    if (!this.db.prepare('SELECT id FROM conversations WHERE id=?').get(id)) return this.activeConversationId()
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM messages WHERE conversation_id=?').run(id)
      this.db.prepare('DELETE FROM conversations WHERE id=?').run(id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    let next = this.db.prepare('SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 1').get()?.id
    if (!next) next = this.createConversation()
    this.setSetting('activeConversationId', next)
    return next
  }

  listData() {
    return this.db.prepare('SELECT id,name,type,path,size,enabled,created_at FROM data_items ORDER BY created_at DESC').all().map((row) => ({ ...row, enabled: Boolean(row.enabled), createdAt: row.created_at }))
  }

  upsertData(item) {
    const now = new Date().toISOString()
    const id = item.id || randomUUID()
    this.db.prepare(`INSERT INTO data_items(id,name,type,path,size,text_content,enabled,created_at,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,path=excluded.path,size=excluded.size,text_content=excluded.text_content,updated_at=excluded.updated_at`)
      .run(id, item.name, item.type, item.path, item.size, item.text, now, now)
    return id
  }

  setDataEnabled(id, enabled) { this.db.prepare('UPDATE data_items SET enabled=?,updated_at=? WHERE id=?').run(enabled ? 1 : 0, new Date().toISOString(), id) }
  removeData(id) { this.db.prepare('DELETE FROM data_items WHERE id=?').run(id) }

  listLibrary(category) {
    const rows = category
      ? this.db.prepare('SELECT * FROM data_library WHERE category=? ORDER BY updated_at DESC').all(category)
      : this.db.prepare('SELECT * FROM data_library ORDER BY updated_at DESC').all()
    return rows.map((row) => ({
      id: row.id, category: row.category, kind: row.kind, name: row.name,
      description: row.description, path: row.path, extension: row.extension, content: row.content,
      lastStatus: row.last_status || 'idle', lastOutput: row.last_output || '',
      ...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
      createdAt: row.created_at, updatedAt: row.updated_at,
    }))
  }

  addLibraryItem(item) {
    const now = new Date().toISOString(); const id = item.id || randomUUID()
    this.db.prepare(`INSERT INTO data_library(
      id,category,kind,name,description,path,extension,content,last_status,last_output,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, item.category, item.kind, item.name, item.description || '', item.path, item.extension,
      item.content || '', 'idle', '', now, now,
    )
    return id
  }

  libraryItem(id) { return this.listLibrary().find((item) => item.id === id) }

  renameLibraryItem(id, name) {
    this.db.prepare('UPDATE data_library SET name=?,updated_at=? WHERE id=?').run(name, new Date().toISOString(), id)
    return this.libraryItem(id)
  }

  updateLibraryPath(id, nextPath) {
    this.db.prepare('UPDATE data_library SET path=?,updated_at=? WHERE id=?').run(nextPath, new Date().toISOString(), id)
    return this.libraryItem(id)
  }

  removeLibraryItem(id) {
    const item = this.libraryItem(id)
    if (item) this.db.prepare('DELETE FROM data_library WHERE id=?').run(id)
    return item
  }

  saveMarkdown(id, content, description = '') {
    this.db.prepare('UPDATE data_library SET content=?,description=?,updated_at=? WHERE id=?').run(content, description, new Date().toISOString(), id)
  }

  setLibraryRunResult(id, status, output) {
    this.db.prepare('UPDATE data_library SET last_status=?,last_output=?,last_run_at=?,updated_at=? WHERE id=?')
      .run(status, String(output || '').slice(-200_000), new Date().toISOString(), new Date().toISOString(), id)
  }

  retrieveData(query, limit = 5) {
    const terms = String(query).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1)
    return this.db.prepare('SELECT name,text_content FROM data_items WHERE enabled=1').all()
      .map((row) => ({ ...row, score: terms.reduce((score, term) => score + (row.text_content.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
  }

  enabledData(limit = 5) {
    return this.db.prepare('SELECT name,text_content FROM data_items WHERE enabled=1 ORDER BY updated_at DESC LIMIT ?').all(limit)
  }

  dataByIds(ids) {
    const wanted = new Set(Array.isArray(ids) ? ids : [])
    if (!wanted.size) return []
    return this.db.prepare('SELECT id,name,text_content FROM data_items WHERE enabled=1').all().filter((row) => wanted.has(row.id))
  }

  listKnowledge() {
    return this.db.prepare('SELECT id,name,path,size,summary,enabled,created_at,updated_at FROM knowledge_items ORDER BY updated_at DESC').all().map((row) => ({
      id: row.id, name: row.name, path: row.path, size: row.size, summary: row.summary,
      enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at,
    }))
  }

  addKnowledge(item) {
    const now = new Date().toISOString(); const id = item.id || randomUUID()
    this.db.prepare(`INSERT INTO knowledge_items(id,name,path,size,content,summary,enabled,created_at,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?)`).run(id, item.name, item.path, item.size, item.content, item.summary || 'Markdown 文档', now, now)
    return id
  }

  knowledgeItem(id) {
    const row = this.db.prepare('SELECT * FROM knowledge_items WHERE id=?').get(id)
    return row ? {
      id: row.id, name: row.name, path: row.path, size: row.size, content: row.content, summary: row.summary,
      enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at,
    } : undefined
  }

  setKnowledgeEnabled(id, enabled) { this.db.prepare('UPDATE knowledge_items SET enabled=?,updated_at=? WHERE id=?').run(enabled ? 1 : 0, new Date().toISOString(), id) }
  removeKnowledge(id) { const item = this.knowledgeItem(id); if (item) this.db.prepare('DELETE FROM knowledge_items WHERE id=?').run(id); return item }

  retrieveKnowledge(query, limit = 4) {
    const terms = searchTerms(query)
    return this.db.prepare('SELECT name,content FROM knowledge_items WHERE enabled=1').all()
      .map((row) => ({ ...row, score: terms.reduce((score, term) => score + occurrences(row.content.toLowerCase(), term), 0) }))
      .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
      .map((row) => ({ name: row.name, excerpt: knowledgeExcerpt(row.content, terms) }))
  }

  enabledKnowledge(limit = 2) {
    return this.db.prepare('SELECT name,content FROM knowledge_items WHERE enabled=1 ORDER BY updated_at DESC LIMIT ?').all(limit)
      .map((row) => ({ name: row.name, excerpt: String(row.content).slice(0, 20_000) }))
  }

  listReports() {
    return this.db.prepare('SELECT * FROM reports ORDER BY updated_at DESC').all().map((row) => ({
      id: row.id, name: row.name, path: row.path, mode: row.mode,
      components: JSON.parse(row.components_json || '[]'), html: row.html_content,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }))
  }

  reportItem(id) { return this.listReports().find((item) => item.id === id) }

  saveReport(report) {
    const now = new Date().toISOString()
    const id = report.id || randomUUID()
    const existing = this.db.prepare('SELECT created_at FROM reports WHERE id=?').get(id)
    this.db.prepare(`INSERT INTO reports(id,name,path,mode,components_json,html_content,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,path=excluded.path,mode=excluded.mode,components_json=excluded.components_json,
      html_content=excluded.html_content,updated_at=excluded.updated_at`).run(
      id, report.name, report.path, report.mode, JSON.stringify(report.components || []), report.html,
      existing?.created_at || now, now,
    )
    return id
  }

  removeReport(id) { const item = this.reportItem(id); if (item) this.db.prepare('DELETE FROM reports WHERE id=?').run(id); return item }

  teamProfile() { return this.getSetting('teamProfile') }
  saveTeamProfile(profile) { this.setSetting('teamProfile', profile) }
  clearTeamProfile() {
    this.db.prepare('DELETE FROM settings WHERE key=?').run('teamProfile')
    this.db.prepare('DELETE FROM team_devices').run()
    this.db.prepare('DELETE FROM team_conversation_offers').run()
  }

  saveTeamConversationOffer(offer) {
    this.db.prepare(`INSERT INTO team_conversation_offers(id,source_device_id,source_device_name,title,snapshot_json,created_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).run(
      offer.id, offer.sourceDeviceId, offer.sourceDeviceName, offer.title,
      JSON.stringify({ messages: offer.messages }), offer.createdAt || new Date().toISOString(),
    )
    return this.teamConversationOffer(offer.id)
  }

  listTeamConversationOffers() {
    return this.db.prepare('SELECT * FROM team_conversation_offers ORDER BY created_at DESC').all().map((row) => {
      const snapshot = JSON.parse(row.snapshot_json || '{}')
      return {
        id: row.id, sourceDeviceId: row.source_device_id, sourceDeviceName: row.source_device_name,
        title: row.title, messageCount: Array.isArray(snapshot.messages) ? snapshot.messages.length : 0,
        createdAt: row.created_at,
      }
    })
  }

  teamConversationOffer(id) {
    const row = this.db.prepare('SELECT * FROM team_conversation_offers WHERE id=?').get(id)
    if (!row) return undefined
    const snapshot = JSON.parse(row.snapshot_json || '{}')
    return {
      id: row.id, sourceDeviceId: row.source_device_id, sourceDeviceName: row.source_device_name,
      title: row.title, messages: Array.isArray(snapshot.messages) ? snapshot.messages : [], createdAt: row.created_at,
    }
  }

  removeTeamConversationOffer(id) { this.db.prepare('DELETE FROM team_conversation_offers WHERE id=?').run(id) }

  importTeamConversation(offer) {
    const id = randomUUID(); const now = new Date().toISOString()
    this.db.exec('BEGIN')
    try {
      this.db.prepare(`INSERT INTO conversations(
        id,title,capability,permission_mode,data_ids_json,source_type,source_device_id,source_device_name,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        id, offer.title || 'Team 对话', 'auto', 'request', '[]', 'team',
        offer.sourceDeviceId || '', offer.sourceDeviceName || '', offer.createdAt || now, now,
      )
      const insert = this.db.prepare('INSERT INTO messages(id,conversation_id,role,content,trace_json,attachments_json,created_at) VALUES(?,?,?,?,?,?,?)')
      for (const message of offer.messages || []) insert.run(
        randomUUID(), id, message.role, message.content, null,
        message.attachments?.length ? JSON.stringify(message.attachments) : null, message.createdAt || now,
      )
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.conversation(id)
  }

  listTeamDevices() {
    return this.db.prepare('SELECT * FROM team_devices ORDER BY status DESC,name ASC').all().map((row) => ({
      id: row.id, name: row.name, role: row.role, status: row.status,
      capabilities: JSON.parse(row.capabilities_json || '{}'), lastSeen: row.last_seen,
    }))
  }

  replaceTeamDevices(devices) {
    const onlineIds = new Set(devices.map((item) => String(item.id)))
    const now = new Date().toISOString()
    this.db.exec('BEGIN')
    try {
      for (const item of devices) {
        this.db.prepare(`INSERT INTO team_devices(id,name,role,status,capabilities_json,last_seen) VALUES(?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,capabilities_json=excluded.capabilities_json,last_seen=excluded.last_seen`)
          .run(String(item.id), String(item.name || '未命名设备'), String(item.role || 'member'), 'online', JSON.stringify(item.capabilities || {}), String(item.lastSeen || now))
      }
      for (const row of this.db.prepare('SELECT id FROM team_devices').all()) {
        if (!onlineIds.has(row.id)) this.db.prepare("UPDATE team_devices SET status='offline',last_seen=? WHERE id=?").run(now, row.id)
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  listTeamTasks(limit = 100) {
    return this.db.prepare('SELECT * FROM ai_work_tasks ORDER BY created_at DESC LIMIT ?').all(limit).map((row) => ({
      id: row.id, direction: row.direction, sourceDeviceId: row.source_device_id, targetDeviceId: row.target_device_id,
      sourceConversationId: row.source_conversation_id || undefined, title: row.title, instruction: row.instruction,
      context: JSON.parse(row.context_json || '{}'), status: row.status, result: row.result || '', error: row.error || '',
      createdAt: row.created_at, updatedAt: row.updated_at, events: this.listTeamEvents(row.id),
    }))
  }

  teamTask(id) { return this.listTeamTasks(500).find((item) => item.id === id) }

  saveTeamTask(task) {
    const now = new Date().toISOString(); const id = task.id || randomUUID()
    this.db.prepare(`INSERT INTO ai_work_tasks(id,direction,source_device_id,target_device_id,source_conversation_id,title,instruction,context_json,status,result,error,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      direction=excluded.direction,source_device_id=excluded.source_device_id,target_device_id=excluded.target_device_id,
      source_conversation_id=excluded.source_conversation_id,title=excluded.title,instruction=excluded.instruction,
      context_json=excluded.context_json,status=excluded.status,result=excluded.result,error=excluded.error,updated_at=excluded.updated_at`)
      .run(id, task.direction, task.sourceDeviceId, task.targetDeviceId, task.sourceConversationId || null, task.title || 'AI Work', task.instruction,
        JSON.stringify(task.context || {}), task.status || 'created', task.result || '', task.error || '', task.createdAt || now, now)
    return this.teamTask(id)
  }

  updateTeamTask(id, status, values = {}) {
    const existing = this.teamTask(id)
    if (!existing) return undefined
    this.db.prepare('UPDATE ai_work_tasks SET status=?,result=?,error=?,updated_at=? WHERE id=?')
      .run(status, String(values.result ?? existing.result ?? ''), String(values.error ?? existing.error ?? ''), new Date().toISOString(), id)
    return this.teamTask(id)
  }

  patchTeamTask(id, values = {}) {
    const existing = this.teamTask(id)
    if (!existing) return undefined
    return this.saveTeamTask({ ...existing, ...values, context: { ...existing.context, ...(values.context || {}) } })
  }

  addTeamEvent(taskId, type, detail) {
    const item = { id: randomUUID(), taskId, type, detail: String(detail || '').slice(0, 10_000), createdAt: new Date().toISOString() }
    this.db.prepare('INSERT INTO ai_work_events(id,task_id,type,detail,created_at) VALUES(?,?,?,?,?)').run(item.id, taskId, type, item.detail, item.createdAt)
    return item
  }

  listTeamEvents(taskId) {
    return this.db.prepare('SELECT id,task_id,type,detail,created_at FROM ai_work_events WHERE task_id=? ORDER BY created_at ASC').all(taskId).map((row) => ({
      id: row.id, taskId: row.task_id, type: row.type, detail: row.detail, createdAt: row.created_at,
    }))
  }

  listSkills() {
    return this.db.prepare('SELECT id,name,description,path,content,enabled,created_at FROM skills ORDER BY created_at DESC').all().map((row) => ({ ...row, enabled: Boolean(row.enabled), createdAt: row.created_at }))
  }

  upsertSkill(item) {
    const now = new Date().toISOString(); const id = item.id || randomUUID()
    this.db.prepare(`INSERT INTO skills(id,name,description,path,content,enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,path=excluded.path,content=excluded.content,updated_at=excluded.updated_at`)
      .run(id, item.name, item.description, item.path, item.content, now, now)
    return id
  }

  setSkillEnabled(id, enabled) { this.db.prepare('UPDATE skills SET enabled=?,updated_at=? WHERE id=?').run(enabled ? 1 : 0, new Date().toISOString(), id) }
  removeSkill(id) { this.db.prepare('DELETE FROM skills WHERE id=?').run(id) }
  enabledSkillContent() { return this.db.prepare('SELECT name,content FROM skills WHERE enabled=1 ORDER BY created_at DESC').all() }

  retrieveSkills(query, limit = 4) {
    const terms = searchTerms(query)
    if (!terms.length) return []
    return this.db.prepare('SELECT name,description,content FROM skills WHERE enabled=1').all()
      .map((row) => {
        const haystack = `${row.name}\n${row.description}\n${row.content}`.toLowerCase()
        return { ...row, score: terms.reduce((score, term) => score + occurrences(haystack, term), 0) }
      })
      .filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ name, content }) => ({ name, content }))
  }

  skillContent(reference) {
    return this.db.prepare('SELECT name,content FROM skills WHERE enabled=1 AND (id=? OR name=?) LIMIT 1').get(reference, reference)
  }

  listWorkflows() {
    return this.db.prepare('SELECT id,name,description,steps_json,updated_at,last_status FROM workflows ORDER BY updated_at DESC').all().map((row) => ({
      id: row.id, name: row.name, description: row.description, ...normalizeWorkflowGraph(JSON.parse(row.steps_json)), updatedAt: row.updated_at, lastStatus: row.last_status,
    }))
  }

  saveWorkflow(workflow) {
    const now = new Date().toISOString(); const id = workflow.id || randomUUID()
    this.db.prepare(`INSERT INTO workflows(id,name,description,steps_json,created_at,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,steps_json=excluded.steps_json,updated_at=excluded.updated_at`)
      .run(id, workflow.name, workflow.description || '', JSON.stringify({ nodes: workflow.nodes || [], edges: workflow.edges || [] }), now, now)
    return id
  }

  removeWorkflow(id) { this.db.prepare('DELETE FROM workflows WHERE id=?').run(id) }
  workflow(id) { const row = this.db.prepare('SELECT * FROM workflows WHERE id=?').get(id); return row ? { ...row, ...normalizeWorkflowGraph(JSON.parse(row.steps_json)) } : undefined }
  setWorkflowResult(id, status, result) { this.db.prepare('UPDATE workflows SET last_status=?,last_result=?,updated_at=? WHERE id=?').run(status, result, new Date().toISOString(), id) }

  listMessages(conversationId = this.activeConversationId()) {
    return this.db.prepare('SELECT id,role,content,trace_json,attachments_json,created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 200').all(conversationId).map((row) => ({
      id: row.id, role: row.role, content: row.content, createdAt: row.created_at,
      ...(row.trace_json ? { trace: JSON.parse(row.trace_json) } : {}),
      ...(row.attachments_json ? { attachments: JSON.parse(row.attachments_json) } : {}),
    }))
  }
  addMessage(conversationId, role, content, trace, attachments) {
    if (!this.conversation(conversationId)) throw new Error('找不到这个对话。')
    const allowedKinds = new Set(['data', 'skill', 'script', 'knowledge'])
    const messageAttachments = Array.isArray(attachments) ? attachments.slice(0, 24).map((item) => ({ kind: allowedKinds.has(item.kind) ? item.kind : 'attachment', name: String(item.name), size: Number(item.size) || 0, type: String(item.type || '') })) : []
    const item = { id: randomUUID(), role, content, createdAt: new Date().toISOString(), ...(trace?.length ? { trace } : {}), ...(messageAttachments.length ? { attachments: messageAttachments } : {}) }
    this.db.prepare('INSERT INTO messages(id,conversation_id,role,content,trace_json,attachments_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(item.id, conversationId, role, content, trace?.length ? JSON.stringify(trace) : null, messageAttachments.length ? JSON.stringify(messageAttachments) : null, item.createdAt)
    const conversation = this.conversation(conversationId)
    const priorUserMessages = role === 'user' ? Number(this.db.prepare("SELECT COUNT(*) AS total FROM messages WHERE conversation_id=? AND role='user' AND id<>?").get(conversationId, item.id)?.total || 0) : 1
    const generatedTitle = role === 'user' && priorUserMessages === 0
      ? String(content).replace(/\s+/g, ' ').trim().slice(0, 32) || '新对话'
      : conversation?.title
    this.db.prepare('UPDATE conversations SET title=?,updated_at=? WHERE id=?').run(generatedTitle || '新对话', item.createdAt, conversationId)
    return item
  }
  clearMessages(conversationId = this.activeConversationId()) { this.db.prepare('DELETE FROM messages WHERE conversation_id=?').run(conversationId) }
  startRun(kind, targetId, input) {
    const id = randomUUID(); const startedAt = new Date().toISOString()
    this.db.prepare('INSERT INTO run_logs(id,kind,target_id,status,input,started_at) VALUES(?,?,?,?,?,?)').run(id, kind, targetId || null, 'running', input, startedAt)
    return id
  }
  finishRun(id, status, output, error) {
    this.db.prepare('UPDATE run_logs SET status=?,output=?,error=?,ended_at=? WHERE id=?').run(status, output || null, error || null, new Date().toISOString(), id)
  }
  recoverInterruptedRuns() {
    const now = new Date().toISOString()
    const message = '上次运行随应用关闭而停止。'
    this.db.prepare("UPDATE data_library SET last_status='cancelled',last_output=?,updated_at=? WHERE last_status='running'").run(message, now)
    this.db.prepare("UPDATE workflows SET last_status='cancelled',last_result=?,updated_at=? WHERE last_status='running'").run(message, now)
    this.db.prepare("UPDATE run_logs SET status='cancelled',error=?,ended_at=? WHERE status='running'").run(message, now)
  }
  recentRuns(limit = 12) {
    return this.db.prepare('SELECT id,kind,target_id,status,started_at,ended_at,error FROM run_logs ORDER BY started_at DESC LIMIT ?').all(limit)
  }
  close() { this.db.close() }
}

module.exports = { StableStore, DEFAULT_IDENTITY }
