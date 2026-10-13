'use strict'

const http = require('node:http')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { runProviderSearch, readSSE, chatURL } = require('./model-provider.cjs')
const { modelLimits } = require('./model-limits.cjs')
const { reasoningParameters } = require('./model-reasoning.cjs')
const { WAIT_MARKER } = require('./clarification.cjs')
const REASONING_PREFIX = 'stable-claude-reasoning-v1:'

// This state is private to the parent process. Claude's tool IDs survive SDK
// session replay, so thinking providers can recover their mandatory reasoning
// on tool continuation without putting the thought in visible assistant text.
class ClaudeReasoningStore {
  constructor(file) {
    this.file = file; this.signatures = new Map(); this.calls = new Map()
    if (file && fs.existsSync(file)) {
      try {
        for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
          const entry = JSON.parse(line)
          if (!entry.id?.startsWith(REASONING_PREFIX) || typeof entry.text !== 'string' || !Array.isArray(entry.callIds)) throw new Error('Invalid record')
          this.add(entry)
        }
      } catch { throw new Error('Claude 模型上下文记录损坏，请新建对话重试；原有记录不受影响。') }
    }
  }
  add(entry) {
    this.signatures.set(entry.id, entry.text)
    for (const id of entry.callIds) this.calls.set(id, entry.text)
  }
  remember(text, callIds) {
    const entry = { id: `${REASONING_PREFIX}${randomUUID()}`, text, callIds }
    if (this.file) fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600, flush: true })
    this.add(entry)
    return entry.id
  }
  resolve(signature) {
    if (!signature?.startsWith(REASONING_PREFIX)) return undefined
    if (!this.signatures.has(signature)) throw new Error('Claude 模型上下文记录缺失，请新建对话重试；原有记录不受影响。')
    return this.signatures.get(signature)
  }
  forCalls(calls) {
    const values = calls.map(call => this.calls.get(call.id)).filter(value => value !== undefined)
    if (new Set(values).size > 1) throw new Error('Claude 工具上下文包含不一致的思考记录。')
    return values[0]
  }
}

function textContent(parts) {
  return parts.every(part => part.type === 'text') ? parts.map(part => part.text).join('\n\n') : parts
}

function contentParts(content, references) {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) throw new Error('Claude 消息内容必须是文本或内容块。')
  return content.flatMap(block => {
    if (block.type === 'tool_reference') {
      if (!references?.has(block.tool_name)) throw new Error('工具搜索返回了未知工具引用。')
      return [{ type: 'text', text: `Tool available: ${block.tool_name}` }]
    }
    if (block.type === 'text') {
      if (typeof block.text !== 'string') throw new Error('Claude 消息包含无效文本。')
      return [{ type: 'text', text: block.text }]
    }
    if (block.type === 'image') {
      const source = block.source || {}; let url
      if (source.type === 'base64' && /^image\/(png|jpeg|gif|webp)$/.test(source.media_type || '') && typeof source.data === 'string' && source.data) {
        url = `data:${source.media_type};base64,${source.data}`
      } else if (source.type === 'url' && typeof source.url === 'string') {
        const parsed = new URL(source.url)
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Claude 图片地址无效。')
        url = source.url
      } else throw new Error('Claude 图片内容无效或来源不受支持。')
      return [{ type: 'image_url', image_url: { url } }]
    }
    if (block.type === 'document') {
      const source = block.source || {}; let parts
      if (source.type === 'text' && typeof source.data === 'string') parts = [{ type: 'text', text: source.data }]
      else if (source.type === 'content') parts = contentParts(source.content)
      else if (source.type === 'base64' && source.media_type === 'text/plain' && typeof source.data === 'string') parts = [{ type: 'text', text: Buffer.from(source.data, 'base64').toString('utf8') }]
      else throw new Error('当前模型接口不支持此文档内容，请先提取文档文本。')
      if (block.title) parts.unshift({ type: 'text', text: String(block.title) })
      if (block.context) parts.unshift({ type: 'text', text: String(block.context) })
      return parts
    }
    throw new Error(`当前模型适配层不支持 Claude 消息内容：${block.type}`)
  })
}

function discoveredTools(input) {
  const names = new Set()
  const searches = new Set()
  for (const message of input.messages || []) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block.type === 'tool_use' && block.name === 'ToolSearch') searches.add(block.id)
    }
    if (message.role !== 'user' || !Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type !== 'tool_result' || !searches.has(block.tool_use_id) || block.is_error || !Array.isArray(block.content)) continue
      for (const part of block.content) if (part.type === 'tool_reference' && typeof part.tool_name === 'string') names.add(part.tool_name)
    }
  }
  return names
}

function translateTools(tools = [], discovered = new Set()) {
  if (!Array.isArray(tools)) throw new Error('Claude 工具列表无效。')
  const catalog = new Map(), seen = new Set()
  const result = tools.flatMap(tool => {
    // Native hosted tools cannot run against Chat Completions. SDK/MCP tools
    // have input_schema. Apply SDK deferral locally; the Chat Completions
    // provider only receives schemas discovered in this request's history.
    if ((tool.type && tool.type !== 'custom') || typeof tool.name !== 'string' || !tool.name || !tool.input_schema || typeof tool.input_schema !== 'object') throw new Error(`当前模型适配层不支持 Claude 工具：${tool.name || tool.type || 'unknown'}`)
    if (seen.has(tool.name)) throw new Error(`Claude 工具名称重复：${tool.name}`)
    seen.add(tool.name)
    if (tool.defer_loading === true && !discovered.has(tool.name)) return []
    catalog.set(tool.name, tool)
    return [{ type: 'function', function: { name: tool.name, description: tool.description || '', parameters: tool.input_schema } }]
  })
  return { tools: result, catalog }
}

function translateMessages(input, reasoning = new ClaudeReasoningStore()) {
  const messages = []
  const references = new Set((input.tools || []).map(tool => tool.name))
  if (input.system !== undefined) {
    const system = textContent(contentParts(input.system))
    if (typeof system !== 'string') throw new Error('Claude 系统提示只能包含文本。')
    if (system) messages.push({ role: 'system', content: system })
  }
  if (!Array.isArray(input.messages)) throw new Error('Claude 请求缺少完整的消息列表。')
  for (const item of input.messages) {
    if (!['user', 'assistant'].includes(item.role)) throw new Error(`Claude 消息角色不受支持：${item.role}`)
    const blocks = typeof item.content === 'string' ? [{ type: 'text', text: item.content }] : item.content
    if (!Array.isArray(blocks)) throw new Error('Claude 消息内容无效。')
    if (item.role === 'assistant') {
      const parts = []; const calls = []; let thought
      for (const block of blocks) {
        if (block.type === 'thinking') {
          const stored = reasoning.resolve(block.signature)
          if (stored !== undefined) thought = (thought || '') + stored
          else if (typeof block.thinking === 'string') thought = (thought || '') + block.thinking
          else throw new Error('Claude 思考内容无效。')
        } else if (block.type === 'redacted_thinking') {
          const stored = reasoning.resolve(block.data)
          if (stored === undefined) throw new Error('当前模型无法恢复此 Claude 隐藏思考块。')
          thought = (thought || '') + stored
        } else if (block.type === 'tool_use') {
          if (!block.id || !block.name || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw new Error('Claude 工具调用不完整。')
          calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } })
        } else parts.push(...contentParts([block]))
      }
      if (thought === undefined) thought = reasoning.forCalls(calls)
      // Claude can split text/thinking/tool_use across adjacent assistant
      // messages. Chat Completions needs one assistant preceding its tools.
      const previous = messages.at(-1)
      const message = previous?.role === 'assistant' ? previous : { role: 'assistant', content: null }
      if (message !== previous) messages.push(message)
      if (parts.length) {
        const existing = message.content === null ? [] : typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
        message.content = textContent([...existing, ...parts])
      }
      if (calls.length) message.tool_calls = [...(message.tool_calls || []), ...calls]
      if (thought !== undefined) message.reasoning_content = (message.reasoning_content || '') + thought
      else if (calls.length && message.reasoning_content === undefined) message.reasoning_content = ''
    } else {
      let parts = []
      const flush = () => { if (parts.length) messages.push({ role: 'user', content: textContent(parts) }); parts = [] }
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          flush()
          if (typeof block.tool_use_id !== 'string' || !block.tool_use_id) throw new Error('Claude 工具结果缺少调用 ID。')
          const result = contentParts(block.content ?? '', references)
          if (block.is_error) result.unshift({ type: 'text', text: 'Tool execution error:' })
          messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: textContent(result) })
        } else parts.push(...contentParts([block]))
      }
      flush()
    }
  }
  return messages
}

async function readJSON(request) {
  const chunks = []; let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 40 * 1024 * 1024) throw Object.assign(new Error('模型请求超过 40 MB。'), { status: 413 })
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('Claude 请求不是有效的 JSON。'), { status: 400 }) }
}

function estimatedTokens(input) {
  // Approximation only, not a vendor tokenizer: one UTF-8 byte per token
  // deliberately overestimates text/schema cost, with image padding. This
  // local route never uses an upstream credential or makes a network request.
  const serialized = JSON.stringify({ system: input.system, messages: input.messages, tools: input.tools }, (key, value) => {
    // Binary image bytes are not text tokens; padding accounts for vision.
    if (value?.type === 'image') return { type: 'image', source: { type: value.source?.type, media_type: value.source?.media_type } }
    return value
  })
  const imageCount = (serialized.match(/"type":"image"/g) || []).length
  return Math.max(1, Buffer.byteLength(serialized, 'utf8') + imageCount * 4096 + (input.messages?.length || 0) * 8)
}

function usageFromChat(usage, fallback = 0) {
  const cached = usage?.prompt_tokens_details?.cached_tokens || 0
  return { input_tokens: Math.max(0, (usage?.prompt_tokens ?? fallback) - cached), output_tokens: usage?.completion_tokens || 0, cache_creation_input_tokens: 0, cache_read_input_tokens: cached }
}

class ClaudeMessagesBridge {
  constructor({ model, apiKey, fetchImpl = globalThis.fetch, onRequest, onDiagnostic, onFatalError, search, textOnly = false, expectedImages = 0, reasoningFile }) {
    this.model = { ...model }; this.apiKey = apiKey; this.fetch = fetchImpl; this.onRequest = onRequest
    this.search = search; this.textOnly = textOnly; this.expectedImages = expectedImages
    this.onDiagnostic = onDiagnostic; this.onFatalError = onFatalError
    this.token = randomUUID(); this.controllers = new Set(); this.reasoning = new ClaudeReasoningStore(reasoningFile)
  }
  async start() {
    if (this.server) return this.baseURL
    this.server = http.createServer((req, res) => void this.handle(req, res))
    this.server.requestTimeout = 0
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve) })
    this.baseURL = `http://127.0.0.1:${this.server.address().port}`
    return this.baseURL
  }
  async close() {
    for (const controller of this.controllers) controller.abort()
    if (!this.server) return
    const server = this.server; this.server = null
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  async runSearch(request, signal) {
    if (this.textOnly) throw new Error('需求澄清阶段不允许调用搜索或执行工具。')
    return runProviderSearch.call(this, request, signal)
  }
  async handle(req, res) {
    const controller = new AbortController(); this.controllers.add(controller)
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    try {
      const authenticated = req.headers['x-api-key'] === this.token || req.headers['api-key'] === this.token || req.headers.authorization === `Bearer ${this.token}`
      if (req.headers.origin || !authenticated || req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(this.baseURL).host) throw Object.assign(new Error('无效的本机模型访问凭据。'), { status: 401 })
      const route = new URL(req.url, this.baseURL).pathname
      if (req.method !== 'POST' || !['/v1/messages', '/v1/messages/count_tokens'].includes(route)) throw Object.assign(new Error('不支持的模型接口。'), { status: 404 })
      const input = await readJSON(req)
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Claude 请求内容无效。'), { status: 400 })
      if (route === '/v1/messages/count_tokens') {
        // Validate content even here: unsupported blocks must never disappear.
        translateMessages(input, this.reasoning)
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ input_tokens: estimatedTokens(input) })); return
      }
      if (this.expectedImages) {
        const lastUser = input.messages?.findLast(message => message.role === 'user')
        const count = Array.isArray(lastUser?.content) ? lastUser.content.filter(block => block.type === 'image').length : 0
        if (count < this.expectedImages) throw new Error('Claude 无法解析部分图片，请重新上传有效图片。')
        this.expectedImages = 0
      }
      const translated = translateTools(this.textOnly ? [] : input.tools, discoveredTools(input))
      const limits = modelLimits(this.model)
      const body = { model: this.model.model, messages: translateMessages(input, this.reasoning), stream: true, stream_options: { include_usage: true }, max_tokens: Math.min(Number.isSafeInteger(input.max_tokens) && input.max_tokens > 0 ? input.max_tokens : limits.outputTokens, limits.outputTokens), ...reasoningParameters(this.model) }
      if (this.textOnly && body.messages.some(message => message.tool_calls?.length || message.role === 'tool')) throw new Error('需求澄清阶段不允许调用搜索或执行工具。')
      if (translated.tools.length) body.tools = translated.tools
      if (input.tool_choice?.type === 'auto') body.tool_choice = 'auto'
      else if (input.tool_choice?.type === 'any') body.tool_choice = 'required'
      else if (input.tool_choice?.type === 'none') body.tool_choice = 'none'
      else if (input.tool_choice?.type === 'tool') {
        if (!translated.catalog.has(input.tool_choice.name)) throw new Error('Claude 请求指定了未知工具。')
        body.tool_choice = { type: 'function', function: { name: input.tool_choice.name } }
      } else if (input.tool_choice) throw new Error('Claude 工具选择方式不受支持。')
      if (input.tool_choice?.disable_parallel_tool_use === true) body.parallel_tool_calls = false
      if (this.textOnly) { delete body.tool_choice; delete body.parallel_tool_calls }
      for (const key of ['temperature', 'top_p']) if (Number.isFinite(input[key])) body[key] = input[key]
      if (Array.isArray(input.stop_sequences) && input.stop_sequences.length) body.stop = input.stop_sequences
      if (input.output_config?.format?.type === 'json_schema') body.response_format = { type: 'json_schema', json_schema: { name: 'result', schema: input.output_config.format.schema, strict: true } }
      const fetchResponse = async feedback => {
        const requestBody = { ...body, messages: feedback ? [...body.messages, { role: 'user', content: feedback }] : [...body.messages] }
        // A local request guard is definitive; never retry it as a provider 502.
        let guidance
        try { guidance = this.onRequest?.(requestBody, input) }
        catch (error) { throw Object.assign(new Error(String(error.message || error)), { status: 400, requestRejected: true }) }
        if (typeof guidance === 'string' && guidance.trim()) {
          const system = requestBody.messages.find(message => message.role === 'system')
          requestBody.messages = system
            ? requestBody.messages.map(message => message === system ? { ...message, content: `${message.content}\n\n${guidance}` } : message)
            : [{ role: 'system', content: guidance }, ...requestBody.messages]
        }
        const response = await this.fetch(chatURL(this.model.baseURL), { method: 'POST', redirect: 'error', signal: controller.signal, headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(requestBody) })
        if (!response.ok) {
          let detail = await response.text()
          try { const data = JSON.parse(detail); detail = data.error?.message || data.message || detail } catch {}
          // Redact before truncation: a credential crossing the 1000-character
          // boundary would otherwise leave a prefix that no full-key match sees.
          detail = String(detail)
          for (const secret of [this.apiKey, this.token]) if (secret) detail = detail.split(secret).join('[redacted]')
          throw Object.assign(new Error(`模型服务请求失败（HTTP ${response.status}）：${detail.slice(0, 1000)}`), { status: response.status })
        }
        return response
      }
      await this.respond(await fetchResponse(), res, translated.catalog, input, fetchResponse, body.max_tokens)
    } catch (error) {
      let message = String(error.message || error)
      for (const secret of [this.apiKey, this.token]) if (secret) message = message.split(secret).join('[redacted]')
      const fatal = error.outputFailure || error.requestRejected
      const payload = { type: 'error', error: { type: fatal ? 'invalid_request_error' : error.name === 'AbortError' ? 'api_error' : 'stable_provider_error', message } }
      if (res.headersSent) { if (!res.destroyed) { res.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`); res.end() } }
      else if (!res.destroyed) { res.writeHead(error.status || 502, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)) }
      if (fatal) this.onFatalError?.(message)
    } finally { this.controllers.delete(controller) }
  }
  async respond(upstream, res, catalog, input, regenerate, outputBudget) {
    const stream = input.stream === true
    const id = `msg_${randomUUID()}`; const content = []; const calls = new Map()
    let text = ''; let thought = ''; let usage; let finish; let textIndex
    const estimated = estimatedTokens(input)
    const message = () => ({ id, type: 'message', role: 'assistant', model: this.model.model, content, stop_reason: null, stop_sequence: null, usage: usageFromChat(usage, estimated) })
    const emit = (type, data) => { if (stream) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`) }
    if (stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' })
      emit('message_start', { message: message() })
    }
    const append = chunk => {
      if (chunk.error) throw new Error(chunk.error.message || '模型流式请求失败。')
      if (chunk.usage) usage = chunk.usage
      const choice = chunk.choices?.[0]
      if (!choice) return
      if (choice.finish_reason) finish = choice.finish_reason
      const delta = choice.delta || choice.message || {}
      if (delta.reasoning_content) thought += delta.reasoning_content
      if (delta.content !== undefined && delta.content !== null && typeof delta.content !== 'string') throw new Error('模型返回了无法解析的文本内容。')
      if (delta.content) {
        if (textIndex === undefined) { textIndex = content.length; content.push({ type: 'text', text: '' }); emit('content_block_start', { index: textIndex, content_block: { type: 'text', text: '' } }) }
        text += delta.content; content[textIndex].text = text
        emit('content_block_delta', { index: textIndex, delta: { type: 'text_delta', text: delta.content } })
      }
      for (const [position, part] of (delta.tool_calls || []).entries()) {
        const index = part.index ?? position
        if (!Number.isInteger(index) || index < 0) throw new Error('模型返回了无效的工具索引。')
        const call = calls.get(index) || { id: '', name: '', arguments: '' }
        if (part.id) {
          if (call.id && call.id !== part.id) throw new Error('模型工具调用 ID 不一致。')
          call.id = part.id
        }
        call.name += part.function?.name || ''; call.arguments += part.function?.arguments || ''
        calls.set(index, call)
      }
    }
    let completed
    for (let attempt = 0; ; attempt++) {
      if (upstream.headers?.get('content-type')?.includes('application/json')) append(await upstream.json())
      else for await (const chunk of readSSE(upstream.body)) append(chunk)
      if (!finish) throw new Error('模型连接提前结束，未返回完成标记。')
      if (!['stop', 'tool_calls', 'length'].includes(finish)) throw new Error(`模型未正常完成生成：${finish}`)
      // Stable's clarification contract ends the turn immediately, without tools.
      if (text.trimStart().startsWith(WAIT_MARKER)) {
        calls.clear()
        if (finish === 'tool_calls') finish = 'stop'
      }
      if (this.textOnly && calls.size) throw new Error('需求澄清阶段不允许调用搜索或执行工具。')
      completed = []; const ids = new Set()
      try {
        for (const [, call] of [...calls].sort(([a], [b]) => a - b)) {
          if (!call.id || ids.has(call.id) || !catalog.has(call.name)) throw new Error(`模型返回了未知或不完整的工具调用：${call.name}`)
          ids.add(call.id)
          let args
          try { args = JSON.parse(call.arguments || '{}') } catch { throw new Error(`模型工具参数不是有效的 JSON：${call.name}`) }
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(`模型工具参数必须是对象：${call.name}`)
          completed.push({ ...call, input: args })
        }
        // No partial tools at a token limit, even if their JSON happens to parse.
        if (completed.length && finish !== 'tool_calls') throw new Error('模型工具调用没有完整的完成标记。')
        if (finish === 'tool_calls' && !completed.length) throw new Error('模型工具完成标记缺少工具调用。')
      } catch {
        // No tool block has left the bridge: never execute or repair partial JSON.
        // Give the provider one corrective attempt, then stop SDK transport retries.
        const diagnostic = { kind: 'tool_arguments', attempt: attempt + 1, finishReason: finish, outputBudget,
          completionTokens: usage?.completion_tokens ?? null,
          calls: [...calls.values()].map(call => ({ name: catalog.has(call.name) ? call.name : 'unknown', argumentBytes: Buffer.byteLength(call.arguments) })) }
        this.onDiagnostic?.(diagnostic)
        const reason = finish === 'length' ? '工具参数生成达到输出上限' : '模型工具参数无效或完成标记不完整'
        if (attempt || !regenerate) throw Object.assign(new Error(`${reason}；纠正后仍失败，已停止重试。finish_reason=${finish}，max_tokens=${outputBudget}，arguments_bytes=${diagnostic.calls.map(call => call.argumentBytes).join(',')}。本次未执行任何工具。`), { status: 400, outputFailure: true })
        const feedback = `Stable 模型适配校验：上一响应${reason}（finish_reason=${finish}）。整组工具调用均未执行，不能假定已写入文件。请继续当前任务，重新生成完整、正确转义的 JSON 对象；文件内容分成小段，每次只写一个完整片段，再用 Edit 逐步补全。不要一次输出整个长报告，不要重复已输出的过程说明。`
        calls.clear(); thought = ''; finish = undefined; usage = undefined
        upstream = await regenerate(feedback)
        continue
      }
      break
    }
    if (!text && !completed.length && finish !== 'length') throw new Error('模型返回了空结果。')
    if (textIndex !== undefined) emit('content_block_stop', { index: textIndex })
    if (thought || completed.length) this.reasoning.remember(thought, completed.map(call => call.id))
    for (const call of completed) {
      const index = content.length
      const block = { type: 'tool_use', id: call.id, name: call.name, input: call.input }
      content.push(block)
      emit('content_block_start', { index, content_block: { ...block, input: {} } })
      emit('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
      emit('content_block_stop', { index })
    }
    const stop_reason = finish === 'tool_calls' ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn'
    if (stream) {
      emit('message_delta', { delta: { stop_reason, stop_sequence: null }, usage: usageFromChat(usage, estimated) })
      emit('message_stop', {}); res.end()
    } else {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...message(), stop_reason }))
    }
  }
}

module.exports = { ClaudeMessagesBridge, ClaudeReasoningStore, translateMessages, translateTools, contentParts, estimatedTokens }
