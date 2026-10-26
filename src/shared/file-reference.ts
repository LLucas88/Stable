export function parseFileReference(value: string, label?: string) {
  let reference = value.trim().replace(/^<|>$/g, '')
  try { reference = decodeURIComponent(reference) } catch { /* Preserve malformed literal percent signs. */ }
  reference = reference.replace(/^file:\/\/\/(?=[a-z]:)/i, '').replace(/^file:\/\//i, '')
  const match = reference.match(/^(.*?)(?::([1-9]\d*)(?::([1-9]\d*))?|#L([1-9]\d*)(?:C([1-9]\d*))?)?$/)
  if (!match) return null
  const path = match[1]
  if (!/^(?:[a-z]:[\\/]|\\\\[^\\]+\\|\/(?!\/))/i.test(path) || !/\.[a-z0-9]{1,15}$/i.test(path) || /[\r\n<>|"?*]/.test(path)) return null
  const name = path.split(/[\\/]/).pop()!
  const line = match[2] || match[4], column = match[3] || match[5]
  const suffix = line ? ` (line ${line}${column ? `:${column}` : ''})` : ''
  const shortLabel = !label || label === value || /^(?:[a-z]:[\\/]|file:\/\/|\/(?!\/))/i.test(label) ? name : label
  return { path, name, label: shortLabel + (suffix && !shortLabel.endsWith(suffix) ? suffix : ''), extension: name.split('.').pop()!.toLowerCase(), key: path.replace(/\//g, '\\').toLowerCase(), reference }
}
