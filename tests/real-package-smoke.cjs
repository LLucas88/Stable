'use strict'

const assert = require('node:assert/strict')
const { copyFileSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { copyScriptFolder } = require('../desktop/services/library-packages.cjs')
const { ScriptRunner } = require('../desktop/services/script-runner.cjs')

async function main() {
  const [sourceRoot, sourceEntry] = process.argv.slice(2)
  if (!sourceRoot || !sourceEntry) throw new Error('用法：node tests/real-package-smoke.cjs <脚本包目录> <入口脚本>')
  process.stdout.write('SMOKE_STAGE=copy\n')
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'stable-real-package-'))
  const packageRoot = path.join(tempRoot, 'imported')
  const importedEntry = copyScriptFolder(path.resolve(sourceRoot), packageRoot, path.resolve(sourceEntry))
  process.stdout.write('SMOKE_STAGE=run\n')
  const asciiEntry = path.join(packageRoot, 'stable-entry.bat')
  copyFileSync(importedEntry, asciiEntry)
  const smokeEntry = path.join(packageRoot, 'stable-self-test.cmd')
  writeFileSync(smokeEntry, '@echo off\r\ncall "%~dp0stable-entry.bat" --self-test\r\nexit /b %ERRORLEVEL%\r\n', 'utf8')
  const events = []
  const runner = new ScriptRunner({ workspace: tempRoot, timeoutMs: 90_000 })
  try {
    const result = await runner.run({ id: 'real-package-smoke', path: smokeEntry }, (event) => events.push(event))
    process.stdout.write('SMOKE_STAGE=verify\n')
    assert.match(result.output, /SELF_TEST_PASSED/)
    assert.ok(events.some((event) => event.stream === 'stdout' && event.chunk.includes('SELF_TEST_PASSED')))
    process.stdout.write(`REAL_PACKAGE_SMOKE_OK\n${result.output}`)
  } finally {
    runner.cancel()
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
})
