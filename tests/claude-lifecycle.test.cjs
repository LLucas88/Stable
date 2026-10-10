'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { sessionDirectory, clearClaudeSession, activeSessions } = require('../desktop/services/claude-session.cjs')
const { createClaudeLifecycle } = require('../desktop/services/claude-lifecycle.cjs')

function fixture(t, key = 'conversation') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-claude-history-'))
  const directory = sessionDirectory(root, key)
  fs.mkdirSync(directory, { recursive: true })
  t.after(() => {
    activeSessions.delete(directory)
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, key, directory, life: createClaudeLifecycle({ userData: root }) }
}

function savePointer(directory, threadId = 'thread') {
  fs.writeFileSync(path.join(directory, 'stable-thread.json'), JSON.stringify({ threadId, seeded: true }))
}
function turn(id, text, extra = {}) {
  return { id, status: 'completed', items: [{ id: 'answer-' + id, type: 'agentMessage', text, phase: 'final_answer' }], ...extra }
}
function saveTurns(directory, records) {
  fs.writeFileSync(path.join(directory, 'stable-turns.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n')
}

test('local history has no runtime until a valid Claude session pointer exists', async t => {
  const { life, key, directory } = fixture(t)
  assert.deepEqual(await life.read(key), { noRuntime: true })
  savePointer(directory)
  assert.deepEqual(await life.read(key), { thread: { id: 'thread', turns: [] } })
  fs.writeFileSync(path.join(directory, 'stable-thread.json'), '{}')
  await assert.rejects(life.read(key), /映射不完整/)
  fs.writeFileSync(path.join(directory, 'stable-thread.json'), '{')
  await assert.rejects(life.read(key), /映射损坏/)
})

test('recovery reads terminal results, keeps the last status, and excludes other threads', async t => {
  const { life, key, directory } = fixture(t)
  savePointer(directory)
  saveTurns(directory, [turn('first', 'unrelated', { threadId: 'old-thread' }), turn('a', '', { status: 'interrupted' }), turn('b', '', { status: 'failed', error: { message: 'upstream failed' } }), turn('a', 'final answer')])
  const { thread } = await life.read(key)
  assert.equal(thread.id, 'thread')
  assert.deepEqual(thread.turns.map(item => [item.id, item.status]), [['a', 'completed'], ['b', 'failed']])
  assert.equal(thread.turns[0].items[0].text, 'final answer')
  assert.equal(thread.turns[1].error.message, 'upstream failed')
})

test('a partial last append never fabricates a completed answer; earlier corruption fails closed', async t => {
  const { life, key, directory } = fixture(t)
  savePointer(directory)
  const journal = path.join(directory, 'stable-turns.jsonl')
  fs.writeFileSync(journal, JSON.stringify(turn('a', 'verified')) + '\n{"id":"unknown"')
  assert.equal((await life.read(key)).thread.turns.length, 1)
  fs.writeFileSync(journal, '{broken}\n' + JSON.stringify(turn('b', 'unverified')) + '\n')
  await assert.rejects(life.read(key), /运行记录损坏/)
  fs.writeFileSync(journal, JSON.stringify({ id: 'c', status: 'running', items: [] }) + '\n')
  await assert.rejects(life.read(key), /格式不完整/)
})

test('archive stays local and delete detaches the pointer while preserving diagnostics', async t => {
  const { life, key, directory } = fixture(t)
  savePointer(directory)
  saveTurns(directory, [turn('a', 'preserved')])
  const transcript = path.join(directory, 'native-transcript.jsonl')
  fs.writeFileSync(transcript, 'native diagnostic history')
  for (const operation of ['archive', 'unarchive']) {
    assert.deepEqual(await life.sync(key, operation), { local: true })
    assert(fs.existsSync(path.join(directory, 'stable-thread.json')))
  }
  assert.deepEqual(await life.sync(key, 'delete'), { local: true })
  assert.deepEqual(await life.read(key), { noRuntime: true })
  assert(fs.existsSync(path.join(directory, 'stable-turns.jsonl')))
  assert.equal(fs.readFileSync(transcript, 'utf8'), 'native diagnostic history')
  assert.deepEqual(await life.sync(key, 'delete'), { local: true })
  await assert.rejects(life.sync(key, 'publish'), /未知同步操作/)
})

test('a live runner prevents detaching its session and hashing confines unusual conversation keys', t => {
  const { root, key, directory } = fixture(t)
  savePointer(directory)
  activeSessions.add(directory)
  assert.throws(() => clearClaudeSession(root, key), /先停止/)
  assert(fs.existsSync(path.join(directory, 'stable-thread.json')))
  activeSessions.delete(directory)
  clearClaudeSession(root, key)
  assert.equal(fs.existsSync(path.join(directory, 'stable-thread.json')), false)
  const unusual = sessionDirectory(root, '../outside')
  assert.equal(path.dirname(unusual), path.join(root, 'claude', 'sessions'))
  assert.match(path.basename(unusual), /^[a-f0-9]{64}$/)
})

test('unsafe session paths cannot redirect reads or pointer deletion to an external directory', async t => {
  const { root, key, directory, life } = fixture(t)
  const outside = path.join(root, 'outside')
  fs.mkdirSync(outside)
  savePointer(outside)
  fs.rmdirSync(directory)
  fs.symlinkSync(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(life.read(key), /安全的本地文件/)
  await assert.rejects(life.sync(key, 'delete'), /安全的本地文件/)
  assert(fs.existsSync(path.join(outside, 'stable-thread.json')))
})
