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
