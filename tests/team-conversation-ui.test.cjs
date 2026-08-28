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
  assert.match(app, /className="team-conversation-zone"/)
  assert.match(app, /team\.conversationOffers/)
  assert.match(app, /decideConversation\(offer\.id, true\)/)
  assert.match(app, /const available = state\.team\.connection === 'online' && device\.status === 'online'/)
  assert.match(app, /disabled=\{!available\}/)
  assert.doesNotMatch(app, /派发远程任务/)
  assert.doesNotMatch(app, /任务与审批/)
  assert.match(css, /\.team-conversation-zone\s*\{/)
  assert.match(css, /\.team-device-option:disabled\s*\{/)
})

test('agent workbench keeps a neutral conversation focus, compact Team and subagent execution cards', () => {
  assert.match(app, /className="conversation-history-card"/)
  assert.match(app, /data-collapsed=\{teamCollapsed \|\| undefined\}/)
  assert.match(app, /aria-label=\{teamCollapsed \? '展开 Team 对话' : '收起 Team 对话'\}/)
  assert.match(app, /function SubagentTraceCard/)
  assert.match(app, /<small>当前任务<\/small>/)
  assert.match(app, /<small>最新动作<\/small>/)
  assert.match(css, /#root \.trace-summary[\s\S]*box-shadow: inset 0 -1px 0 var\(--color-rule\)/)
  assert.match(css, /#root \.composer-box,[\s\S]*#root \.composer-box:focus-within[^}]*box-shadow: none !important[^}]*transition: none !important/)
  assert.match(css, /\.team-conversation-zone\[data-collapsed="true"\]/)
  assert.match(css, /\.trace-subagent-card\s*\{/)
})
