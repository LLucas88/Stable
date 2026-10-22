'use strict'
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { parseRollout, scanCodex } = require('../desktop/services/codex-reader.cjs')
const { StableStore } = require('../desktop/services/store.cjs')
const { WorkBuddyImportService } = require('../desktop/services/workbuddy-import.cjs')
function fixture(t, beforeCleanup = () => {}) {
  const parent = path.resolve(__dirname, '../.local/codex-tests'); fs.mkdirSync(parent, { recursive: true })
  const root = fs.mkdtempSync(path.join(parent, 'case-'))
  t.after(() => { beforeCleanup(); fs.rmSync(root, { recursive: true, force: true }) }); return root
}
const message = (role, text, phase, id = text) => ({ type: 'response_item', timestamp: '2026-10-01T00:00:00Z', payload: { type: 'message', id, role, phase, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } })
function rollout(cwd, id = 'test-thread') { return [
  { type: 'session_meta', payload: { id, cwd, source: 'vscode', thread_source: 'user' } },
  message('developer', 'SECRET_SYSTEM'), message('user', '# AGENTS.md instructions\nINJECTED_CONTEXT'),
  message('user', '请生成报告'), message('assistant', 'THINKING_SECRET', 'analysis'), message('assistant', 'PROGRESS_ONLY', 'commentary'),
  { type: 'response_item', payload: { type: 'function_call_output', output: 'TOOL_SECRET' } },
  message('assistant', `[报告](<${path.join(cwd, 'report.html')}>)`, 'final_answer'),
  { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'DUPLICATE_FINAL' } },
] }
const encode = rows => Buffer.from(rows.map(r => JSON.stringify(r)).join('\n'))
test('Codex parser imports Q/A only, excludes injected context, reasoning, progress and duplicate events', () => {
  const parsed = parseRollout(encode(rollout(path.resolve('fixture'))))
  assert.deepEqual(parsed.messages.map(m => m.role), ['user', 'assistant'])
  assert(!/SECRET|INJECTED|PROGRESS|DUPLICATE/.test(JSON.stringify(parsed.messages)))
  assert.equal(parsed.messages[1].refs.length, 1)
  const legacy = [message('assistant', 'old progress'), message('assistant', 'old answer'), { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'old answer' } }]
  assert.deepEqual(parseRollout(encode(legacy)).messages.map(m => m.content), ['old answer'])
  const reply = message('user', '<send_user_message_question_reply>[{"question":"继续吗","answer":"继续"}]</send_user_message_question_reply>')
  assert.equal(parseRollout(encode([reply])).messages[0].content, '继续吗\n继续')
})
test('local Codex scans five categories and imports native Q/A with copied deliverables; sources remain unchanged', async t => {
  let store
  const root = fixture(t, () => store?.close()), source = path.join(root, '.codex'), cwd = path.join(root, 'work'), profile = path.join(root, 'profile')
  fs.mkdirSync(path.join(source, 'sessions/2026/10'), { recursive: true }); fs.mkdirSync(cwd)
  fs.writeFileSync(path.join(cwd, 'report.html'), '<h1>Report</h1>')
  const file = path.join(source, 'sessions/2026/10/rollout-test.jsonl'), bytes = encode(rollout(cwd)); fs.writeFileSync(file, bytes)
  fs.writeFileSync(path.join(source, 'session_index.jsonl'), JSON.stringify({ id: 'test-thread', thread_name: '报告项目对话' }))
  fs.writeFileSync(path.join(source, '.codex-global-state.json'), JSON.stringify({ 'local-projects': { p: { id: 'p', name: '我的项目' } }, 'thread-project-assignments': { 'test-thread': { projectId: 'p' } } }))
  fs.mkdirSync(path.join(source, 'skills/report'), { recursive: true }); fs.writeFileSync(path.join(source, 'skills/report/SKILL.md'), '---\nname: report\ndescription: Report skill\n---\n# Report\nBuild reports.')
  fs.writeFileSync(path.join(source, 'AGENTS.md'), '保留零值')
  fs.writeFileSync(path.join(source, 'config.toml'), '[mcp_servers.docs]\nurl = "https://user:SECRET@example.com/mcp?token=SECRET"\nhttp_headers = { Authorization = "SECRET" }\n[mcp_servers.local]\ncommand = "SECRET_COMMAND"\n')
  fs.writeFileSync(path.join(source, 'auth.json'), 'SECRET_AUTH')
  store = new StableStore(profile)
  const service = new WorkBuddyImportService({ store, userData: profile, workspace: cwd })
  const p = await service.scan(source, 'codex')
  assert.equal(p.provider, 'codex'); assert.deepEqual([...new Set(p.items.map(i => i.kind))].sort(), ['connector', 'file', 'memory', 'project', 'session', 'skill'])
  assert.equal(p.items.find(i => i.name === 'local').status, 'unavailable')
  assert(!JSON.stringify(p).includes('SECRET')); assert(!service.detail(p.token, p.items.find(i => i.name === 'docs').id).text.includes('SECRET'))
  assert.equal(p.items.find(i => i.kind === 'project').name, '我的项目')
  const ids = p.items.filter(i => i.status === 'ready').map(i => i.id), result = await service.importSelected(p.token, ids)
  assert(result.results.every(i => i.status === 'imported'), JSON.stringify(result))
  const id = result.results.find(i => i.kind === 'session').targetId, conversation = store.conversation(id), messages = store.listMessages(id)
  assert.equal(conversation.sourceType, 'local'); assert.equal(conversation.title, '报告项目对话'); assert(conversation.projectId)
  assert.equal(messages.length, 2); assert.equal(messages[1].attachments.length, 1)
  assert.equal(fs.readFileSync(messages[1].attachments[0].path, 'utf8'), '<h1>Report</h1>')
  assert(messages[1].content.includes('file:///')); assert(!messages[1].content.includes(path.join(cwd, 'report.html')))
  store.addMessage(id, 'user', '继续'); assert.equal(store.listMessages(id).length, 3)
  assert(service.history().every(i => i.provider === 'codex'))
  assert((await service.importSelected(p.token, ids)).results.every(i => i.status === 'skipped'))
  assert.deepEqual(fs.readFileSync(file), bytes)
  assert(!fs.existsSync(path.join(profile, 'claude/extensions.json')))
})
test('Codex missing files are unavailable; subagents and credential file references are excluded; user forks are retained', t => {
  const root = fixture(t); fs.mkdirSync(path.join(root, 'sessions'))
  const rows = rollout(root); rows[0].payload.parent_thread_id = 'parent-user-thread'
  rows.push(message('assistant', `[secret](${path.join(root, 'secrets.txt')})`, 'final_answer'))
  fs.writeFileSync(path.join(root, 'sessions/rollout-user.jsonl'), encode(rows))
  const child = rollout(root, 'child'); child[0].payload.source = { subagent: { other: 'worker' } }
  fs.writeFileSync(path.join(root, 'sessions/rollout-child.jsonl'), encode(child))
  const p = scanCodex(root, path.join(root, 'stage'))
  assert.equal(p.items.filter(i => i.kind === 'session').length, 1)
  assert.equal(p.items.filter(i => i.kind === 'file').length, 1)
  assert.equal(p.items.find(i => i.kind === 'file').status, 'unavailable')
})
