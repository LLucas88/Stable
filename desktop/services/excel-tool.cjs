'use strict'
const { Worker } = require('node:worker_threads')
const fs = require('node:fs')
const path = require('node:path')
const { toolFile } = require('./tool-files.cjs')

async function executeExcel({ workspace, dependencyRoot, args, signal }) {
  signal?.throwIfAborted()
  if (JSON.stringify(args).length > 2_000_000) throw new Error('Excel 操作参数过大，请分批处理。')
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'excel-tool-worker.cjs'), { workerData: { workspace, dependencyRoot, args }, resourceLimits: { maxOldGenerationSizeMb: 256 } })
    let done = false
    const finish = async (error, value) => {
      if (done) return; done = true
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      await worker.terminate()
      if (error) reject(error); else resolve(value)
    }
    const abort = () => { void finish(new Error('Excel 操作已取消，未写入输出文件。')) }
    const timer = setTimeout(() => { void finish(new Error('Excel 处理超过 30 秒，请拆分工作簿。')) }, 30_000)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    worker.once('message', message => { void finish(message.error ? new Error(message.error) : null, message.value) })
    worker.once('error', error => { void finish(error) })
    worker.once('exit', code => { if (!done) void finish(new Error(`Excel 处理进程提前退出（${code}）。`)) })
  })
  signal?.throwIfAborted()
  if (!result.bytes) return result
  // Commit only after worker success, cancellation check and a fresh realpath
  // boundary check. Exclusive creation never overwrites the user's originals.
  const target = toolFile(workspace, result.output, { output: true })
  const fd = fs.openSync(target, 'wx')
  try { fs.writeFileSync(fd, result.bytes) }
  catch (error) { fs.closeSync(fd); fs.unlinkSync(target); throw error }
  fs.closeSync(fd)
  return { path: target, bytes: result.bytes.length, sheets: result.sheets, verified: true, formulaCalculation: false, note: '已回读验证结构。公式未计算，需在 Excel/兼容软件打开后重算。' }
}

module.exports = { executeExcel }
