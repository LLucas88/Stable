'use strict'
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto')
const { toolFile } = require('./tool-files.cjs')
const { deliverySpec, inspectDesignImage } = require('./design-output.cjs')
function imageLinks(answer, workspace) {
  const candidates = []
  for (const match of String(answer).matchAll(/\]\((?:<([^\r\n>]+)>|([^\r\n)]+))\)/g)) {
    let value = match[1] || match[2]
    try { value = decodeURIComponent(value.replace(/^file:\/\/\//, '')) } catch {}
    if (/\.(?:png|jpe?g|webp)$/i.test(value) && !/^https?:/i.test(value)) candidates.push(path.resolve(Array.isArray(workspace) ? workspace[0] : workspace, value))
  }
  return [...new Set(candidates)]
}
function validateDesignDelivery({ answer, policy, workspace, nativeImage }) {
  const spec = deliverySpec(policy), files = imageLinks(answer, workspace), errors = [], results = [], seen = new Set()
  if (files.length !== policy.count) errors.push(`需要 ${policy.count} 张成品，实际提供 ${files.length} 张。`)
  for (const requested of files) {
    try {
      if (requested.endsWith('.source.png')) throw Error('原图预览尚未完成交付适配。')
      const file = toolFile(workspace, requested)
      const key = process.platform === 'win32' ? file.toLowerCase() : file
      if (seen.has(key)) throw Error('重复引用了同一份成品文件。')
      seen.add(key)
      if (fs.statSync(file).size >= spec.maxBytes) throw Error('文件超过交付大小上限。')
      const bytes = fs.readFileSync(file)
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('交付文件必须为 PNG。')
      const measured = inspectDesignImage(nativeImage.createFromBuffer(bytes), spec, bytes)
      results.push({ path: file, ...measured, sha256: createHash('sha256').update(bytes).digest('hex') })
    } catch (error) { errors.push(`${path.basename(requested)}：${error.message}`) }
  }
  return { version: 1, ok: !errors.length, spec, results, errors, files }
}
module.exports = { validateDesignDelivery, imageLinks }
