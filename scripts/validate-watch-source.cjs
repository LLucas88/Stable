'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function validateWatchSources(files, { checkJavaScript = file => spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true }) } = {}) {
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue
      if (/\.json$/i.test(file)) {
        // CommonJS JSON loading accepts a leading UTF-8 BOM, but not comments
        // or trailing commas. Match that rule without executing application code.
        const contents = fs.readFileSync(file, 'utf8')
        try { JSON.parse(contents.charCodeAt(0) === 0xFEFF ? contents.slice(1) : contents) }
        catch { return { ok: false, file, detail: `${path.basename(file)} 不是有效的 JSON。` } }
      } else if (/\.(cjs|js)$/i.test(file)) {
        const result = checkJavaScript(file)
        if (result.status !== 0) return { ok: false, file, detail: result.stderr || result.error?.message || `${path.basename(file)} 语法检查失败。` }
      }
    } catch (error) { return { ok: false, file, detail: `${path.basename(file)} 无法检查（${error.code || '读取失败'}）。` } }
  }
  return { ok: true }
}

module.exports = { validateWatchSources }
