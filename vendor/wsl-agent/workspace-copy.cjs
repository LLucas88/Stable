'use strict'

// Writable DrvFS bind mounts are unsafe for path-based deny mounts: .CLAUDE
// can alias .claude. Commands therefore write ext4 copies; only checked regular
// file changes return to Windows. The original Windows trees stay read-only.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const MAX_FILES = 20000, MAX_BYTES = 512 * 1024 * 1024
const protectedNames = new Set(['.git', '.agents', '.claude', '.codex', '.vscode', '.idea', '.gitconfig', '.gitmodules', '.bashrc', '.bash_profile', '.zshrc', '.zprofile', '.profile', '.ripgreprc', '.mcp.json'])
const protectedPath = relative => relative.split('/').some(part => protectedNames.has(part.toLowerCase()))
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function inventory(root, check = () => {}) {
  const entries = new Map(); let bytes = 0
  function walk(relative) {
    check()
    const file = path.join(root, relative), stat = fs.lstatSync(file)
    if (entries.size >= MAX_FILES) throw Error('Command workspace exceeds 20000 entries; choose a smaller directory or use native file tools')
    if (stat.isSymbolicLink()) entries.set(relative, { type: 'link', target: fs.readlinkSync(file) })
    else if (stat.isDirectory()) {
      entries.set(relative, { type: 'directory' })
      for (const name of fs.readdirSync(file)) walk(relative ? relative + '/' + name : name)
    } else if (stat.isFile()) {
      bytes += stat.size
      if (bytes > MAX_BYTES) throw Error('Command workspace exceeds 512 MiB; choose a smaller directory or use native file tools')
      entries.set(relative, { type: 'file', hash: hash(file), mode: stat.mode & 0o777 })
    } else throw Error('Unsupported special file in command workspace: ' + relative)
  }
  walk(''); return entries
}
function same(left, right) {
  if (!left || !right) return left === right
  return left.type === right.type && left.hash === right.hash && left.target === right.target
}
function snapshot(root, destination, check) {
  const before = inventory(root, check)
  fs.cpSync(root, destination, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true })
  const copied = inventory(destination, check), after = inventory(root, check)
  if (before.size !== copied.size || before.size !== after.size || [...before].some(([name, entry]) => !same(entry, copied.get(name)) || !same(entry, after.get(name)))) throw Error('Workspace changed while preparing command; retry after other writes finish')
  return { root, destination, before }
}
function validateName(relative) {
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..' || /[<>:"\\|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw Error('Command produced a name that cannot safely sync to Windows: ' + relative)
  }
}
function planSync(copy, check) {
  const current = inventory(copy.destination, check), original = inventory(copy.root, check)
  const cases = [current, original].map(entries => {
    const map = new Map()
    for (const name of entries.keys()) { const key = name.toLowerCase(); if (!map.has(key)) map.set(key, new Set()); map.get(key).add(name) }
    return map
  })
  const changes = []
  for (const name of new Set([...copy.before.keys(), ...current.keys()])) {
    if (!name || same(copy.before.get(name), current.get(name))) continue
    validateName(name)
    if (protectedPath(name)) throw Error('Command changed a protected rule or Git path; no command changes were applied: ' + name)
    if (!same(copy.before.get(name), original.get(name))) throw Error('Windows workspace changed during command; no command changes were applied: ' + name)
    const next = current.get(name), previous = copy.before.get(name)
    if (next?.type === 'link' || previous?.type === 'link') throw Error('Command symlink changes cannot be synced to Windows: ' + name)
    if (next && previous && next.type !== previous.type) throw Error('Command cannot replace a file with a directory or vice versa: ' + name)
    // Windows aliases cannot turn two distinct Linux entries into one target.
    for (const candidate of cases) if ([...(candidate.get(name.toLowerCase()) || [])].some(other => other !== name)) throw Error('Case-colliding command output cannot be synced to Windows: ' + name)
    if (previous?.type === 'file' && fs.lstatSync(path.join(copy.root, name)).nlink > 1) throw Error('Hard-linked Windows files cannot be changed by a command: ' + name)
    changes.push({ name, next, previous })
  }
  // Reject deletion of a directory containing new concurrently-created files.
  for (const { name, next, previous } of changes) if (!next && previous.type === 'directory') {
    for (const [other, entry] of original) if (other.startsWith(name + '/') && !same(entry, copy.before.get(other))) throw Error('Windows directory changed during command: ' + name)
  }
  return { ...copy, changes }
}
function applySync(plan, check) {
  // All copies are prevalidated before any are applied. Recheck each path just
  // before I/O; native file hooks have the same remaining concurrent-open race.
  const sorted = [...plan.changes].sort((a, b) => a.next && !b.next ? -1 : !a.next && b.next ? 1 : a.next ? a.name.length - b.name.length : b.name.length - a.name.length)
  for (const change of sorted) {
    check()
    const target = path.join(plan.root, change.name), source = path.join(plan.destination, change.name)
    if (fs.realpathSync(plan.root) !== plan.root) throw Error('Workspace root changed before sync')
    const parent = path.dirname(target)
    if (fs.realpathSync(parent) !== parent) throw Error('Workspace parent became a link before sync')
    let stat
    try { stat = fs.lstatSync(target) } catch (error) { if (error.code !== 'ENOENT') throw error }
    const actual = !stat ? undefined : stat.isSymbolicLink() ? { type: 'link', target: fs.readlinkSync(target) } : stat.isDirectory() ? { type: 'directory' } : { type: 'file', hash: hash(target) }
    if (!same(actual, change.previous)) throw Error('Windows workspace changed before applying command output: ' + change.name)
    if (!change.next) { if (stat.isDirectory()) fs.rmdirSync(target); else fs.unlinkSync(target) }
    else if (change.next.type === 'directory') fs.mkdirSync(target)
    else {
      // O_NOFOLLOW also rejects a final-component link replacement.
      const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, change.next.mode)
      try { fs.writeFileSync(fd, fs.readFileSync(source)) } finally { fs.closeSync(fd) }
    }
  }
}
module.exports = { snapshot, planSync, applySync, inventory, protectedPath }
