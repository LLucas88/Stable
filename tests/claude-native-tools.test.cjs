'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createNativeToolGuard, NATIVE_FILE_TOOLS } = require('../desktop/services/claude-native-tools.cjs')

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-native-tool-guard-'))
  const workspace = path.join(root, 'workspace'), outside = path.join(root, 'outside')
  fs.mkdirSync(workspace); fs.mkdirSync(outside)
  const events = [], approvals = []
  const guard = createNativeToolGuard({ workspace, onToolEvent: event => events.push(event), requestApproval: async request => { approvals.push(request); return true }, ...options })
  let serial = 0
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, workspace, outside, guard, events, approvals,
    pre: (name, args, id = `tool-${++serial}`, signal) => guard.preToolUse({ hook_event_name: 'PreToolUse', tool_name: name, tool_input: args, tool_use_id: id }, id, { signal }),
  }
}
const decision = value => value.hookSpecificOutput.permissionDecision
const reason = value => value.hookSpecificOutput.permissionDecisionReason
const linkDir = (target, link) => fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
function unlinkDirectoryLink(link) { assert.equal(fs.lstatSync(link).isSymbolicLink(), true); fs.unlinkSync(link) }

test('native reads use canonical allowed paths, preserve parameters, and never ask approval', async t => {
  const x = fixture(t)
  const file = path.join(x.workspace, '中文.txt'); fs.writeFileSync(file, 'read me')
  const read = await x.pre('Read', { file_path: '中文.txt', offset: 1, limit: 10 }, 'read-1')
  assert.equal(decision(read), 'allow')
  assert.deepEqual(read.hookSpecificOutput.updatedInput, { file_path: fs.realpathSync(file), offset: 1, limit: 10 })
  await x.guard.postToolUse({ tool_use_id: 'read-1', tool_response: { content: 'read me' } })
  assert.equal(x.approvals.length, 0)
  assert.deepEqual(x.events.map(event => event.status), ['running', 'completed'])
  assert.equal(x.events[1].id, 'read-1')
  assert.deepEqual(x.events[1].output, { content: 'read me' })
  assert.deepEqual(x.guard.tools, NATIVE_FILE_TOOLS)
})

test('only the six file tools are admitted; shell, hosted tools, and unknown parameters fail closed', async t => {
  const x = fixture(t)
  for (const name of ['Bash', 'PowerShell', 'Shell', 'WebFetch', 'WebSearch', 'Skill', 'NotebookRead', 'Unknown']) {
    const denied = await x.pre(name, { command: 'should never run' })
    assert.equal(decision(denied), 'deny', name)
  }
  fs.writeFileSync(path.join(x.workspace, 'safe.txt'), 'safe')
  assert.equal(decision(await x.pre('Read', { file_path: 'safe.txt', cwd: x.outside })), 'deny')
  assert.equal((await x.guard.canUseTool('Bash', { command: 'anything' })).behavior, 'deny')
  assert.equal(x.approvals.length, 0)
})

test('Write, Edit and NotebookEdit approve canonical arguments and retain the native operation', async t => {
  const x = fixture(t)
  const file = path.join(x.workspace, 'original.txt'); fs.writeFileSync(file, 'before')
  const notebook = path.join(x.workspace, 'book.ipynb'); fs.writeFileSync(notebook, '{"cells":[]}')
  for (const [name, input, field] of [
    ['Write', { file_path: 'nested/new.txt', content: '中文' }, 'file_path'],
    ['Edit', { file_path: 'original.txt', old_string: 'before', new_string: 'after' }, 'file_path'],
    ['NotebookEdit', { notebook_path: 'book.ipynb', new_source: 'print(1)', edit_mode: 'insert', cell_type: 'code' }, 'notebook_path'],
  ]) {
    const result = await x.pre(name, input)
    assert.equal(decision(result), 'allow')
    assert.equal(result.hookSpecificOutput.updatedInput[field], path.join(x.workspace, input[field]))
    assert.equal(x.approvals.at(-1).name, name)
    assert.deepEqual(x.approvals.at(-1).args, result.hookSpecificOutput.updatedInput)
  }
  // The guard does not replace the SDK tool with a parent-process write.
  assert.equal(fs.readFileSync(file, 'utf8'), 'before')
  assert.equal(fs.existsSync(path.join(x.workspace, 'nested')), false)
  assert.equal(x.approvals.length, 3)
})

test('canUseTool fallback repeats bounds checking without approving an unchanged hook request twice', async t => {
  const x = fixture(t)
  const inner = path.join(x.workspace, 'inner'); fs.mkdirSync(inner)
  fs.writeFileSync(path.join(inner, 'file.txt'), 'before')
  linkDir(inner, path.join(x.workspace, 'alias'))
  const pre = await x.pre('Edit', { file_path: 'alias/file.txt', old_string: 'before', new_string: 'after' }, 'same-id')
  assert.equal(decision(pre), 'allow')
  const allowed = await x.guard.canUseTool('Edit', pre.hookSpecificOutput.updatedInput, { toolUseID: 'same-id' })
  assert.equal(allowed.behavior, 'allow')
  assert.equal(x.approvals.length, 1)
  fs.writeFileSync(path.join(inner, 'file.txt'), 'external change')
  const changed = await x.guard.canUseTool('Edit', pre.hookSpecificOutput.updatedInput, { toolUseID: 'same-id' })
  assert.equal(changed.behavior, 'deny'); assert.match(changed.message, /已变化/)
})

test('denied, missing and aborted approval cannot admit a native mutation', async t => {
  const denied = fixture(t, { requestApproval: async () => false })
  assert.equal(decision(await denied.pre('Write', { file_path: 'denied.txt', content: 'bad' })), 'deny')
  const missing = fixture(t, { requestApproval: undefined })
  assert.match(reason(await missing.pre('Write', { file_path: 'missing.txt', content: 'bad' })), /缺少.*审批/)
  const controller = new AbortController()
  const aborted = fixture(t, { requestApproval: () => new Promise(() => {}), signal: controller.signal })
  const pending = aborted.pre('Write', { file_path: 'aborted.txt', content: 'bad' })
  queueMicrotask(() => controller.abort())
  assert.match(reason(await pending), /任务已停止/)
  for (const x of [denied, missing, aborted]) assert.equal(fs.readdirSync(x.workspace).length, 0)
})

test('mutation payloads above the existing 2 MB boundary are rejected before approval', async t => {
  const x = fixture(t)
  fs.writeFileSync(path.join(x.workspace, 'file.txt'), 'before')
  fs.writeFileSync(path.join(x.workspace, 'book.ipynb'), '{}')
  const large = '中'.repeat(666_667)
  for (const [name, args] of [
    ['Write', { file_path: 'new.txt', content: large }],
    ['Edit', { file_path: 'file.txt', old_string: 'before', new_string: large }],
    ['NotebookEdit', { notebook_path: 'book.ipynb', new_source: large }],
  ]) assert.match(reason(await x.pre(name, args)), /超过 2 MB/)
  assert.equal(x.approvals.length, 0)
})

test('read-only mode rejects all three mutations without requesting approval', async t => {
  const x = fixture(t, { sandboxMode: 'read-only' })
  fs.writeFileSync(path.join(x.workspace, 'file.txt'), 'unchanged')
  fs.writeFileSync(path.join(x.workspace, 'book.ipynb'), '{}')
  for (const [name, args] of [
    ['Write', { file_path: 'file.txt', content: 'bad' }],
    ['Edit', { file_path: 'file.txt', old_string: 'unchanged', new_string: 'bad' }],
    ['NotebookEdit', { notebook_path: 'book.ipynb', new_source: 'bad' }],
  ]) assert.match(reason(await x.pre(name, args)), /只读/)
  assert.equal(decision(await x.pre('Read', { file_path: 'file.txt' })), 'allow')
  assert.equal(x.approvals.length, 0)
})

test('directory escapes, protected nested configuration, hard links and Windows alternate streams are rejected', async t => {
  const x = fixture(t)
  const external = path.join(x.outside, 'private.txt'); fs.writeFileSync(external, 'outside secret')
  const alias = path.join(x.workspace, 'hard.txt'); fs.linkSync(external, alias)
  assert.equal(decision(await x.pre('Read', { file_path: external })), 'deny')
  assert.equal(decision(await x.pre('Write', { file_path: alias, content: 'bad' })), 'deny')
  for (const dir of ['.git', '.codex', '.claude', '.agents', 'nested/.git', 'nested/.codex', 'nested/.claude', 'nested/.agents']) {
    assert.equal(decision(await x.pre('Write', { file_path: dir + '/config', content: 'bad' })), 'deny', dir)
  }
  const inner = path.join(x.workspace, 'inner'); fs.mkdirSync(inner)
  linkDir(inner, path.join(x.workspace, '.git'))
  assert.equal(decision(await x.pre('Write', { file_path: '.git/config', content: 'bad' })), 'deny')
  if (process.platform === 'win32') {
    assert.equal(decision(await x.pre('Read', { file_path: alias + ':secret' })), 'deny')
    assert.equal(decision(await x.pre('Read', { file_path: '\\\\?\\' + alias })), 'deny')
    for (const file_path of ['.git /config', 'nested/.codex./config', 'NUL.txt', 'CON', 'COM1/log']) {
      assert.equal(decision(await x.pre('Write', { file_path, content: 'bad' })), 'deny', file_path)
    }
  }
  assert.equal(fs.readFileSync(external, 'utf8'), 'outside secret')
  assert.equal(x.approvals.length, 0)
})

test('approval detects content changes, same-content inode replacement and newly introduced hard links', async t => {
  for (const change of ['content', 'inode', 'hardlink']) {
    let mutate
    const x = fixture(t, { requestApproval: async () => { mutate(); return true } })
    const file = path.join(x.workspace, 'file.txt'); fs.writeFileSync(file, 'before')
    mutate = () => {
      if (change === 'content') fs.writeFileSync(file, 'user change')
      if (change === 'inode') { fs.renameSync(file, path.join(x.workspace, 'previous.txt')); fs.writeFileSync(file, 'before') }
      if (change === 'hardlink') fs.linkSync(file, path.join(x.outside, 'late-hardlink.txt'))
    }
    const result = await x.pre('Edit', { file_path: 'file.txt', old_string: 'before', new_string: 'bad' })
    assert.equal(decision(result), 'deny', change)
    assert.notEqual(fs.readFileSync(file, 'utf8'), 'bad')
  }
})

test('approval detects changed links and replaced parent directories before handing writes to the SDK', async t => {
  let changeLink
  const x = fixture(t, { requestApproval: async () => { changeLink(); return true } })
  const inner = path.join(x.workspace, 'inner'); fs.mkdirSync(inner)
  fs.writeFileSync(path.join(inner, 'file.txt'), 'before')
  fs.writeFileSync(path.join(x.outside, 'file.txt'), 'outside secret')
  const alias = path.join(x.workspace, 'alias'); linkDir(inner, alias)
  changeLink = () => { unlinkDirectoryLink(alias); linkDir(x.outside, alias) }
  assert.equal(decision(await x.pre('Edit', { file_path: 'alias/file.txt', old_string: 'before', new_string: 'bad' })), 'deny')
  assert.equal(fs.readFileSync(path.join(x.outside, 'file.txt'), 'utf8'), 'outside secret')
  let changeParent
  const y = fixture(t, { requestApproval: async () => { changeParent(); return true } })
  const parent = path.join(y.workspace, 'parent'); fs.mkdirSync(parent)
  fs.writeFileSync(path.join(parent, 'file.txt'), 'before')
  changeParent = () => { fs.renameSync(parent, path.join(y.workspace, 'old-parent')); fs.mkdirSync(parent); fs.writeFileSync(path.join(parent, 'file.txt'), 'before') }
  assert.equal(decision(await y.pre('Edit', { file_path: 'parent/file.txt', old_string: 'before', new_string: 'bad' })), 'deny')
})

test('Glob/Grep retain native patterns but block absolute/traversal globs and escaping directory links', async t => {
  const x = fixture(t)
  fs.writeFileSync(path.join(x.workspace, 'source.js'), 'const x = "../literal"')
  assert.equal(decision(await x.pre('Glob', { pattern: '**/*.{js,ts}' })), 'allow')
  // A content regex containing ../ is not a filesystem path.
  assert.equal(decision(await x.pre('Grep', { pattern: '\\.\\./literal', glob: '*.js', output_mode: 'content' })), 'allow')
  for (const pattern of ['../outside/*.txt', '/absolute/*.txt', 'C:\\outside\\*', '**/{../outside,ok}/*.txt', '{*.txt,D:/outside/*.txt}', '{/outside/**,*.txt}', '@(/outside/**|*.txt)', '**/@(../outside|safe)/*']) {
    assert.equal(decision(await x.pre('Glob', { pattern })), 'deny', pattern)
    assert.equal(decision(await x.pre('Grep', { pattern: 'secret', glob: pattern })), 'deny', pattern)
  }
  fs.writeFileSync(path.join(x.outside, 'private.txt'), 'outside secret')
  const alias = path.join(x.workspace, 'escape'); linkDir(x.outside, alias)
  for (const name of ['Read', 'Glob', 'Grep']) {
    const args = name === 'Read' ? { file_path: path.join(alias, 'private.txt') } : { path: alias, pattern: name === 'Glob' ? '*.txt' : 'secret' }
    assert.equal(decision(await x.pre(name, args)), 'deny', name)
  }
  for (const name of ['Glob', 'Grep']) {
    const result = await x.pre(name, { path: x.workspace, pattern: name === 'Glob' ? '**/*.txt' : 'secret' })
    assert.equal(decision(result), 'deny'); assert.match(reason(result), /搜索目录包含越界/)
  }
  assert.equal(x.approvals.length, 0)
})

test('recursive search can be cancelled and PostToolUseFailure reports the original visible tool ID', async t => {
  const x = fixture(t)
  for (let i = 0; i < 300; i++) fs.writeFileSync(path.join(x.workspace, `${i}.txt`), 'source')
  const controller = new AbortController()
  const searching = x.pre('Grep', { pattern: 'source' }, 'search-cancel', controller.signal)
  queueMicrotask(() => controller.abort())
  assert.match(reason(await searching), /任务已停止/)
  const allowed = await x.pre('Read', { file_path: '1.txt' }, 'native-failure')
  assert.equal(decision(allowed), 'allow')
  await x.guard.postToolUseFailure({ tool_use_id: 'native-failure', error: 'native read failed' })
  assert.deepEqual(x.events.at(-1), { id: 'native-failure', name: 'Read', args: { file_path: path.join(x.workspace, '1.txt') }, status: 'failed', detail: 'native read failed' })
})
