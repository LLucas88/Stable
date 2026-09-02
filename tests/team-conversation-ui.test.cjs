'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
const css = readFileSync(path.join(root, 'src', 'styles', 'app.css'), 'utf8')

test('Team conversation sharing replaces the old remote task modules', () => {
  assert.match(app, /<AtSign[^>]*aria-hidden="true"/)
  assert.match(app, /aria-label="任务清单"/)
  assert.match(app, /state\.conversations\.filter\(\(item\) => !item\.pinned\)\.map\(\(item\) => <ConversationRow/)
  assert.match(app, /team\.conversationOffers/)
  assert.match(app, /decideConversation\(offer\.id, true\)/)
  assert.match(app, /const available = state\.team\.connection === 'online' && device\.status === 'online'/)
  assert.match(app, /disabled=\{!available\}/)
  assert.doesNotMatch(app, /派发远程任务/)
  assert.doesNotMatch(app, /任务与审批/)
  assert.match(css, /\.conversation-history-card\s*\{/)
  assert.match(css, /\.team-device-option:disabled\s*\{/)
})

test('agent workbench keeps a neutral conversation focus, pinned task list and subagent execution cards', () => {
  assert.match(app, /className="conversation-history-card"/)
  assert.match(app, /className="conversation-pinned"/)
  assert.match(app, /pinnedConversations\.map/)
  assert.match(app, /function SubagentTraceCard/)
  assert.match(app, /<small>当前任务<\/small>/)
  assert.match(app, /<small>最新动作<\/small>/)
  assert.match(css, /#root \.trace-summary:hover,[\s\S]*box-shadow: none !important/)
  assert.match(css, /#root \.composer-box,[\s\S]*#root \.composer-box:focus-within[^}]*box-shadow: none !important[^}]*transition: none !important/)
  assert.match(css, /\.conversation-pinned\s*\{/)
  assert.match(css, /\.trace-subagent-card\s*\{/)
})
