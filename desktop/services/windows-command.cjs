'use strict'
// This exact prefix fixes Windows PowerShell 5's ASCII native stdin without
// evaluating any model text in the application process.
const UTF8_PREFIX = '$OutputEncoding = [System.Text.Encoding]::UTF8; if ($ExecutionContext.SessionState.LanguageMode -eq "FullLanguage") { [Console]::InputEncoding = [Console]::OutputEncoding = $OutputEncoding };\n'
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
  // Preserve literal JavaScript through PowerShell 5 native argument quoting.
  // Only rewrite a standalone single-quoted -e argument, never mixed commands.
  const nodeEval = script.match(/^\s*(node(?:\.exe)?)\s+-e\s+'((?:[^']|'')*)'\s*$/i)
  if (nodeEval && !nodeEval[2].startsWith("eval(Buffer.from(''")) {
    const source = nodeEval[2].replace(/''/g, "'")
    const encoded = Buffer.from(source, 'utf8').toString('base64')
    script = nodeEval[1] + ' -e ' + quote("eval(Buffer.from('" + encoded + "','base64').toString('utf8'))")
  }
  // PowerShell 5 can emit a UTF-8 BOM even when Python uses -X utf8.
  // Decode only a recognized Python stdin invocation; keep all source text and
  // execution inside the sandbox, not in the Electron process.
  const stdinPython = /(^[ \t]*(?:['"]@|\$[a-zA-Z_]\w*)\s*\|\s*)([&]\s+(?:\$[a-zA-Z_]\w*|'[^'\r\n]*python(?:\.exe)?'|"[^"\r\n]*python(?:\.exe)?")|python(?:\.exe)?)(\s+(?:-I\s+)?(?:-X\s+utf8\s+)?)\-\s*$/im
  const match = script.match(stdinPython)
  if (match) {
    const executable = match[2]
    const variable = executable.match(/\$([a-zA-Z_]\w*)$/)
    const known = !variable || new RegExp('\\$' + variable[1] + '\\s*=\\s*[\"\'][^\"\'\\r\\n]*python(?:\\.exe)?[\"\']', 'i').test(script)
    if (known) {
      const decoder = "import sys; exec(compile(sys.stdin.buffer.read().decode('utf-8-sig').lstrip(chr(65279)), '<stdin>', 'exec'))"
      script = script.replace(stdinPython, (_whole, head, exe, flags) => head + exe + flags + '-c ' + quote(decoder))
    }
  }
  return { spec, args: { ...args, command: UTF8_PREFIX + script, login: false } }
}
module.exports = { UTF8_PREFIX, stripUtf8Prefix, normalizeWindowsCall }
