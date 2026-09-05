'use strict'

// Codex speaks Responses; Stable's existing providers speak Chat Completions.
// Only the parent process holds the upstream credential. Each run gets a
// loopback server and a disposable capability token, including child agents.
const http = require('node:http')
const { randomUUID } = require('node:crypto')
const { isDeepSeekModel, isZhipuModel } = require('./model-registry.cjs')
const { createZhipuSearchProvider } = require('./harness.cjs')
const { CodexReasoningStore } = require('./codex-reasoning-store.cjs')
const { normalizeWindowsCall } = require('./windows-command.cjs')

function chatURL(baseURL) {
  const url = new URL(baseURL)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型服务地址无效。')
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  return url.href
}

function translateTools(tools = []) {
  const catalog = new Map()
  const result = []
  function add(tool, namespace) {
    if (tool.type === 'namespace') { for (const child of tool.tools || []) add(child, tool.name); return }
    if (!['function', 'custom'].includes(tool.type)) throw new Error(`当前模型适配层不支持工具类型：${tool.type}`)
    const original = tool.name
    const name = namespace ? `${namespace}__${original}` : original
    catalog.set(name, { name: original, namespace, custom: tool.type === 'custom' })
    result.push({ type: 'function', function: {
      name, description: tool.description || '',
      parameters: tool.type === 'custom'
        ? { type: 'object', properties: { input: { type: 'string', description: 'The exact raw input required by this tool.' } }, required: ['input'], additionalProperties: false }
        : (tool.parameters || { type: 'object', properties: {} }),
    } })
  }
  tools.forEach((tool) => add(tool))
  return { tools: result, catalog }
}

function translateInput(input, instructions, reasoning = new Map()) {
  const messages = instructions ? [{ role: 'system', content: instructions }] : []
  let thought; let assistant
  for (const item of typeof input === 'string' ? [{ role: 'user', content: input }] : (input || [])) {
    if (item.type === 'reasoning') { thought = reasoning.get(item.encrypted_content); assistant = null; continue }
    if (['function_call', 'custom_tool_call'].includes(item.type)) {
      if (!assistant) { assistant = { role: 'assistant', content: null, reasoning_content: thought ?? '', tool_calls: [] }; messages.push(assistant) }
      assistant.tool_calls ||= []
      assistant.tool_calls.push({ id: item.call_id, type: 'function', function: {
        name: item.namespace ? `${item.namespace}__${item.name}` : item.name,
        arguments: item.type === 'custom_tool_call' ? JSON.stringify({ input: item.input }) : item.arguments,
      } })
    } else if (['function_call_output', 'custom_tool_call_output'].includes(item.type)) {
      messages.push({ role: 'tool', tool_call_id: item.call_id, content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output) })
      thought = undefined; assistant = null
    } else if (item.role) {
      const role = item.role === 'developer' ? 'system' : item.role
      const parts = typeof item.content === 'string' ? item.content : (item.content || []).map((part) => {
        if (['input_text', 'output_text', 'text'].includes(part.type)) {
          if (typeof part.text !== 'string') throw new Error('当前模型适配层收到无效的文本内容。')
          return { type: 'text', text: part.text }
        }
        if (part.type === 'input_image') return { type: 'image_url', image_url: { url: part.image_url, ...(part.detail ? { detail: part.detail } : {}) } }
        throw new Error(`当前模型适配层不支持消息内容：${part.type}`)
      })
      // Stable Cloud's text-only contract accepts strings, not even arrays of
      // text blocks. Preserve block order and keep genuine image arrays intact.
      const content = Array.isArray(parts) && parts.every((part) => part.type === 'text')
        ? parts.map((part) => part.text).join('\n\n') : parts
      const message = { role, content }
      if (role === 'assistant' && thought !== undefined) message.reasoning_content = thought
      messages.push(message)
      assistant = role === 'assistant' ? message : null
      if (role !== 'assistant') thought = undefined
    } else throw new Error(`当前模型适配层不支持输入类型：${item.type}`)
  }
  return messages
}

async function* readSSE(body) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r/g, '')
    if (buffer.length > 16 * 1024 * 1024) throw new Error('模型流式事件超过大小限制。')
    let end
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, end); buffer = buffer.slice(end + 2)
      const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
      if (data && data !== '[DONE]') yield JSON.parse(data)
    }
  }
  buffer += decoder.decode()
  const data = buffer.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
  if (data && data !== '[DONE]') yield JSON.parse(data)
}

async function readJSON(request) {
  const chunks = []; let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 40 * 1024 * 1024) throw Object.assign(new Error('模型请求超过 40 MB。'), { status: 413 })
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

class CodexResponsesBridge {
  constructor({ model, apiKey, fetchImpl = globalThis.fetch, onRequest, search, expectedImages = 0, reasoningFile, windowsPython }) {
    this.model = { ...model }; this.apiKey = apiKey; this.fetch = fetchImpl
    this.windowsPython = windowsPython
    this.token = randomUUID(); this.controllers = new Set(); this.reasoning = new CodexReasoningStore(reasoningFile)
    this.onRequest = onRequest; this.search = search
    this.expectedImages = expectedImages
  }
  async start() {
    this.server = http.createServer((req, res) => void this.handle(req, res))
    this.server.requestTimeout = 0
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve) })
    this.baseURL = `http://127.0.0.1:${this.server.address().port}/v1`
    return this.baseURL
  }
  async close() {
    for (const controller of this.controllers) controller.abort()
    if (!this.server) return
    const server = this.server; this.server = null
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  async handle(req, res) {
    const controller = new AbortController()
    this.controllers.add(controller)
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    try {
      if (req.headers.origin || req.headers.authorization !== `Bearer ${this.token}`) throw Object.assign(new Error('无效的本机模型访问凭据。'), { status: 401 })
      if (req.method !== 'POST' || !['/v1/responses', '/v1/search'].includes(req.url)) throw Object.assign(new Error('不支持的模型接口。'), { status: 404 })
      const input = await readJSON(req)
      if (req.url === '/v1/search') {
        const result = await this.runSearch(input, controller.signal)
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(result)); return
      }
      if (input.previous_response_id) throw new Error('模型适配层要求完整的会话输入。')
      if (this.expectedImages) {
        const lastUser = Array.isArray(input.input) ? input.input.findLast((item) => item.role === 'user') : null
        const imageCount = Array.isArray(lastUser?.content) ? lastUser.content.filter((part) => part.type === 'input_image').length : 0
        if (imageCount < this.expectedImages) throw new Error('Codex 无法解析部分图片，请重新上传有效图片。')
        this.expectedImages = 0
      }
      const translated = translateTools(input.tools)
      const body = { model: this.model.model, messages: translateInput(input.input, input.instructions, this.reasoning), stream: true, stream_options: { include_usage: true } }
      if (translated.tools.length) body.tools = translated.tools
      if (input.max_output_tokens) body.max_tokens = input.max_output_tokens
      if (typeof input.tool_choice === 'string') body.tool_choice = input.tool_choice
      else if (input.tool_choice?.name) body.tool_choice = { type: 'function', function: { name: input.tool_choice.name } }
      const format = input.text?.format
      if (format?.type === 'json_schema') body.response_format = { type: 'json_schema', json_schema: { name: format.name || 'result', schema: format.schema, strict: format.strict ?? true } }
      this.onRequest?.(body, input)
      const response = await this.fetch(chatURL(this.model.baseURL), { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body) })
      if (!response.ok) {
        let detail = await response.text()
        try { const data = JSON.parse(detail); detail = data.error?.message || data.message || detail } catch {}
        detail = String(detail).slice(0, 1000).split(this.apiKey).join('[redacted]')
        throw Object.assign(new Error(`模型服务请求失败（HTTP ${response.status}）：${detail}`), { status: response.status })
      }
      await this.streamResponse(response, res, translated.catalog)
    } catch (error) {
      const message = String(error.message || error).split(this.apiKey || '\0').join('[redacted]')
      if (res.headersSent) {
        if (!res.destroyed) { res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { message, code: 'stable_provider_error' } })}\n\n`); res.end() }
      } else { res.writeHead(error.status || 502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message, type: 'stable_provider_error' } })) }
    } finally { this.controllers.delete(controller) }
  }
  async streamResponse(upstream, res, catalog) {
    const id = `resp_${randomUUID()}`; let sequence = 0; const output = []; const calls = new Map()
    let message; let usage; let finishReason; let thought = ''
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const emit = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`)
    const response = (status) => ({ id, object: 'response', created_at: Math.floor(Date.now() / 1000), status, model: this.model.model, output, ...(usage ? { usage } : {}) })
    emit('response.created', { response: response('in_progress') })
    emit('response.in_progress', { response: response('in_progress') })
    const reasoningItem = { type: 'reasoning', id: `rs_${randomUUID()}`, summary: [], encrypted_content: null }
    output.push(reasoningItem)
    emit('response.output_item.added', { output_index: 0, item: { ...reasoningItem } })
    for await (const chunk of readSSE(upstream.body)) {
      if (chunk.error) throw new Error(chunk.error.message || '模型流式请求失败。')
      if (chunk.usage) usage = { input_tokens: chunk.usage.prompt_tokens || 0, output_tokens: chunk.usage.completion_tokens || 0, total_tokens: chunk.usage.total_tokens || 0,
        input_tokens_details: { cached_tokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0 }, output_tokens_details: { reasoning_tokens: chunk.usage.completion_tokens_details?.reasoning_tokens || 0 } }
      const choice = chunk.choices?.[0]
      if (!choice) continue
      if (choice.finish_reason) finishReason = choice.finish_reason
      const delta = choice.delta || {}
      thought += delta.reasoning_content || ''
      if (delta.content) {
        if (!message) {
          message = { type: 'message', id: `msg_${randomUUID()}`, role: 'assistant', status: 'in_progress', content: [] }
          output.push(message)
          emit('response.output_item.added', { output_index: output.length - 1, item: { ...message } })
          message.content.push({ type: 'output_text', text: '', annotations: [] })
          emit('response.content_part.added', { item_id: message.id, output_index: output.indexOf(message), content_index: 0, part: { ...message.content[0] } })
        }
        message.content[0].text += delta.content
        emit('response.output_text.delta', { item_id: message.id, output_index: output.indexOf(message), content_index: 0, delta: delta.content })
      }
      for (const part of delta.tool_calls || []) {
        const call = calls.get(part.index) || { id: '', name: '', arguments: '' }
        call.id = part.id || call.id; call.name += part.function?.name || ''; call.arguments += part.function?.arguments || ''
        calls.set(part.index, call)
      }
    }
    if (!finishReason) throw new Error('模型连接提前结束，未返回完成标记。')
    if (['length', 'content_filter'].includes(finishReason)) throw new Error(finishReason === 'length' ? '模型达到输出长度上限，请分步骤继续。' : '模型服务拒绝生成此内容。')
    if (!message && !calls.size) throw new Error('模型返回了空结果。')
    reasoningItem.encrypted_content = this.reasoning.remember(thought)
    emit('response.output_item.done', { output_index: 0, item: reasoningItem })
    if (message) {
      message.status = 'completed'
      message.phase = calls.size ? 'commentary' : 'final_answer'
      const index = output.indexOf(message)
      emit('response.output_text.done', { item_id: message.id, output_index: index, content_index: 0, text: message.content[0].text })
      emit('response.content_part.done', { item_id: message.id, output_index: index, content_index: 0, part: message.content[0] })
      emit('response.output_item.done', { output_index: index, item: message })
    }
    for (const call of calls.values()) {
      let spec = catalog.get(call.name)
      if (!spec || !call.id) throw new Error(`模型返回了未知或不完整的工具调用：${call.name}`)
      // Validate arguments before releasing a tool call to the execution engine.
      let args = JSON.parse(call.arguments || '{}')
      if (process.platform === 'win32') ({ spec, args } = normalizeWindowsCall(spec, args, catalog, this.windowsPython))
      if (spec.custom && typeof args.input !== 'string') throw new Error('模型返回的自定义工具参数缺少 input。')
      const item = { type: spec.custom ? 'custom_tool_call' : 'function_call', id: `fc_${randomUUID()}`, call_id: call.id,
        name: spec.name, ...(spec.namespace ? { namespace: spec.namespace } : {}), status: 'completed', ...(spec.custom ? { input: args.input } : { arguments: JSON.stringify(args) }) }
      const index = output.push(item) - 1
      emit('response.output_item.added', { output_index: index, item: { ...item, status: 'in_progress', ...(spec.custom ? { input: '' } : { arguments: '' }) } })
      const field = spec.custom ? 'custom_tool_call_input' : 'function_call_arguments'
      emit(`response.${field}.delta`, { item_id: item.id, output_index: index, delta: spec.custom ? item.input : item.arguments })
      emit(`response.${field}.done`, { item_id: item.id, output_index: index, ...(spec.custom ? { input: item.input } : { arguments: item.arguments }) })
      emit('response.output_item.done', { output_index: index, item })
    }
    emit('response.completed', { response: response('completed') }); res.end()
  }
  async runSearch(request, signal) {
    if (this.search) return this.search(request, signal)
    if (this.model.providerId === 'stable-cloud') throw new Error('当前云端模型尚未配置联网搜索服务。')
    if (isZhipuModel(this.model)) {
      const provider = createZhipuSearchProvider({ apiKey: this.apiKey, WebError: Error, fetchImpl: this.fetch })
      return provider.search(request, signal)
    }
    if (isDeepSeekModel(this.model)) {
      const query = String(request.query || '').trim().slice(0, 1000)
      if (!query) throw new Error('搜索关键词不能为空。')
      const response = await this.fetch('https://api.deepseek.com/anthropic/v1/messages', {
        method: 'POST', redirect: 'error', signal,
        headers: { authorization: `Bearer ${this.apiKey}`, 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-v4-flash', max_tokens: 4096, messages: [{ role: 'user', content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }] }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] }),
      })
      if (!response.ok) throw new Error(`DeepSeek 联网搜索失败（HTTP ${response.status}）。`)
      const payload = await response.json(); const blocks = payload.content || []
      const results = blocks.filter((block) => block.type === 'web_search_tool_result')
      if (!results.length) throw new Error('DeepSeek 未返回联网搜索结果。')
      const snippets = new Map(blocks.filter((block) => block.type === 'text').flatMap((block) => block.citations || []).map((citation) => [citation.url, citation.cited_text]))
      const unique = new Map()
      for (const block of results) for (const item of Array.isArray(block.content) ? block.content : []) {
        if (item.type === 'web_search_result' && /^https?:\/\//.test(item.url)) unique.set(item.url, { url: item.url, title: item.title || '', snippet: snippets.get(item.url) || '', publishedAt: item.page_age || '' })
      }
      const limit = Math.max(1, Math.min(50, Number(request.maxResults) || 10))
      return { sources: [...unique.values()].slice(0, limit), truncated: unique.size > limit }
    }
    throw new Error('当前模型未配置联网搜索，请使用可用的网页读取工具。')
  }
}

module.exports = { CodexResponsesBridge, translateTools, translateInput, readSSE, chatURL }
