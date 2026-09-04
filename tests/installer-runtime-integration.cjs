'use strict'

// Execute the production NSIS dispatch/migration/rollback code in a private tree.
// Payload extraction, registry/shortcut writes and stopping user processes are stubbed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows')

async function main() {
  assert.equal(process.platform, 'win32')
  const project = path.resolve(__dirname, '..')
  const artifacts = path.join(project, 'qa-artifacts')
  fs.mkdirSync(artifacts, { recursive: true })
  const root = fs.mkdtempSync(path.join(artifacts, 'installer-runtime-'))
  const source = fs.readFileSync(process.argv[2] || path.join(project, 'build/stable-install-section.nsh'), 'utf8')
  const start = source.indexOf('Var /GLOBAL keepShortcuts')
  const end = source.indexOf('stablePostInstall:')
  assert.ok(start >= 0 && end > start)
  const section = source.slice(start, end)
  const compiler = await getMakeNsisPath()
  const env = { ...process.env, ...compiler.env }
  function checked(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 120000, ...options })
    assert.equal(result.error, undefined, result.error?.message)
    assert.equal(result.status, 0, result.stdout + result.stderr)
  }
  function compile(name, body) {
    const script = path.join(root, `${name}.nsi`)
    fs.writeFileSync(script, `Unicode true\nRequestExecutionLevel user\nSilentInstall silent\nOutFile "${root}\\${name}.exe"\n${body}`, 'utf8')
    checked(compiler.path, ['/V2', '/INPUTCHARSET', 'UTF8', script])
    return path.join(root, `${name}.exe`)
  }
  const health = compile('health', `Section\nReadEnvStr $0 "STABLE_TEST_HEALTH_EXIT"\nSetErrorLevel $0\nSectionEnd`)
  function fixture(lightweight) {
    return compile(lightweight ? 'lightweight' : 'full', `
!include LogicLib.nsh
!include FileFunc.nsh
${lightweight ? '!define STABLE_LIGHTWEIGHT_UPDATE' : ''}
!define APP_EXECUTABLE_FILENAME "Stable.exe"
!define UNINSTALL_FILENAME "Uninstall Stable.exe"
!define INSTALL_REGISTRY_KEY "Software\\Stable-Isolated-Read-Only-QA"
!define VERSION "0.91.7"
!define isUpdated '$updated == "true"'
Var updated
Var taskRoot
Var appExe
Var installMode
Var isTryToKeepShortcuts
!macro setIsTryToKeepShortcuts
  StrCpy $isTryToKeepShortcuts "false"
!macroend
!macro setLinkVars
!macroend
!macro stableReportProgress percent stage status code
  FileOpen $8 "$taskRoot\\progress.log" a
  FileWrite $8 "\u0024{percent}|\u0024{stage}|\u0024{status}|\u0024{code}$\\r$\\n"
  FileClose $8
!macroend
!macro stableStopUpdate code message
  SetErrorLevel \u0024{code}
  Quit
!macroend
!macro uninstallOldVersion key
  FileOpen $8 "$taskRoot\\legacy-uninstall-called" w
  FileClose $8
!macroend
!macro handleUninstallResult key
!macroend
Function stableCheckAppRunning
FunctionEnd
Function stableInstallApplicationFiles
  SetOutPath "$OUTDIR\\resources"
  FileOpen $8 "$OUTDIR\\app.asar" w
  FileWrite $8 "new-app"
  FileClose $8
  SetOutPath "$OUTDIR\\.."
  File /oname=Stable.exe "${health}"
FunctionEnd
Section
  ReadEnvStr $taskRoot "STABLE_TEST_ROOT"
  StrCpy $INSTDIR "$taskRoot\\App"
  StrCpy $appExe "$INSTDIR\\Stable.exe"
  StrCpy $installMode "CurrentUser"
  StrCpy $updated "false"
  \u0024{GetParameters} $0
  ClearErrors
  \u0024{GetOptions} $0 "--updated" $1
  \u0024{IfNot} \u0024{Errors}
    StrCpy $updated "true"
  \u0024{EndIf}
  ${section}
stablePostInstall:
  SetErrorLevel 0
SectionEnd
Section "Uninstall"
SectionEnd
`)
  }
  const light = fixture(true)
  const full = fixture(false)
  const results = []
  for (const scenario of [
    { name: 'in-app-wrong-path-rejected', updated: true, code: 21 },
    { name: 'manual-embedded', old: true, runtime: 'embedded', code: 0 },
    { name: 'manual-persistent', old: true, runtime: 'persistent', code: 0 },
    { name: 'in-app-embedded', old: true, updated: true, runtime: 'embedded', code: 0 },
    { name: 'in-app-persistent', old: true, updated: true, runtime: 'persistent', code: 0 },
    { name: 'manual-fresh-rejected', code: 21 },
    { name: 'full-updated-wrong-path-rejected', full: true, updated: true, code: 21 },
    { name: 'in-app-missing-runtime', old: true, updated: true, code: 11 },
    { name: 'manual-rollback', old: true, runtime: 'embedded', healthExit: 4, code: 12 },
    { name: 'in-app-rollback', old: true, updated: true, runtime: 'embedded', healthExit: 4, code: 12 },
  ]) {
    const home = path.join(root, scenario.name)
    const app = path.join(home, 'App')
    const persistent = path.join(home, 'runtime-v1')
    const embedded = path.join(app, 'resources', 'runtime')
    fs.mkdirSync(home)
    const sentinel = path.join(home, 'user-data-sentinel')
    fs.writeFileSync(sentinel, 'preserve-user-data')
    if (scenario.old) {
      fs.mkdirSync(app)
      fs.writeFileSync(path.join(app, 'Stable.exe'), 'old-executable')
    }
    if (scenario.runtime) {
      const runtime = scenario.runtime === 'persistent' ? persistent : embedded
      for (const relative of ['node/node.exe', 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js']) {
        const target = path.join(runtime, relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, 'runtime-sentinel')
      }
    }
    const result = spawnSync(scenario.full ? full : light, scenario.updated ? ['--updated', '/S'] : ['/S'], {
      cwd: home, windowsHide: true, encoding: 'utf8', timeout: 30000,
      env: { ...env, STABLE_TEST_ROOT: home, STABLE_RUNTIME_HOME: persistent, STABLE_TEST_HEALTH_EXIT: String(scenario.healthExit || 0) },
    })
    assert.equal(result.error, undefined, result.error?.message)
    assert.equal(result.status, scenario.code, `${scenario.name}: ${result.stderr}`)
    assert.equal(fs.existsSync(path.join(home, 'legacy-uninstall-called')), false, `${scenario.name}: must not uninstall`)
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve-user-data')
    if (scenario.code === 0) {
      assert.equal(fs.readFileSync(path.join(persistent, 'node/node.exe'), 'utf8'), 'runtime-sentinel')
      assert.equal(fs.readFileSync(path.join(persistent, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'), 'utf8'), 'runtime-sentinel')
      assert.equal(fs.readFileSync(path.join(app, 'resources/app.asar'), 'utf8'), 'new-app')
    } else if (scenario.old) {
      assert.equal(fs.readFileSync(path.join(app, 'Stable.exe'), 'utf8'), 'old-executable')
      if (scenario.healthExit) assert.equal(fs.readFileSync(path.join(embedded, 'node/node.exe'), 'utf8'), 'runtime-sentinel')
    } else {
      assert.equal(fs.existsSync(app), false, 'invalid target must stay untouched')
    }
    results.push(scenario.name)
  }
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ passed: results }, null, 2))
  console.log(`INSTALLER_RUNTIME_PASS ${results.length} scenarios\n${root}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
