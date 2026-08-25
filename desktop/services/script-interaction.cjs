'use strict'

const PROMPT_PATTERN = /(?:(?:请输入|请选择|请确认|是否|确认继续|按任意键|press any key|enter (?:a |your )?(?:value|choice|selection)|select|choose|confirm|continue)[^\r\n]{0,240}|yes\s*\/\s*no|\[[yn]\s*\/\s*[yn]\]|\?|？|\.\s*\.\s*\.)\s*$/i

function looksLikeScriptPrompt(value) {
  return PROMPT_PATTERN.test(String(value || '').trimEnd().slice(-6_000))
}

function parseScriptDecision(raw) {
  const clean = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 没有返回有效的控制台决策。')
  const value = JSON.parse(clean.slice(start, end + 1))
  const requestedAction = ['wait', 'answer', 'confirm'].includes(value.action) ? value.action : 'wait'
  const action = requestedAction === 'confirm' ? 'answer' : requestedAction
  return { action, answer: String(value.answer || '').replace(/[\r\n]+/g, ' ').slice(0, 8_192), reason: String(value.reason || '').slice(0, 300) }
}

module.exports = { looksLikeScriptPrompt, parseScriptDecision }
