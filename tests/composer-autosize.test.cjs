const { readSource } = require('./helpers/read-source.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { spawn } = require('node:child_process')
const path = require('node:path')

test('autosizing is connected only to the main composer without replacing keyboard or queue handlers', () => {
  const app = readSource(path.join(__dirname, '../src/App.tsx'), 'utf8')
  const css = readSource(path.join(__dirname, '../src/styles/app.css'), 'utf8')
  assert.match(app, /useComposerAutosize\(promptRef, prompt, active\)/)
  assert.match(app, /<textarea ref=\{promptRef\} id="agent-prompt" value=\{prompt\}/)
  assert.match(app, /event\.key === 'Enter' && !event\.nativeEvent\.isComposing/)
  assert.match(app, /if \(event\.altKey\)/)
  assert.match(css, /\.composer #agent-prompt \{[^}]*max-height: calc\(4lh \+ 2 \* var\(--space-xs\)\);[^}]*resize: none;/)
  assert.match(css, /\.composer \.queue-edit textarea \{[^}]*resize: vertical;/)
})

for (const [fixture, marker] of [['composer-autosize-ui.cjs', 'COMPOSER_AUTOSIZE_UI_PASSED'], ['composer-interaction-ui.cjs', 'COMPOSER_INTERACTION_UI_PASSED']]) test(`hidden Electron verifies ${fixture}`, { skip: process.platform !== 'win32', timeout: 90_000 }, async () => {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise((resolve) => {
    let output = ''
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures', fixture)], {
      cwd: path.join(__dirname, '..'), windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output: 'Composer UI test timed out\n' + output }) }, 85_000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000) })
    child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: error.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.ok(result.output.includes(marker), result.output)
})
