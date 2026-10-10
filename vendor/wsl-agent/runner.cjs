'use strict'

// Installed root-owned under /opt/stable-agent. stdin is a control channel,
// never exposed to model commands. Each invocation owns one SRT instance.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { snapshot, planSync, applySync } = require('./workspace-copy.cjs')
const inside = (root, target) => target === root || target.startsWith(root + '/')
const literal = value => ({ path: value, literal: true })
function canonical(value) {
  if (typeof value !== 'string' || !/^\/mnt\/[a-z]\/.+/.test(value) || /[\0\r\n]/.test(value)) throw Error('Invalid task root')
  const resolved = fs.realpathSync(value)
  if (resolved !== path.normalize(value) || !/^\/mnt\/[a-z]\/.+/.test(resolved) || !fs.statSync(resolved).isDirectory()) throw Error('Task directory changed or contains a Linux link')
  return resolved
}
function policy(request, temporary) {
  const reads = request.readableRoots.map(canonical), writes = request.writableRoots.map(canonical), cwd = canonical(request.cwd)
  if (!reads.some(root => inside(root, cwd)) || writes.some(root => !reads.includes(root))) throw Error('Task roots do not match')
  return { cwd, config: {
    network: { allowedDomains: [], deniedDomains: [], allowLocalBinding: false, allowUnixSockets: [], allowAllUnixSockets: false },
    filesystem: {
      denyRead: ['/mnt', '/home', '/root', '/tmp', '/tmp/claude', '/private/tmp/claude', '/var/tmp', '/run', '/init', '/opt/stable-agent'],
      allowRead: [...reads, temporary, '/opt/stable-agent/node', '/opt/stable-agent/node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp'].map(literal),
      allowWrite: [...(request.readOnly ? [] : writes), temporary].map(literal),
      // Mount mandatory child protections before their read-only parents.
      // Otherwise bwrap cannot create a missing child's mount point.
      denyWrite: ['/tmp/claude', '/private/tmp/claude', ...[...new Set([...reads, ...writes])].flatMap(root => ['.git/hooks', '.git/config', '.claude/commands', '.claude/agents', '.git', '.agents', '.claude', '.codex'].map(name => literal(path.join(root, name))))],
    },
    enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false,
  } }
}
async function main() {
  if (process.platform !== 'linux' || process.getuid() === 0) throw Error('Sandbox requires the non-root stable user in WSL2')
  // WSL2 registers binfmt at VM scope, even for a distro with interop disabled.
  // Verify this distro's root-owned policy and session, not the shared entry.
  const wslConfig = fs.readFileSync('/etc/wsl.conf', 'utf8')
  const interop = wslConfig.split(/^\[interop\][ \t]*\r?$/m)[1]?.split(/^\[/m)[0] || ''
  if (!/^enabled\s*=\s*false\s*$/m.test(interop) || !/^appendWindowsPath\s*=\s*false\s*$/m.test(interop) || process.env.WSL_INTEROP) throw Error('Windows interop must be disabled in the StableAgent distribution; restart that distribution after setup')
  const { SandboxManager } = await import('@anthropic-ai/sandbox-runtime')
  if (!SandboxManager.isSupportedPlatform()) throw Error('The official sandbox does not support this Linux environment')
  const dependencies = await SandboxManager.checkDependenciesAsync()
  if (dependencies.errors?.length) throw Error(dependencies.errors.join('\n'))
  if (process.argv.includes('--check')) { console.log(JSON.stringify({ dependenciesReady: true, platform: process.platform, uid: process.getuid(), node: process.version, sandbox: '0.0.79', acceptance: 'Run npm run test:wsl-integration on Windows' })); return }
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let received = false, disconnected = false, child, timer, temporary, statusToken
  const phase = name => { if (statusToken) console.error(`@@STABLE_PHASE:${statusToken}:${name}@@`) }
  const controller = new AbortController()
  const stop = () => { disconnected = true; controller.abort(); if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} } }
  lines.on('close', stop)
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  // One JSON request, bounded before parsing. Further input is never evaluated.
  let bytes = 0
  process.stdin.on('data', chunk => { bytes += chunk.length; if (bytes > 256_000) { stop(); process.exitCode = 1; lines.close() } })
  await new Promise((resolve, reject) => lines.once('line', async line => {
    try {
      if (received || disconnected) throw Error('Closed control channel')
      received = true
      const request = JSON.parse(line)
      if (request.version !== 1 || typeof request.command !== 'string' || !request.command || request.command.length > 100_000 || !Number.isInteger(request.timeoutMs) || request.timeoutMs < 1000 || request.timeoutMs > 600_000 || typeof request.readOnly !== 'boolean' || typeof request.networkAccess !== 'boolean') throw Error('Invalid command request')
      if (/^[a-f0-9-]{36}$/.test(request.statusToken || '')) statusToken = request.statusToken
      temporary = fs.mkdtempSync('/tmp/stable-command-'); fs.chmodSync(temporary, 0o700)
      const { cwd, config } = policy(request, temporary)
      process.chdir(cwd)
      // No inherited Windows/provider keys, proxy overrides, or language loaders.
      for (const key of Object.keys(process.env)) delete process.env[key]
      Object.assign(process.env, { PATH: '/opt/stable-agent/node/bin:/usr/local/bin:/usr/bin:/bin', HOME: temporary, TMPDIR: temporary, CLAUDE_CODE_TMPDIR: temporary, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PYTHONUTF8: '1', NO_COLOR: '1' })
      if (!request.readOnly && !process.argv.includes('--copy-worker')) {
        const check = () => { if (disconnected) throw Error('Task cancelled; command changes were not applied') }
        const roots = [...new Set(request.writableRoots.map(canonical))].sort((a, b) => a.length - b.length).filter((root, index, all) => !all.slice(0, index).some(parent => inside(parent, root)))
        const copies = roots.map((root, index) => snapshot(root, path.join(temporary, 'workspace-' + index), check))
        const args = ['--die-with-parent', '--unshare-user', '--unshare-pid', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--cap-drop', 'ALL']
        for (const copy of copies) args.push('--bind', copy.destination, copy.root)
        args.push('--chdir', cwd, '--', '/opt/stable-agent/node/bin/node', '/opt/stable-agent/runner.cjs', '--copy-worker')
        check()
        child = spawn('/usr/bin/bwrap', args, { env: process.env, detached: true, stdio: ['pipe', 'inherit', 'inherit'] })
        child.stdin.on('error', () => {})
        child.stdin.write(JSON.stringify(request) + '\n')
        const code = await new Promise((done, fail) => { child.once('error', fail); child.once('close', done) })
        check()
        if (code !== 0) { process.exitCode = code ?? 1; console.error('Command failed; Windows workspace changes were not applied.'); resolve(); return }
        phase('sync')
        const plans = copies.map(copy => planSync(copy, check))
        for (const plan of plans) applySync(plan, check)
        resolve(); return
      }
      // Full network authorization is represented by the trusted callback;
      // read-only always denies. Raw network sockets stay in SRT's namespace.
      await SandboxManager.initialize(config, async () => request.networkAccess && !request.readOnly)
      if (disconnected) throw Error('Task cancelled')
      const wrapped = await SandboxManager.wrapWithSandbox(request.command, '/bin/bash', undefined, controller.signal)
      if (disconnected) throw Error('Task cancelled')
      phase('execute')
      child = spawn('/bin/bash', ['--noprofile', '--norc', '-c', wrapped], { cwd, env: process.env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] })
      timer = setTimeout(() => { console.error(`命令执行超过 ${request.timeoutMs} 毫秒，已停止。`); stop() }, request.timeoutMs)
      child.once('error', reject)
      child.once('close', code => { process.exitCode = code ?? 1; resolve() })
    } catch (error) { reject(error) }
  })).finally(async () => {
    phase(process.argv.includes('--copy-worker') ? 'worker-cleanup' : 'cleanup')
    clearTimeout(timer); stop(); lines.close(); process.stdin.destroy()
    await SandboxManager.reset()
    if (temporary && path.dirname(temporary) === '/tmp' && path.basename(temporary).startsWith('stable-command-')) fs.rmSync(temporary, { recursive: true, force: true })
  })
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; process.stdin.destroy() })
module.exports = { policy, canonical }
