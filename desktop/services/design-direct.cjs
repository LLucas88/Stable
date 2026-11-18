'use strict'

const fs = require('node:fs'), path = require('node:path'), { createHash, randomUUID } = require('node:crypto')
const { createImageGenerator, validateArgs } = require('./image-generation.cjs')
const { imageArguments, outputExtension } = require('./image-models.cjs')
const { ImageJobStore } = require('./image-job-store.cjs')
const { resolveDesignPrompt } = require('./design-prompt.cjs')
const { designMessageTrace } = require('./design-request.cjs')
const { validateDesignDelivery } = require('./design-delivery.cjs')
const { resolveWorkspaceEntry } = require('./preview.cjs')
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const link = file => `[${path.basename(file)}](<${file}>)`

function recoveryNotice(records, completed, rawCount) {
  const retained = completed ? `已保留 ${completed} 张完成图片。` : rawCount ? '已保留生成的原图，尚未完成交付。' : '本次没有可交付图片。'
  const pending = records.some(item => item.status === 'submitted')
  const rejected = records.some(item => item.status === 'failed' && !item.notSubmitted)
  if (pending) return retained + '仍有请求结果未确认；使用相同提示词、参考图和参数可查询原请求，不会重复生成已完成图片。'
  if (rejected) return retained + '失败请求已结束，没有可恢复的生成结果；再次发送相同内容只会读取原记录，不会重新生成。请按上方原因处理，并调整请求后再明确提交新尝试。'
  if (rawCount) return retained + '可调整尺寸处理方式后恢复本地交付，不必重新生成。'
  return retained + '再次发送相同提示词、参考图和参数会继续未完成的任务，不重复生成已完成图片。'
}

function directPrompts(query, policy) {
  return Array.from({ length: policy.count }, (_, index) => query
    + (policy.text ? '\n\n图中需要呈现的文字：\n' + policy.text : '')
    + (policy.count > 1 ? `\n\n本次输出第 ${index + 1} 张，共 ${policy.count} 张；仅生成本次这一张图片。` : ''))
}

function outputDirectory(workspace, id) {
  let directory = workspace
  resolveWorkspaceEntry(directory, workspace)
  for (const part of ['.stable', 'design-output', id]) {
    directory = path.join(directory, part)
    if (!fs.existsSync(directory)) fs.mkdirSync(directory)
    resolveWorkspaceEntry(directory, workspace)
  }
  return directory
}

// Images use their own API, cancellation and durable receipts. No chat model,
// clarification runner, skill execution or model-generated title is involved.
async function runDirectDesign({ conversationId, query, payload, design }, deps) {
  const { store, lifecycle, controls, alerts, getPaths, captureReferences, readReferences, resolveImageRoute,
    publishState, state, publishEvent, nativeImage, userData, makeGenerator = createImageGenerator } = deps
  const conversation = store.conversation(conversationId)
  if (!conversation) throw Error('找不到这个对话。')
  if (controls.has(conversationId) || lifecycle.locks.has(conversationId)) throw Error('这个对话已有任务正在执行或同步。')
  if (conversation.networkAccess === false) throw Error('当前对话未允许网络访问，请开启后再生成图片。')
  if ((payload.attachments || []).some(item => !/\.(png|jpe?g|webp)$/i.test(item?.path || ''))) throw Error('直接生图支持 PNG、JPEG、WebP 参考图；其他资料请先整理到提示词中。')
  if ((payload.references || []).length) throw Error('直接生图不执行技能或资料库引用，请将需要的内容放入提示词或添加参考图。')
  if (design.mode === 'preserve') throw Error('直接生图无法保证原图像素原样合成，请使用图片生成模式；严格保留原图的合成任务请在对话中处理。')
  const policy = resolveDesignPrompt(design, query)
  const prompts = directPrompts(query, policy)
  for (const prompt of prompts) validateArgs({ ...imageArgs(policy), prompt, output: 'image.'+outputExtension(policy) })
  const deliveryId = String(payload.clientRequestId || randomUUID())
  const delivery = lifecycle.begin(deliveryId, conversationId, { query, design: policy, attachments: payload.attachments || [], references: payload.references || [] })
  if (delivery.duplicate) {
    if (delivery.state === 'completed') return { ...state(conversationId), answer: '' }
    throw Error('此条生图请求已有发送记录，请核实结果后再操作；不会重复提交。')
  }
  const abort = new AbortController()
  const control = { deliveryId, design: policy, phase: 'preparing', cancelled: false, reviewers: new Set(), steerRequests: new Map(), runner: { cancel: () => abort.abort(), steerReady: false } }
  controls.set(conversationId, control)
  alerts.start(conversationId)
  let runId, saved = false
  const trace = []
  const publish = event => {
    const item = { ...event, runId, conversationId, time: Date.now() }
    const index = trace.findIndex(previous => previous.id === item.id)
    if (index < 0) trace.push(item); else trace[index] = item
    lifecycle.checkpoint(deliveryId, trace)
    alerts.progress(conversationId)
    publishEvent?.(item)
  }
  try {
    const taskPaths = getPaths(conversationId, true), workspace = taskPaths.workspace
    const captured = await captureReferences(conversationId, payload.attachments || [])
    const references = readReferences(conversationId, captured.ids)
    if (references.length && policy.model === 'glm-image') throw Error('GLM 当前不支持参考图直传，请选择 GPT Image 后再发送。')
    const route = await resolveImageRoute(conversationId, policy)
    if (policy.model !== 'glm-image' && !route.replay && route.protocol !== 'openai-images') throw Error('GPT Image 需要已配置的 Stable Cloud 网关。')
    if (!route.apiKey) throw Error('请先配置或登录所选图片模型的服务。')
    if (references.length && !route.editEndpoint) throw Error('云端参考图编辑接口尚未配置，未提交生图请求。')
    abort.signal.throwIfAborted()
    // fit is local post-processing: changing it can finish the retained source
    // without creating another paid request. Other changes are a new request.
    const { fit, ...contract } = policy
    const signature = digest({ query, policy: contract, references: captured.ids, workspace })
    const pendingKey = `design-direct-pending:${conversationId}`, previous = store.getSetting(pendingKey)
    const jobStore = new ImageJobStore(path.join(userData, 'image-jobs', createHash('sha256').update(conversationId).digest('hex')))
    if (previous?.signature !== signature && jobStore.list().some(record => record.status === 'submitted')) throw Error('此前生图结果未确认，请使用原提示词、参考图和参数恢复，不要提交新的生图请求。')
    const planId = previous?.signature === signature && /^[\w-]{1,100}$/.test(previous.id) ? previous.id : deliveryId
    const directory = outputDirectory(workspace, planId)
    const outputs = prompts.map((_, index) => path.join(directory, `image-${index + 1}.${outputExtension(policy)}`))
    // Keep the same receipt directory as image jobs created by the chat tools.
    const generate = makeGenerator({ policy, userPrompt: query, references, resolveRoute: () => route, jobStore, nativeImage })
    store.setSetting(pendingKey, { id: planId, signature })
    store.db.exec('BEGIN IMMEDIATE')
    try {
      const message = store.addMessage(conversationId, 'user', query, designMessageTrace(policy), captured.attachments)
      lifecycle.status(deliveryId, 'saved', { userMessageId: message })
      store.db.exec('COMMIT'); saved = true
    } catch (error) { store.db.exec('ROLLBACK'); throw error }
    runId = store.startRun('agent', conversationId, query)
    lifecycle.status(deliveryId, 'running')
    control.phase = 'images'
    publishState(conversationId)
    const images = [], errors = []
    for (let offset = 0; offset < outputs.length; offset += 2) {
      if (abort.signal.aborted) break
      const batch = outputs.slice(offset, offset + 2).map((output, index) => ({ ...imageArgs(policy), prompt: prompts[offset + index], output }))
      batch.forEach((args, index) => publish({ id: `image-${offset + index + 1}`, kind: 'tool', toolName: 'stable_image_generate', eventType: 'tool/start', title: `生成图片 ${offset + index + 1}/${outputs.length}`, inputDetail: JSON.stringify(args), status: 'running' }))
      let result
      try { result = await generate({ workspace, signal: abort.signal, args: { ...batch[0], ...(batch[1] ? { additionalImages: [batch[1]] } : {}) } }) }
      catch (error) { result = { images: [], errors: [{ output: batch[0].output, message: error.message }] } }
      const completed = result.images || (result.path ? [result] : [])
      const failures = result.errors || []
      images.push(...completed); errors.push(...failures)
      batch.forEach((args, index) => {
        const image = completed.find(item => item.path === args.output), failure = failures.find(item => item.output === args.output)
        publish({ id: `image-${offset + index + 1}`, kind: 'tool', toolName: 'stable_image_generate', eventType: 'tool/end', title: `生成图片 ${offset + index + 1}/${outputs.length}`, inputDetail: JSON.stringify(args), detail: image ? link(image.path) : failure?.message || '生成未完成', status: image ? 'completed' : abort.signal.aborted ? 'cancelled' : 'failed' })
      })
      if (failures.length || completed.length !== batch.length) break
    }
    const imageLinks = images.map(item => link(item.path)).join('\n\n')
    const checked = await validateDesignDelivery({ answer: imageLinks, policy, workspace, nativeImage })
    store.setSetting(`design-delivery:${deliveryId}`, checked)
    const cancelled = abort.signal.aborted || control.cancelled
    const ok = !cancelled && !errors.length && checked.ok
    const details = [...new Set([...errors.map(item => item.message), ...checked.errors])]
    const records = jobStore.list().filter(record => outputs.includes(record.input?.output || record.output))
    const rawFiles = records.filter(record => record.rawPath && !images.some(item => item.path === (record.input?.output || record.output))).map(record => record.rawPath)
    const answer = (ok ? `已生成 ${images.length} 张图片。` : cancelled ? `本轮已停止，已完成 ${images.length}/${policy.count} 张。` : `已完成 ${images.length}/${policy.count} 张，剩余任务已停止。`)
      + (imageLinks ? '\n\n' + imageLinks : '')
      + (!ok && details.length ? '\n\n' + details.join('\n\n') : '')
      + (rawFiles.length ? '\n\n待调整的原图预览：\n\n' + rawFiles.map(link).join('\n\n') : '')
      + (!ok ? '\n\n' + recoveryNotice(records, images.length, rawFiles.length) : '')
    publish({ id: 'complete', kind: 'status', title: ok ? '图片生成完成' : cancelled ? '本轮已停止' : '图片生成未全部完成', status: ok ? 'completed' : cancelled ? 'cancelled' : 'failed', detail: details.join('\n') })
    const terminalState = ok ? 'completed' : cancelled ? 'interrupted' : 'failed'
    store.db.exec('BEGIN IMMEDIATE')
    try {
      const message = store.addMessage(conversationId, 'assistant', answer, trace)
      lifecycle.status(deliveryId, terminalState, { assistantMessageId: message })
      if (ok) store.setSetting(pendingKey, null)
      store.finishRun(runId, ok ? 'completed' : cancelled ? 'cancelled' : 'failed', answer, ok ? null : details.join('\n'))
      store.db.exec('COMMIT')
    } catch (error) { store.db.exec('ROLLBACK'); throw error }
    publishState(conversationId)
    return { answer, ...state(conversationId), library: store.listLibrary(), skills: store.listSkills(), workflows: store.listWorkflows() }
  } catch (error) {
    const terminalState = !saved ? 'rejected' : control.cancelled || abort.signal.aborted ? 'interrupted' : 'failed'
    lifecycle.status(deliveryId, terminalState, { error: error.message })
    lifecycle.finishFailure(deliveryId, { state: terminalState, error: error.message })
    if (runId) store.finishRun(runId, terminalState === 'interrupted' ? 'cancelled' : 'failed', null, error.message)
    publishState(conversationId)
    throw error
  } finally {
    alerts.finish(conversationId)
    control.phase = 'finished'
    if (controls.get(conversationId) === control) controls.delete(conversationId)
  }
}
function imageArgs(policy) { return imageArguments(policy) }
module.exports = { runDirectDesign, directPrompts }
