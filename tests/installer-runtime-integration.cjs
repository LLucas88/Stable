'use strict'

// Execute the production NSIS dispatch/migration/rollback code in a private tree.
// Payload extraction, registry/shortcut writes and stopping user processes are stubbed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync, spawn } = require('node:child_process')
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
  const locker = path.join(root, 'lock-stage.ps1')
  fs.writeFileSync(locker, `$ErrorActionPreference='Stop'\n$taskRoot=$env:STABLE_TEST_ROOT\n$file=Join-Path $taskRoot 'App.__stable_next_0.91.7/resources/app.asar'\n$deadline=[DateTime]::UtcNow.AddSeconds(20)\nwhile(!(Test-Path -LiteralPath $file)){if([DateTime]::UtcNow -gt $deadline){throw 'Stage did not appear'};Start-Sleep -Milliseconds 20}\n$handle=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)\ntry{[IO.File]::WriteAllText((Join-Path $taskRoot 'stage-locked'),'locked');Start-Sleep -Milliseconds ([int]$env:STABLE_TEST_STAGE_LOCK)}finally{$handle.Dispose()}\n`)
  const health = compile('health', `!include LogicLib.nsh
!include FileFunc.nsh
Section
\u0024{GetParameters} $1
\u0024{GetOptions} $1 "--stable-upgrade-backup" $2
\u0024{IfNot} \u0024{Errors}
ReadEnvStr $3 "STABLE_TEST_STAGE_LOCK"
\u0024{If} $3 != "0"
ReadEnvStr $4 "STABLE_TEST_ROOT"
StrCpy $5 0
\u0024{Do}
IfFileExists "$4\\stage-locked" stageLockReady
Sleep 20
IntOp $5 $5 + 1
\u0024{LoopUntil} $5 >= 1000
SetErrorLevel 99
Quit
stageLockReady:
\u0024{EndIf}
ReadEnvStr $0 "STABLE_TEST_BACKUP_EXIT"
SetErrorLevel $0
Quit
\u0024{EndIf}
ReadEnvStr $0 "STABLE_TEST_HEALTH_EXIT"
SetErrorLevel $0
SectionEnd`)
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
    { name: 'repeated-upgrade-retains-backups', full: true, old: true, runtime: 'embedded', priorBackup: true, code: 0 },
    { name: 'full-manual-upgrade', full: true, old: true, runtime: 'embedded', code: 0 },
    { name: 'full-manual-rollback', full: true, old: true, runtime: 'embedded', healthExit: 4, code: 12 },
    { name: 'transient-stage-lock-upgrade', full: true, old: true, runtime: 'embedded', stageLock: 1500, code: 0 },
    { name: 'transient-stage-lock-rollback', full: true, old: true, runtime: 'embedded', stageLock: 1500, healthExit: 4, code: 12 },
    { name: 'persistent-stage-lock-retains-old', full: true, old: true, runtime: 'embedded', stageLock: 7000, code: 13 },
    { name: 'backup-failure-retains-old', full: true, old: true, runtime: 'embedded', backupExit: 25, code: 25 },
    { name: 'full-manual-fresh-accepted', full: true, fresh: true, code: 0 },
    { name: 'full-updated-wrong-path-rejected', full: true, updated: true, code: 21 },
    { name: 'in-app-missing-runtime', old: true, updated: true, code: 11 },
    { name: 'manual-rollback', old: true, runtime: 'embedded', healthExit: 4, code: 12 },
    { name: 'in-app-rollback', old: true, updated: true, runtime: 'embedded', healthExit: 4, code: 12 },
    { name: 'rollback-with-stale-longpath-failure', old: true, updated: true, runtime: 'embedded', healthExit: 4, staleFailure: true, code: 12 },
  ]) {
    const home = path.join(root, scenario.name)
    const app = path.join(home, 'App')
    const persistent = path.join(home, 'runtime-v1')
    const embedded = path.join(app, 'resources', 'runtime')
    fs.mkdirSync(home)
    const sentinel = path.join(home, 'user-data-sentinel')
    fs.writeFileSync(sentinel, 'preserve-user-data')
    if (scenario.priorBackup) {
      fs.mkdirSync(path.join(home, 'App.__stable_previous_0.91.7'));
      fs.writeFileSync(path.join(home, 'App.__stable_previous_0.91.7', 'original.txt'), 'retained-original')
    }
    if (scenario.staleFailure) {
      const retained = path.join(home, 'App.__stable_failed_0.91.7', ...Array(12).fill('long-resource-directory'), 'retained.txt')
      fs.mkdirSync(path.dirname(retained), { recursive: true })
      fs.writeFileSync(retained, 'prior-failure-evidence')
      fs.chmodSync(retained, 0o444)
    }
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
    const runEnv = { ...env, STABLE_TEST_ROOT: home, STABLE_RUNTIME_HOME: persistent, STABLE_TEST_HEALTH_EXIT: String(scenario.healthExit || 0), STABLE_TEST_BACKUP_EXIT: String(scenario.backupExit || 0), STABLE_TEST_STAGE_LOCK: String(scenario.stageLock || 0) }
    const lockDone = scenario.stageLock ? new Promise((resolve, reject) => {
      const process = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', locker], { env: runEnv, windowsHide: true, stdio: 'ignore' })
      process.once('error', reject); process.once('exit', code => code === 0 ? resolve() : reject(new Error('Stage lock fixture failed: ' + code)))
    }) : Promise.resolve()
    const result = spawnSync(scenario.full ? full : light, scenario.updated ? ['--updated', '/S'] : ['/S'], {
      cwd: home, windowsHide: true, encoding: 'utf8', timeout: 30000,
      env: runEnv,
    })
    await lockDone
    assert.equal(result.error, undefined, result.error?.message)
    assert.equal(result.status, scenario.code, `${scenario.name}: ${result.stderr}`)
    const progressFile = path.join(home, 'progress.log')
    const progress = fs.existsSync(progressFile) ? fs.readFileSync(progressFile, 'utf8').trim().split(/\r?\n/).map(line => Number(line.split('|')[0])) : []
    assert(progress.every((value, index) => index === 0 || value >= progress[index - 1]), `${scenario.name}: progress must not go backwards`)
    assert.equal(fs.existsSync(path.join(home, 'legacy-uninstall-called')), Boolean(scenario.fresh), `${scenario.name}: installer dispatch`)
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve-user-data')
    if (scenario.fresh) {
      assert.equal(fs.readFileSync(path.join(app, 'resources/app.asar'), 'utf8'), 'new-app')
      assert.equal(fs.existsSync(path.join(app, 'Stable.exe')), true)
    } else if (scenario.code === 0) {
      assert.equal(fs.readFileSync(path.join(persistent, 'node/node.exe'), 'utf8'), 'runtime-sentinel')
      assert.equal(fs.readFileSync(path.join(persistent, 'dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'), 'utf8'), 'runtime-sentinel')
      assert.equal(fs.readFileSync(path.join(app, 'resources/app.asar'), 'utf8'), 'new-app')
    } else if (scenario.old) {
      assert.equal(fs.readFileSync(path.join(app, 'Stable.exe'), 'utf8'), 'old-executable')
      if (scenario.healthExit) assert.equal(fs.readFileSync(path.join(embedded, 'node/node.exe'), 'utf8'), 'runtime-sentinel')
    } else {
      assert.equal(fs.existsSync(app), false, 'invalid target must stay untouched')
    }
    if (scenario.priorBackup) {
      assert.equal(fs.readFileSync(path.join(home, 'App.__stable_previous_0.91.7/original.txt'), 'utf8'), 'retained-original')
      assert.equal(fs.readFileSync(path.join(home, 'App.__stable_previous_0.91.7-1/Stable.exe'), 'utf8'), 'old-executable')
    }
    results.push(scenario.name)
  }
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ passed: results }, null, 2))
  console.log(`INSTALLER_RUNTIME_PASS ${results.length} scenarios\n${root}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
