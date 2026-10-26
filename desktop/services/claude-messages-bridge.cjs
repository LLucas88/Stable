'use strict'

const http = require('node:http')
const fs = require('node:fs')
const { randomUUID, createHash } = require('node:crypto')
const { runProviderSearch, readSSE, chatURL } = require('./model-provider.cjs')
const { modelLimits } = require('./model-limits.cjs')
const { reasoningParameters } = require('./model-reasoning.cjs')
const { WAIT_MARKER } = require('./clarification.cjs')
const { compactToolContext } = require('./claude-context.cjs')
const { workflowGuidance } = require('./claude-workflow.cjs')
const { withModelIdentity } = require('./model-identity.cjs')
const { CalibratedTokenCounter, modelScope } = require('./claude-token-count.cjs')
const REASONING_PREFIX = 'stable-claude-reasoning-v1:'
const hash = value => createHash('sha256').update(value).digest('hex')
function reasoningKeys(messages) {
  let prefix = ''
  return messages.map(message => {
    if (message.role === 'system') return null
    const key = hash(JSON.stringify({ role: message.role, content: message.content,
      tool_calls: message.tool_calls, tool_call_id: message.tool_call_id }))
    prefix = hash(prefix + key)
    return { messageKey: prefix, contentKey: key }
  })
}

// Private sidecar for provider thinking. Tool IDs and canonical message/history
// fingerprints survive SDK replay, which can strip old thinking blocks.
class ClaudeReasoningStore {
  constructor(file, scope = '') {
    this.scope = scope
    this.file = file; this.signatures = new Map(); this.calls = new Map()
    this.messages = new Map(); this.contents = new Map()
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
    if ((entry.scope || '') === this.scope && /^[a-f0-9]{64}$/.test(entry.messageKey || '') && /^[a-f0-9]{64}$/.test(entry.contentKey || '')) {
      for (const [map, key] of [[this.messages, entry.messageKey], [this.contents, entry.contentKey]]) {
        const values = map.get(key) || new Set(); values.add(entry.text); map.set(key, values)
      }
    }
  }
  remember(text, callIds, keys = {}) {
    const entry = { id: `${REASONING_PREFIX}${randomUUID()}`, text, callIds, ...keys, scope: this.scope }
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
  restoreMessages(messages) {
    const keys = reasoningKeys(messages)
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      if (message.role !== 'assistant' || message.reasoning_content !== undefined) continue
      // The SDK drops old thinking blocks. Prefer the whole history identity;
      // after compaction only a unique content match is safe. Never pick the
      // latest thought for repeated answers with different reasoning.
      const values = this.messages.get(keys[i].messageKey) || this.contents.get(keys[i].contentKey)
      if (!values) continue // Legacy text answers had no recoverable association.
      if (values.size !== 1) throw Object.assign(new Error('无法唯一恢复这条历史回答的思考记录，请新建对话继续；原历史已保留。'), { status: 400, requestRejected: true })
      message.reasoning_content = values.values().next().value
    }
    return messages
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
  const calls = new Map()
  for (const message of input.messages || []) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') calls.set(block.id, block.name)
    }
    if (message.role !== 'user' || !Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type !== 'tool_result' || block.is_error || !calls.has(block.tool_use_id)) continue
      const name = calls.get(block.tool_use_id)
      // Compaction can retain a successful call/result but drop its ToolSearch.
      // Only current request schemas may be restored; never infer tools from prose.
      if (name !== 'ToolSearch') names.add(name)
      else if (Array.isArray(block.content)) for (const part of block.content) if (part.type === 'tool_reference' && typeof part.tool_name === 'string') names.add(part.tool_name)
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
    // provider only receives schemas discovered or successfully used in this request's history.
    if ((tool.type && tool.type !== 'custom') || typeof tool.name !== 'string' || !tool.name || !tool.input_schema || typeof tool.input_schema !== 'object') throw new Error(`当前模型适配层不支持 Claude 工具：${tool.name || tool.type || 'unknown'}`)
    if (seen.has(tool.name)) throw new Error(`Claude 工具名称重复：${tool.name}`)
    seen.add(tool.name)
    if (tool.defer_loading === true && !discovered.has(tool.name)) return []
    catalog.set(tool.name, tool)
    return [{ type: 'function', function: { name: tool.name, description: tool.description || '', parameters: tool.input_schema } }]
  })
  return { tools: result, catalog }
}

function translateMessages(input, reasoning = new ClaudeReasoningStore(), { preserveToolParts = false, restore = true } = {}) {
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
          messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: preserveToolParts ? result : textContent(result) })
        } else parts.push(...contentParts([block]))
      }
      flush()
    }
  }
  return restore ? reasoning.restoreMessages(messages) : messages
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

function usageFromChat(usage, fallback = 0) {
  const valid = value => Number.isSafeInteger(value) && value >= 0
  const total = valid(usage?.prompt_tokens) ? usage.prompt_tokens : fallback
  const rawCached = usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens
  const cached = valid(rawCached) ? Math.min(total, rawCached) : 0
  return { input_tokens: total - cached, output_tokens: valid(usage?.completion_tokens) ? usage.completion_tokens : 0, cache_creation_input_tokens: 0, cache_read_input_tokens: cached }
}

class ClaudeMessagesBridge {
  constructor({ model, apiKey, fetchImpl = globalThis.fetch, onRequest, onDiagnostic, onFatalError, search, textOnly = false, expectedImages = 0, reasoningFile, imageDirectory, chatgpt }) {
    this.imageDirectory = imageDirectory
    this.chatgpt = model.providerId === 'chatgpt' ? new (require('./chatgpt-responses.cjs').ChatGPTResponses)({ account: chatgpt, model, reasoningFile }) : null
    this.model = { ...model }; this.apiKey = apiKey; this.fetch = fetchImpl; this.onRequest = onRequest
    this.search = search; this.textOnly = textOnly; this.expectedImages = expectedImages
    this.onDiagnostic = onDiagnostic; this.onFatalError = onFatalError
    this.contextRecoveries = 0
    this.token = randomUUID(); this.controllers = new Set(); this.reasoning = new ClaudeReasoningStore(reasoningFile, modelScope(model))
    this.tokenCounter = new CalibratedTokenCounter({ model, file: reasoningFile ? reasoningFile + '.counts.json' : undefined })
  }
  countBody(input, translated = translateTools(this.textOnly ? [] : input.tools, discoveredTools(input))) {
    const messages = compactToolContext(translateMessages(withModelIdentity(input, this.model), this.reasoning, { preserveToolParts: true }), { imageDirectory: this.imageDirectory })
      .map(message => message.role === 'tool' && Array.isArray(message.content) ? { ...message, content: textContent(message.content) } : message)
    return { messages, ...(translated.tools.length ? { tools: translated.tools } : {}),
      ...(input.output_config?.format?.type === 'json_schema' ? { response_format: { type: 'json_schema', json_schema: { name: 'result', schema: input.output_config.format.schema, strict: true } } } : {}) }
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
        const estimate = this.tokenCounter.estimate(this.countBody(input))
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ input_tokens: estimate.tokens })); return
      }
      if (this.expectedImages) {
        const lastUser = input.messages?.findLast(message => message.role === 'user')
        const count = Array.isArray(lastUser?.content) ? lastUser.content.filter(block => block.type === 'image').length : 0
        if (count < this.expectedImages) throw new Error('Claude 无法解析部分图片，请重新上传有效图片。')
        this.expectedImages = 0
      }
      const translated = translateTools(this.textOnly ? [] : input.tools, discoveredTools(input))
      const limits = modelLimits(this.model)
      const body = { model: this.model.model, ...this.countBody(input, translated), stream: true, stream_options: { include_usage: true }, max_tokens: Math.min(Number.isSafeInteger(input.max_tokens) && input.max_tokens > 0 ? input.max_tokens : limits.outputTokens, limits.outputTokens), ...reasoningParameters(this.model) }
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
      let measuredRequest
      const fetchResponse = async feedback => {
        const requestBody = { ...body, messages: feedback ? [...body.messages, { role: 'user', content: feedback }] : [...body.messages] }
        // A local request guard is definitive; never retry it as a provider 502.
        let guidance
        try { guidance = this.onRequest?.(requestBody, input) }
        catch (error) { throw Object.assign(new Error(String(error.message || error)), { status: 400, requestRejected: true }) }
        // Usage also includes appended runtime guidance: retaining that cost in
        // the anchor is conservative when count_tokens omits transient advice.
        measuredRequest = { ...requestBody, messages: [...requestBody.messages] }
        const advisory = [typeof guidance === 'string' ? guidance.trim() : '', this.textOnly ? '' : workflowGuidance(body.messages)].filter(Boolean).join('\n')
        // Runtime progress changes every request. Keep it after the retained
        // history, never in its system prefix. Do not persist stale advisories
        // in SDK history or let them replace user requirements/tool evidence.
        if (advisory) requestBody.messages.push({ role: 'user', content: `运行状态提醒（不改变用户要求，不代表验收通过）：\n${advisory}` })
        if (this.chatgpt) return this.chatgpt.request(requestBody, controller.signal)
        const response = await this.fetch(chatURL(this.model.baseURL), { method: 'POST', redirect: 'error', signal: controller.signal, headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(requestBody) })
        if (!response.ok) {
          let detail = await response.text()
          let providerCode
          try { const data = JSON.parse(detail); providerCode = data.error?.code; detail = data.error?.message || data.message || detail } catch {}
          // Redact before truncation: a credential crossing the 1000-character
          // boundary would otherwise leave a prefix that no full-key match sees.
          detail = String(detail)
          for (const secret of [this.apiKey, this.token]) if (secret) detail = detail.split(secret).join('[redacted]')
          const contextExceeded = response.status === 400 && /请求内容与最大输出长度超过模型上下文限制|context_length_exceeded|maximum context length|prompt is too long/i.test(detail)
          const permanentProviderFailure = ['upstream_insufficient_balance', 'upstream_authentication_failed', 'upstream_model_not_found', 'upstream_invalid_request'].includes(providerCode)
          throw Object.assign(new Error(`模型服务请求失败（HTTP ${response.status}）：${detail.slice(0, 1000)}`), { status: response.status, providerRejected: true, permanentProviderFailure, contextExceeded })
        }
        return response
      }
      await this.respond(await fetchResponse(), res, translated.catalog, input, fetchResponse, body.max_tokens, () => measuredRequest)
      this.transientFailures = 0
      this.lastProviderError = null
    } catch (error) {
      let message = String(error.message || error)
      for (const secret of [this.apiKey, this.token]) if (secret) message = message.split(secret).join('[redacted]')
      this.lastProviderError = { message, status: error.status }
      // A text-only preflight must not consume its whole deadline in SDK HTTP
      // retries. Allow one recovery attempt, then preserve the real rejection.
      const transient = error.providerRejected && !error.permanentProviderFailure && (error.status === 429 || error.status >= 500)
      this.transientFailures = transient ? (this.transientFailures || 0) + 1 : 0
      const exhausted = this.textOnly && this.transientFailures >= 2
      // Allow native compaction to shrink its own summary input too, but bound
      // repeated rejections for an irreducible prompt or a broken gateway.
      const recoverContext = error.contextExceeded && ++this.contextRecoveries <= 3
      if (error.contextExceeded) this.onDiagnostic?.({ reasonCode: 'context_window_exceeded', attempt: this.contextRecoveries, recovering: Boolean(recoverContext), message })
      const fatal = exhausted || error.permanentProviderFailure || error.outputFailure || error.requestRejected || (error.providerRejected && !recoverContext && [400, 401, 402, 403, 404, 413, 422].includes(error.status))
      // The native SDK recognizes this Anthropic error and compacts retained
      // history. Keep the original provider error for UI/terminal failures.
      const payload = { type: 'error', error: { type: fatal || recoverContext ? 'invalid_request_error' : error.name === 'AbortError' ? 'api_error' : 'stable_provider_error', message: recoverContext ? `prompt is too long: ${message}` : message } }
      if (res.headersSent) { if (!res.destroyed) { res.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`); res.end() } }
      else if (!res.destroyed) { res.writeHead(error.status || 502, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)) }
      if (fatal) this.onFatalError?.(message)
    } finally { this.controllers.delete(controller) }
  }
  async respond(upstream, res, catalog, input, regenerate, outputBudget, countedRequest) {
    const stream = input.stream === true
    const id = `msg_${randomUUID()}`; const content = []; const calls = new Map()
    let text = ''; let thought = ''; let usage; let finish; let textIndex
    const estimated = this.tokenCounter.estimate(countedRequest?.() || this.countBody(input)).tokens
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
      if (countedRequest?.()) this.tokenCounter.observe(countedRequest(), usage)
      // Stable's clarification contract ends the turn immediately, without tools.
      if (text.trimStart().startsWith(WAIT_MARKER)) {
        calls.clear()
        if (finish === 'tool_calls') finish = 'stop'
      }
      if (this.textOnly && calls.size) throw new Error('需求澄清阶段不允许调用搜索或执行工具。')
      completed = []; const ids = new Set()
      const invalid = (code, message) => Object.assign(new Error(message), { validationCode: code })
      const safeName = value => {
        let name = String(value || '')
        for (const secret of [this.apiKey, this.token]) if (secret) name = name.split(secret).join('[redacted]')
        return name.slice(0, 160).replace(/[^a-zA-Z0-9_.:\-\[\]]/g, '?') || '[missing]'
      }
      try {
        for (const [, call] of [...calls].sort(([a], [b]) => a - b)) {
          if (!call.id) throw invalid('missing_call_id', '工具调用缺少 ID')
          if (ids.has(call.id)) throw invalid('duplicate_call_id', '工具调用 ID 重复')
          if (!catalog.has(call.name)) throw invalid('unknown_tool', `工具未在当前可用清单中：${safeName(call.name)}`)
          ids.add(call.id)
          let args
          try { args = JSON.parse(call.arguments || '{}') } catch { throw invalid('invalid_json', `工具参数不是有效的 JSON：${safeName(call.name)}`) }
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw invalid('invalid_arguments', `工具参数必须是对象：${safeName(call.name)}`)
          completed.push({ ...call, input: args })
        }
        // No partial tools at a token limit, even if their JSON happens to parse.
        if (completed.length && finish !== 'tool_calls') throw invalid('incomplete_finish', '模型工具调用没有完整的完成标记。')
        if (finish === 'tool_calls' && !completed.length) throw invalid('missing_calls', '模型工具完成标记缺少工具调用。')
      } catch (validation) {
        // No tool block has left the bridge: never execute or repair partial JSON.
        // Give the provider one corrective attempt, then stop SDK transport retries.
        const diagnostic = { kind: 'tool_arguments', reasonCode: validation.validationCode, attempt: attempt + 1, finishReason: finish, outputBudget, availableToolCount: catalog.size,
          completionTokens: usage?.completion_tokens ?? null,
          calls: [...calls.values()].map(call => ({ name: safeName(call.name), availability: catalog.has(call.name) ? 'available' : input.tools?.some(tool => tool.name === call.name) ? 'deferred' : 'absent', argumentBytes: Buffer.byteLength(call.arguments) })) }
        this.onDiagnostic?.(diagnostic)
        const reason = finish === 'length' ? '工具参数生成达到输出上限' : validation.message
        if (attempt || !regenerate) throw Object.assign(new Error(`${reason}；纠正后仍失败，已停止重试。finish_reason=${finish}，max_tokens=${outputBudget}，arguments_bytes=${diagnostic.calls.map(call => call.argumentBytes).join(',')}。本次模型响应中的整组工具调用未执行；此前已完成的操作不会回滚。`), { status: 400, outputFailure: true })
        const repair = validation.validationCode === 'unknown_tool'
          ? `只能调用本次 tools 清单里的完整名称（包括 mcp__ 前缀），不要从摘要猜测工具名称。${catalog.has('ToolSearch') ? '需要的工具尚未加载时，先调用 ToolSearch 取得定义，再继续操作。' : '未提供的工具不可调用；若无需工具则直接回复。'}当前可用工具：${[...catalog.keys()].map(safeName).join(', ')}。`
          : '重新生成完整、正确转义的 JSON 对象；文件内容分成小段，每次只写一个完整片段，再用 Edit 逐步补全。不要一次输出整个长报告。'
        const feedback = `Stable 模型适配校验：上一响应${reason}（finish_reason=${finish}）。整组工具调用均未执行，不能假定已写入文件。这仅指上一模型响应，此前成功的工具操作依然有效，不要重复执行。请继续当前任务，${repair}不要重复已输出的过程说明。`
        calls.clear(); thought = ''; finish = undefined; usage = undefined
        upstream = await regenerate(feedback)
        continue
      }
      break
    }
    if (!text && !completed.length && finish !== 'length') throw new Error('模型返回了空结果。')
    if (textIndex !== undefined) emit('content_block_stop', { index: textIndex })
    if (content.length || thought || completed.length) {
      // The SDK strips old thinking blocks, including redacted blocks. Associate
      // text answers with history/content fingerprints as well as tool IDs.
      const replayContent = [...content, ...completed.map(call => ({ type: 'tool_use', id: call.id, name: call.name, input: call.input }))]
      const replay = translateMessages(withModelIdentity({ ...input, messages: [...input.messages, { role: 'assistant', content: replayContent }] }, this.model), this.reasoning, { restore: false })
      this.reasoning.remember(thought, completed.map(call => call.id), reasoningKeys(replay).at(-1))
    }
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

module.exports = { ClaudeMessagesBridge, ClaudeReasoningStore, translateMessages, translateTools, contentParts }
