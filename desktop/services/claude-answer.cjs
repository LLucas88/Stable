'use strict'

// Only merge a proven max_tokens continuation, never ordinary progress text.
function joinContinuation(left, right) {
  if (!left) return right
  if (!right) return left
  // Identical text can be intentional (table rows, code, repeated prose).
  // Only repair an unfinished numbered Markdown marker at a line boundary,
  // outside a fenced code block. Event identity handles actual replay.
  let fence
  for (const line of left.split('\n')) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (!match) continue
    if (!fence) fence = match[1]
    else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = undefined
  }
  const marker = left.match(/(?:^|\n)(\*{0,2}[①-⑳] ?)$/u)?.[1]
  return left + (!fence && marker && right.startsWith(marker) ? right.slice(marker.length) : right)
}

function createClaudeAnswer() {
  let parts = [], awaiting = false, currentId, lastText = ''
  let candidateId, beforeCandidate
  const reasons = new Map(), seen = new Set()
  const text = () => parts.reduce((value, part) => joinContinuation(value, part.text), '')
  return {
    text,
    reset() { parts = []; awaiting = false; currentId = undefined; lastText = ''; candidateId = undefined; beforeCandidate = undefined; reasons.clear(); seen.clear() },
    sources() { return parts.map(part => ({ ...part, sourceIds: [...part.sourceIds] })) },
    stream(event) {
      if (event.type === 'message_start') currentId = event.message.id
      if (event.type === 'message_delta' && event.delta?.stop_reason) {
        reasons.set(currentId, event.delta.stop_reason)
        if (parts.at(-1)?.id === currentId) awaiting = event.delta.stop_reason === 'max_tokens'
      }
    },
    assistant(message) {
      const body = message.message, id = body.id || message.uuid
      const value = body.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      const tools = body.content.some(block => block.type === 'tool_use')
      const key = message.uuid || id
      if (key && seen.has(key)) return text()
      if (key) seen.add(key)
      if (!value && !tools) return text()
      // Native SDK emits text and tool blocks separately, even when they
      // belong to the same model message. Keep the pre-message state until
      // we know whether its text is a tool preamble or an answer.
      if (id !== candidateId || !beforeCandidate) {
        candidateId = id
        beforeCandidate = { parts: parts.map(part => ({ ...part, sourceIds: [...part.sourceIds] })), awaiting, lastText }
      }
      if (tools) {
        parts = beforeCandidate.parts.map(part => ({ ...part, sourceIds: [...part.sourceIds] }))
        awaiting = beforeCandidate.awaiting
        lastText = beforeCandidate.lastText
        // A truncated body may need a tool before continuation. Keep it, but
        // do not add the tool's explanatory preamble to that body.
        if (!awaiting) { parts = []; lastText = '' }
        return text()
      }
      if (value) {
        const previous = parts.at(-1)
        if (id && previous?.id === id && !tools) {
          // The SDK may emit individual text blocks from one model message.
          previous.text += '\n' + value
          previous.sourceIds.push(key)
        } else {
          if (!awaiting || tools) parts = []
          parts.push({ id, text: value, sourceIds: [key], time: Date.now() })
        }
        lastText = value
      }
      awaiting = !tools && (body.stop_reason || reasons.get(id)) === 'max_tokens'
      return text()
    },
    finish(result) {
      if (awaiting) throw Object.assign(Error('回答达到单次输出上限，但续写尚未完成；已保留收到的内容。'), { code: 'CLAUDE_ANSWER_INCOMPLETE' })
      const final = typeof result === 'string' ? result : ''
      if (parts.length && (!final.trim() || final.trim() === lastText.trim() || final.trim() === parts.at(-1).text.trim() || final.trim() === text().trim())) return text()
      return final || text()
    },
  }
}

module.exports = { createClaudeAnswer, joinContinuation }
