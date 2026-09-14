'use strict'
const { createHash } = require('node:crypto')

// Decode runtime display quoting only to fingerprint referenced files.
function splitDisplayCommand(command) {
  const args = []; let value = ''; let quote = ''; let started = false
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (c === '\\' && quote !== "'" && (quote !== '"' || /[\\"$`\n]/.test(command[i + 1] || ''))) {
      if (++i >= command.length) return null
      value += command[i]; started = true
    } else if (quote) { if (c === quote) quote = ''; else value += c }
    else if (c === '"' || c === "'") { quote = c; started = true }
    else if (/\s/.test(c)) { if (started) { args.push(value); value = ''; started = false } }
    else { value += c; started = true }
  }
  if (quote) return null
  if (started) args.push(value)
  return args
}

function approvalScope(method, params, assessment, execution = {}) {
  // Legacy category metadata only preserves the grant format; it never routes approvals.
  const metadata = new Set(['threadId', 'turnId', 'itemId', 'callId', 'startedAtMs', 'reason', 'commandActions', 'availableDecisions', 'proposedExecpolicyAmendment'])
  // Grants remain bound to exact arguments and execution context.
  const stableParams = Object.fromEntries(Object.entries(params).filter(([key]) => !metadata.has(key)))
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
  const fs = require('node:fs'), path = require('node:path')
  const hashFile = target => { const hash=createHash('sha256'),buffer=Buffer.alloc(64*1024),fd=fs.openSync(target,'r');try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));return hash.digest('hex')}finally{fs.closeSync(fd)} }
  const fingerprints = []
  if(execution.cliProfile){try{for(const name of fs.readdirSync(execution.cliProfile).sort().filter(n=>/\.(json|toml|ini|yaml|yml)$/i.test(n))){const file=path.join(execution.cliProfile,name);if(fs.statSync(file).isFile())fingerprints.push(['cli-context',name,hashFile(file)])}}catch{fingerprints.push(['cli-context','unavailable'])}}
  const command = String(params.command || '')
  const seen = new Set()
  // Include the decoded script when the shell display quotes the entire command.
  const fingerprintInput = [command, ...(splitDisplayCommand(command) || [])].join('\n')
  for (const match of fingerprintInput.matchAll(/(?:"([^"\r\n]+\.(?:py|ps1|js|cjs|sh|exe))"|'([^'\r\n]+\.(?:py|ps1|js|cjs|sh|exe))'|([^\s"']+\.(?:py|ps1|js|cjs|sh|exe)))/gi)) {
    const target=path.resolve(params.cwd || execution.workspace || '.',match[1]||match[2]||match[3])
    if (seen.has(target)) continue
    seen.add(target)
    try { const stat=fs.statSync(target); fingerprints.push([fs.realpathSync(target),stat.ino,stat.mtimeMs,stat.size,hashFile(target)]) } catch { fingerprints.push([target,'unavailable']) }
  }
  let directory
  try { const stat=fs.statSync(execution.workspace || params.cwd);directory=[stat.dev,stat.ino,stat.birthtimeMs] } catch { directory='unavailable' }
  const value = JSON.stringify(canonical({ method, params: stableParams, category: assessment.category, execution, fingerprints, directory }))
  return { key: createHash('sha256').update(`v3:${value}`).digest('hex'), label: assessment.categoryLabel ? assessment.categoryLabel+'（相同命令、参数和访问范围）' : '相同命令、参数和访问范围' }
}

// Approval routing follows the selected mode, without classifying commands.
function canAutoApprove(mode) { return mode === 'full' }
module.exports = { approvalScope, canAutoApprove }
