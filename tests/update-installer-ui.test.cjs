'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const customInstaller = readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8')
const installer = readFileSync(path.join(root, 'build', 'installer.nsi'), 'utf8')
const installSection = readFileSync(path.join(root, 'build', 'stable-install-section.nsh'), 'utf8')
const updateConfig = require('../build/update-builder.config.cjs')

test('update installer overrides legacy silent parameters and uses one progress window', () => {
  assert.match(customInstaller, /GetOptions[^\n]+--updated/)
  assert.match(customInstaller, /SetSilent normal/)
  assert.match(customInstaller, /--stable-update-quiet/)
  assert.equal(updateConfig.nsis.oneClick, false)
  assert.equal(updateConfig.nsis.runAfterFinish, false)
  assert.equal(updateConfig.nsis.allowToChangeInstallationDirectory, true)
  assert.match(customInstaller, /customInstallMode[\s\S]+hasPerMachineInstallation[\s\S]+\$INSTDIR == \$perMachineInstallationFolder[\s\S]+isForceMachineInstall[\s\S]+isForceCurrentInstall/)
})

test('installation progress is stage-based, percentage-labelled, and cannot be closed mid-update', () => {
  for (const marker of [
    '"4" "preparing"',
    '"10" "staging"',
    '"55" "staging"',
    '"62" "runtime"',
    '"68" "runtime" "running"',
    '"70" "stopping"',
    '"76" "switching"',
    '"82" "switching"',
    '"86" "switching" "running"',
    '"88" "healthcheck"',
    '"94" "healthcheck" "running"',
    '"95" "finalizing"',
    '"100" "complete" "success"',
  ]) assert.ok(installSection.includes(marker), `missing progress marker ${marker}`)
  assert.match(installer, /\$stableProgressPercent%/)
  assert.match(installer, /CreateWindowEx[\s\S]+msctls_progress32/)
  assert.match(installer, /SendMessage \$stableProgressBar 0x0406 0 100/)
  assert.match(installer, /SendMessage \$stableProgressBar 0x0402 \$stableProgressPercent 0/)
  assert.match(installer, /StrCmp \$R7 0 stableProgressPageDone[\s\S]+ShowWindow \$R8 \$\{SW_HIDE\}/)
  assert.match(installer, /Function stableAbortGuard[\s\S]+\$stableUpdateCanClose != "true"[\s\S]+Abort/)
  assert.match(installer, /!define MUI_CUSTOMFUNCTION_ABORT stableAbortGuard/)
})

test('successful updates finish shortcuts before 100 percent and never auto-launch', () => {
  const shortcutIndex = installSection.indexOf('!insertmacro addDesktopLink')
  const completeIndex = installSection.indexOf('stableReportProgress "100" "complete" "success"')
  const updateExitIndex = installSection.indexOf('!insertmacro quitSuccess', completeIndex)
  const startMacroIndex = installSection.indexOf('!macro doStartApp')
  assert.ok(shortcutIndex >= 0 && completeIndex > shortcutIndex)
  assert.ok(updateExitIndex > completeIndex && startMacroIndex > updateExitIndex)
  assert.doesNotMatch(installSection, /Exec\s+'"\$appExe"'/)
})

test('failed update paths distinguish successful rollback from rollback failure', () => {
  assert.match(installSection, /healthcheck_rollback" "failed_rolled_back" "12"/)
  assert.match(installSection, /rollback_failed" "failed" "1[5-9]"/)
  assert.match(installSection, /stableRuntimeRestoreBeforeSwapFailed:/)
  assert.match(installSection, /stableSwapRollback:[\s\S]+Rename "\$stableRuntimeDir"[\s\S]+IfErrors stableSwapRuntimeRestoreFailed/)
  assert.match(installSection, /stableSwapRuntimeRestoreFailed:[\s\S]+"20"/)
  assert.match(installer, /旧版本已恢复/)
  assert.match(installer, /Abort "\$stableProgressPercent% · \$\{message\}（E\$\{code\}）"/)
})
