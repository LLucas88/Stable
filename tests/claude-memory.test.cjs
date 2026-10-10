'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { prepareClaudeMemory } = require('../desktop/services/claude-memory.cjs')
const { createNativeToolGuard } = require('../desktop/services/claude-native-tools.cjs')

test('memory is shared within a project, isolated across projects and gated by native file permissions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-memory-'))
  t.after(() => { assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }) })
  const workspace = path.join(root, 'project'); fs.mkdirSync(workspace)
  const other = path.join(root, 'other'); fs.mkdirSync(other)
  const options = { userData: root, workspace }
  const memory = prepareClaudeMemory(options)
  const second = prepareClaudeMemory({ ...options, workspace: other })
  assert.notEqual(memory.directory, second.directory)
  fs.writeFileSync(path.join(memory.directory, 'MEMORY.md'), 'VERIFIED_PROJECT_MEMORY')
  assert.match(prepareClaudeMemory(options).instruction, /VERIFIED_PROJECT_MEMORY/)
  assert.doesNotMatch(second.instruction, /VERIFIED_PROJECT_MEMORY/)
  for (const mode of [{ textOnly: true }, { sandboxMode: 'read-only' }]) {
    assert.equal(prepareClaudeMemory({ ...options, ...mode }).enabled, false)
    assert.equal(prepareClaudeMemory({ ...options, ...mode }).instruction, '')
  }
  let approvals = 0
  const guard = createNativeToolGuard({ workspace, writableRoots: memory.roots, requestApproval: async () => { approvals++; return true } })
  assert.equal((await guard.canUseTool('Write', { file_path: path.join(memory.directory, 'note.md'), content: 'fact' })).behavior, 'allow')
  assert.equal(approvals, 1)
  assert.equal((await guard.canUseTool('Read', { file_path: path.join(second.directory, 'MEMORY.md') })).behavior, 'deny')
  assert.equal((await guard.canUseTool('Write', { file_path: path.join(root, 'claude', 'settings.json'), content: '{}' })).behavior, 'deny')
  fs.unlinkSync(path.join(memory.directory, 'MEMORY.md'))
  fs.mkdirSync(path.join(memory.directory, 'MEMORY.md'))
  assert.throws(() => prepareClaudeMemory(options), /索引/)
})
