'use strict'
const fs = require('node:fs')
const path = require('node:path')
const backup = require('./upgrade-backup.cjs')
const argument = (args, name) => args.find(value => value.startsWith(name + '='))?.slice(name.length + 1)
async function verifyRuntime(options) {
  require('./git-bash-runtime.cjs').verifyGitBash(options)
  const root = options.packaged ? options.resourcesPath : path.resolve(__dirname, '../..')
  const { spawnSync } = require('node:child_process')
  const checks = [
    [path.join(root, 'runtime/node/node.exe'), ['-e', "require('node:sqlite'); process.stdout.write('ok')"]],
    [path.join(root, 'runtime/powershell/pwsh.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "$PSVersionTable.PSVersion.ToString()"]],
    [require('./claude-harness.cjs').runtimePath(options), ['--version']],
  ]
  for (const [executable, args] of checks) {
    const env = { ...process.env }; delete env.NODE_OPTIONS; delete env.NODE_PATH; delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(executable, args, { env, windowsHide: true, encoding: 'utf8', timeout: 30000 })
    if (result.error || result.status !== 0) throw new Error('运行时启动检查失败：' + path.basename(executable))
  }
  await import('@anthropic-ai/claude-agent-sdk')
}
function writeRollbackScript(destination, install, previous, snapshot, userData) {
  install = path.resolve(install); previous = path.resolve(previous)
  if (path.dirname(install) !== path.dirname(previous) || !path.basename(previous).startsWith(path.basename(install) + '.__stable_previous_')) throw new Error('回退程序路径无效')
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  fs.writeFileSync(destination, '\ufeff' + `# Stable upgrade rollback. Run only after closing Stable.\n$ErrorActionPreference = 'Stop'\n$install = ${quote(install)}\n$previous = ${quote(previous)}\nif (!(Test-Path -LiteralPath (Join-Path $previous 'Stable.exe'))) { throw 'Previous Stable executable is missing.' }\n$running = Get-CimInstance Win32_Process -Filter "Name = 'Stable.exe'"\nif ($running) { throw 'Please save your work and close Stable before rollback.' }\n${snapshot ? `$arguments = @('--stable-restore-upgrade', ${quote('--stable-backup=' + snapshot)}, ${quote('--stable-user-data=' + userData)})\n$quoted = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '\n$process = Start-Process -FilePath (Join-Path $install 'Stable.exe') -ArgumentList $quoted -WindowStyle Hidden -Wait -PassThru\nif ($process.ExitCode -ne 0) { throw 'Data restore failed. Program folders were not changed.' }\n` : ''}$failed = $install + '.__stable_failed_rollback-' + [guid]::NewGuid().ToString()\nif ([IO.Path]::GetDirectoryName($failed) -ne [IO.Path]::GetDirectoryName($install)) { throw 'Invalid rollback path.' }\nMove-Item -LiteralPath $install -Destination $failed\ntry { Move-Item -LiteralPath $previous -Destination $install } catch { Move-Item -LiteralPath $failed -Destination $install; throw }\nWrite-Output 'Stable rollback complete. Newer workspace files and the replaced data are retained.'\n`, 'utf8')
}
function maintain({ args, userData, version }) {
  if (args.includes('--stable-restore-upgrade')) {
    const source = argument(args, '--stable-backup')
    if (!source) throw new Error('未指定回退备份')
    return backup.restoreBackup(source, userData)
  }
  const snapshot = backup.prepareUpgrade(userData, version, { force: true })
  const install = argument(args, '--stable-upgrade-install'), previous = argument(args, '--stable-upgrade-previous')
  if (install && previous) writeRollbackScript(path.join(path.dirname(process.execPath), 'Rollback-Stable.ps1'), install, previous, snapshot, userData)
  return snapshot
}
module.exports = { maintain, writeRollbackScript, verifyRuntime }
