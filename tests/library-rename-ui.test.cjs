'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

test('script rename is connected from the card to the persistent library IPC', () => {
  const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
  const preload = readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8')
  const main = readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8')

  assert.match(app, /window\.stable\.library\.rename\(item\.id, name\)/)
  assert.match(app, /aria-label="脚本显示名称"/)
  assert.match(preload, /stable:library:rename/)
  assert.match(main, /ipcMain\.handle\('stable:library:rename'/)
  assert.match(main, /store\.renameLibraryItem\(id, name\)/)
  assert.match(app, /finally \{\s*setRunningId\(''\)\s*\}/)
})
