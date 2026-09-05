'use strict'
// This exact prefix fixes Windows PowerShell 5's ASCII native stdin without
// evaluating any model text in the application process.
const UTF8_PREFIX = '$OutputEncoding = [Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);\n'
const stripUtf8Prefix = script => script.startsWith(UTF8_PREFIX) ? script.slice(UTF8_PREFIX.length) : script
const quote = value => `'${value.replace(/'/g, "''")}'`

function normalizeWindowsCall(spec, args, catalog, python) {
  if (spec.custom || spec.name !== 'shell_command' || typeof args.command !== 'string') return { spec, args }
  let script = stripUtf8Prefix(args.command)
  // Only an entire literal patch wrapper is rewritten, never a mixed command.
  const patch = script.match(/^\s*apply_patch\s+<<'PATCH'\r?\n([\s\S]*?)\r?\nPATCH\s*$/)
    || script.match(/^\s*@'\r?\n([\s\S]*?)\r?\n'@\s*\|\s*apply_patch\s*$/)
  const nativePatch = [...catalog.values()].find(item => item.name === 'apply_patch' && item.custom)
  if (patch && nativePatch && patch[1].startsWith('*** Begin Patch') && patch[1].trimEnd().endsWith('*** End Patch')) return { spec: nativePatch, args: { input: patch[1] } }
  if (patch && !nativePatch) {
    // Some model families expose only shell_command. A single Add File patch
    // maps to exclusive file creation; New-Item without Force never overwrites.
    const add = patch[1].match(/^\*\*\* Begin Patch\r?\n\*\*\* Add File: ([^\r\n]+)\r?\n((?:\+[^\r\n]*(?:\r?\n|$))*)\*\*\* End Patch\s*$/)
    if (add) {
      const content = add[2].split(/\r?\n/).filter((line,index,all)=>index < all.length-1 || line).map(line=>line.slice(1)).join('\n') + '\n'
      script = `New-Item -Path ${quote(add[1])} -ItemType File -Value ${quote(content)} -ErrorAction Stop | Select-Object FullName`
    } else {
      // Pass the patch as one argument, not through the native stdin pipeline.
      script = `apply_patch ${quote(patch[1])}`
    }
  }
  if (python) {
    // Use the shipped isolated runtime for generic inline Python only. Explicit
    // executables, scripts/modules and compound pipelines retain their meaning.
    const inline = script.match(/^(@'\r?\n[\s\S]*?\r?\n'@)\s*\|\s*python(?:\.exe)?\s+(?:-X\s+utf8\s+)?-\s*$/)
    if (inline) script = `${inline[1]} | & ${quote(python)} -I -X utf8 -`
  }
  return { spec, args: { ...args, command: UTF8_PREFIX + script, login: false } }
}
module.exports = { UTF8_PREFIX, stripUtf8Prefix, normalizeWindowsCall }
