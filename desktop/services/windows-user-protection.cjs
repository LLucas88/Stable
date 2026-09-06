'use strict'

const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Input and output travel through private pipes, never command-line arguments.
// CurrentUser DPAPI does not depend on an Electron profile's Local State key.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $bytes = [Convert]::FromBase64String($request.data)
  $entropy = [Text.Encoding]::UTF8.GetBytes('Stable/local-model/v2')
  if ($request.operation -eq 'protect') {
    $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  } elseif ($request.operation -eq 'unprotect') {
    $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  } else { exit 2 }
  [Console]::Out.Write([Convert]::ToBase64String($result))
} catch { exit 1 }
`

function transform(operation, bytes) {
  if (process.platform !== 'win32') throw new Error('本地 Windows 用户加密配置只能在 Windows 上使用。')
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    input: JSON.stringify({ operation, data: bytes.toString('base64') }),
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024,
  })
  if (result.error || result.status !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.stdout || '')) {
    throw new Error('Windows 用户加密操作失败；请在本机当前账号下重新配置。')
  }
  return Buffer.from(result.stdout, 'base64')
}

const windowsUserProtection = {
  encryptString: value => transform('protect', Buffer.from(value, 'utf8')),
  decryptString: value => transform('unprotect', value).toString('utf8'),
}

module.exports = { windowsUserProtection }