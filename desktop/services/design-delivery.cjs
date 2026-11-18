'use strict'
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto')
const { toolFile } = require('./tool-files.cjs')
const { deliverySpec, inspectDesignImage } = require('./design-output.cjs')
function imageLinks(answer, workspace) {
  const candidates = []
  for (const match of String(answer).matchAll(/\]\((?:<([^\r\n>]+)>|([^\r\n)]+))\)/g)) {
    let value = match[1] || match[2]
    try { value = decodeURIComponent(value.replace(/^file:\/\/\//, '')) } catch {}
    if (/\.(?:png|jpe?g|webp|svg|gif)$/i.test(value) && !/^https?:/i.test(value)) candidates.push(path.resolve(Array.isArray(workspace) ? workspace[0] : workspace, value))
  }
  return [...new Set(candidates)]
}
async function validateDesignDelivery({ answer, policy, workspace, nativeImage }) {
  const spec = deliverySpec(policy), files = imageLinks(answer, workspace), errors = [], results = [], seen = new Set()
  if (files.length !== policy.count) errors.push(`需要 ${policy.count} 张成品，实际提供 ${files.length} 张。`)
  for (const requested of files) {
    try {
      if (/\.source\.(png|jpe?g|webp|gif|svg)$/i.test(requested)) throw Error('原图预览尚未完成交付适配。')
      const file = toolFile(workspace, requested)
      const key = process.platform === 'win32' ? file.toLowerCase() : file
      if (seen.has(key)) throw Error('重复引用了同一份成品文件。')
      seen.add(key)
      if (fs.statSync(file).size >= spec.maxBytes) throw Error('文件超过交付大小上限。')
      const bytes = fs.readFileSync(file)
      const measured = await require('./image-artifacts.cjs').inspectArtifactAsync(bytes, policy.outputFormat || 'png', nativeImage, policy)
      results.push({ path: file, ...measured, sha256: createHash('sha256').update(bytes).digest('hex') })
    } catch (error) { errors.push(`${path.basename(requested)}：${error.message}`) }
  }
  return { version: 1, ok: !errors.length, spec, results, errors, files }
}
function designDeliveryFailure(checked, answer) {
  const previews = (checked.files || []).filter(file => { try { return fs.statSync(file).isFile() } catch { return false } })
  const next = previews.length
    ? '以下文件尚未通过交付检查，可查看后决定如何调整；不会自动再次生图。\n\n' + previews.map(file => `[${path.basename(file)}](<${file}>)`).join('\n\n')
    : '本次没有可交付或预览的图片文件。请先处理下方失败原因；不会自动再次生图。'
  return '交付检查未通过，已停止自动处理：\n\n' + checked.errors.join('\n\n') + '\n\n' + next + '\n\n处理说明（尚未通过交付检查）：\n\n' + answer
}
module.exports = { validateDesignDelivery, imageLinks, designDeliveryFailure }
