'use strict'
const fs = require('node:fs')
const path = require('node:path')

// Source-contract tests follow extracted modules; renderer fixtures inline CSS
// imports because insertCSS/<style> do not resolve them from the source folder.
function readSource(file, encoding = 'utf8') {
  const text = fs.readFileSync(file, encoding)
  const normalized = String(file).replace(/\\/g, '/')
  if (normalized.endsWith('.css')) {
    return text.replace(/@import ['"]([^'"]+)['"];\s*/g, (_, name) => readSource(path.resolve(path.dirname(file), name), encoding))
  }
  let dependencies = []
  if (normalized.endsWith('/src/App.tsx')) {
    dependencies = [...text.matchAll(/from ['"](\.\/(?:pages|settings|components|shared)\/[^'"]+)['"]/g)]
      .map(([, name]) => ['.tsx', '.ts'].map(ext => path.resolve(path.dirname(file), name + ext)).find(fs.existsSync))
  } else if (normalized.endsWith('/desktop/main.cjs')) {
    dependencies = [...text.matchAll(/require\(['"](\.\/ipc\/[^'"]+)['"]\)/g)].map(([, name]) => path.resolve(path.dirname(file), name))
  }
  return [text, ...[...new Set(dependencies)].map(dep => fs.readFileSync(dep, encoding))].join('\n')
}

module.exports = { readSource }
