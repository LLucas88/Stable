'use strict'

const fs = require('node:fs')
const { createHash } = require('node:crypto')
const { failure, apiError } = require('./chatgpt-account.cjs')
const { readSSE } = require('./model-provider.cjs')
const NAMESPACE = 'stable_tools'
const alias = name => /^[a-zA-Z0-9_-]{1,64}$/.test(name) ? name : `tool_${createHash('sha256').update(name).digest('hex').slice(0, 48)}`

class ChatGPTResponses {
  constructor({ account, model, reasoningFile }) {
    if (!account) throw failure('REAUTH_REQUIRED')
    this.account = account; this.model = model; this.records = new Map()
    this.file = reasoningFile ? `${reasoningFile}.chatgpt-${createHash('sha256').update(`${model.accountId}:${model.model}`).digest('hex').slice(0, 16)}` : null
    if (this.file && fs.existsSync(this.file)) {
      try {
        for (const line of fs.readFileSync(this.file, 'utf8').split('\n').filter(Boolean)) {
          const entry = JSON.parse(line)
          if (!Array.isArray(entry.calls) || !Array.isArray(entry.output)) throw new Error()
          for (const id of entry.calls) this.records.set(id, entry)
        }
      } catch { throw failure('REASONING_HISTORY_INVALID') }
    }
  }
  translate(body) {
    const names = new Map((body.tools || []).map(tool => [alias(tool.function.name), tool.function.name]))
    if (names.size !== (body.tools || []).length) throw failure('TOOL_NAME_COLLISION')
    const input = []; const replayed = new Set()
    for (const message of body.messages || []) {
      if (message.role === 'tool') {
        const output = typeof message.content === 'string' ? message.content : (message.content || []).map(part => {
          if (part.type === 'text') return { type: 'input_text', text: part.text }
          if (part.type === 'image_url') return { type: 'input_image', image_url: part.image_url.url }
          throw failure('UNSUPPORTED_TOOL_OUTPUT')
        })
        input.push({ type: 'function_call_output', call_id: message.tool_call_id, output }); continue
      }
      const parts = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content || []
      const content = parts.filter(part => part.type !== 'text' || part.text).map(part => {
        if (part.type === 'text') return { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: part.text }
        if (part.type === 'image_url' && message.role !== 'assistant') return { type: 'input_image', image_url: part.image_url.url }
        throw failure('UNSUPPORTED_MESSAGE_CONTENT')
      })
      if (content.length) input.push({ role: message.role === 'system' ? 'developer' : message.role, content })
      for (const call of message.tool_calls || []) {
        const record = this.records.get(call.id)
        if (record) {
          if (!replayed.has(record)) {
            // Only replay calls still present in the SDK history (compaction may prune others).
            const ids = new Set(message.tool_calls.map(c => c.id))
            input.push(...record.output.filter(item => item.type === 'reasoning' || ids.has(item.call_id)))
            replayed.add(record)
          }
        } else input.push({ type: 'function_call', call_id: call.id, name: alias(call.function.name), namespace: NAMESPACE, arguments: call.function.arguments })
      }
    }
    const request = { model: this.model.model, store: false, stream: true, input, include: ['reasoning.encrypted_content'] }
    if (body.tools?.length) request.tools = [{ type: 'namespace', name: NAMESPACE, description: 'Tools provided and executed by Stable on the user device.', tools: body.tools.map(tool => ({ type: 'function', name: alias(tool.function.name), description: tool.function.description || '', parameters: tool.function.parameters, strict: false })) }]
    if (body.tool_choice && typeof body.tool_choice === 'string') request.tool_choice = body.tool_choice
    else if (body.tool_choice?.function?.name) request.tool_choice = { type: 'function', name: alias(body.tool_choice.function.name), namespace: NAMESPACE }
    if (typeof body.parallel_tool_calls === 'boolean') request.parallel_tool_calls = body.parallel_tool_calls
    if (body.reasoning_effort) request.reasoning = { effort: body.reasoning_effort }
    if (body.response_format?.type === 'json_schema') request.text = { format: { type: 'json_schema', ...body.response_format.json_schema } }
    return { request, names }
  }
  remember(output) {
    const items = output.filter(item => ['reasoning', 'function_call'].includes(item.type))
    const calls = items.filter(item => item.type === 'function_call').map(item => item.call_id)
    if (!calls.length) return
    const entry = { calls, output: items }
    if (this.file) fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600, flush: true })
    for (const id of calls) this.records.set(id, entry)
  }
  async request(body, signal) {
    const { request, names } = this.translate(body)
    const upstream = await this.account.request(this.model, request, signal)
    const self = this; const encoder = new TextEncoder()
    // Text streams immediately. Function calls are emitted only after completed.
    const iterator = (async function* () {
      let completed = false; let emittedText = ''; const seenCalls = new Set(); const doneItems = new Map()
      for await (const event of readSSE(upstream.body)) {
        if (event.type === 'response.output_item.done') {
          if (!Number.isInteger(event.output_index) || event.output_index < 0 || !event.item || doneItems.has(event.output_index)) throw failure('INVALID_OUTPUT_ITEM')
          doneItems.set(event.output_index, event.item)
        } else if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') {
          const text = event.delta || ''; emittedText += text
          yield { choices: [{ delta: { content: text } }] }
        } else if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
          throw apiError(event.response || event, 400)
        } else if (event.type === 'response.completed') {
          const response = event.response
          if (!response || response.status !== 'completed' || !Array.isArray(response.output)) throw failure('STREAM_INCOMPLETE')
          // SIWC can omit output from the final event; completed per-item events
          // are authoritative, but never release them before response.completed.
          const output = response.output.length ? response.output : [...doneItems].sort(([a], [b]) => a - b).map(([, item]) => item)
          const calls = output.filter(item => item.type === 'function_call')
          const toolCalls = calls.map((call, index) => {
            if (!call.call_id || seenCalls.has(call.call_id) || (call.status && call.status !== 'completed') || (call.namespace && call.namespace !== NAMESPACE)) throw failure('INVALID_TOOL_CALL')
            seenCalls.add(call.call_id)
            // Unknown names go through the existing bridge's bounded correction path.
            return { index, id: call.call_id, type: 'function', function: { name: names.get(call.name) || call.name, arguments: call.arguments } }
          })
          const text = output.filter(item => item.type === 'message').flatMap(item => item.content || []).map(part => part.text || part.refusal || '').join('')
          if (!emittedText && text) yield { choices: [{ delta: { content: text } }] }
          else if (text && emittedText !== text) throw failure('STREAM_TEXT_MISMATCH')
          if (!text && !emittedText && !toolCalls.length) throw failure('EMPTY_MODEL_RESPONSE')
          self.remember(output)
          const usage = response.usage || {}
          completed = true
          yield { choices: [{ delta: { tool_calls: toolCalls }, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0, prompt_tokens_details: { cached_tokens: usage.input_tokens_details?.cached_tokens || 0 } } }
          break
        }
      }
      if (!completed) throw failure('STREAM_INCOMPLETE')
    })()
    let closed = false
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const next = await iterator.next()
          if (closed) return
          if (next.done) { closed = true; controller.close() }
          else controller.enqueue(encoder.encode(`data: ${JSON.stringify(next.value)}\n\n`))
        } catch (error) { if (!closed) { closed = true; controller.error(error.requestRejected ? error : failure('STREAM_INCOMPLETE')) } }
      },
      async cancel() { closed = true; await iterator.return() },
    }), { headers: { 'content-type': 'text/event-stream' } })
  }
}
module.exports = { ChatGPTResponses, alias }
