'use strict'
const { randomUUID } = require('node:crypto')

const WAIT_MARKER = '[[STABLE_WAITING_FOR_INPUT]]'
const CLARIFICATION_GUIDANCE = `Stable 当前澄清策略（覆盖旧全局规则中“每次先问”及 95% 的提问频率要求，其他规则仍适用）：简单问候、自我介绍、能力介绍、明确的知识问答和需求完整的任务直接处理。仅在自评完成任务的信心低于 90%，且存在会影响结果、无法从已有上下文或可读取资源获得的关键信息时提问。90% 是自评阈值，不是成功率保证。不要为确认而确认，先利用可读取的证据。每次聚焦一个关键决策，梳理目标及缺口，给出两条具体、互斥且可行的路线：第一条为推荐路线，各带一句影响说明，另给用户自由补充的提示。需要提问时结束本轮，在最终回答第一行写 ${WAIT_MARKER}，后面只写 JSON：{"question":"具体问题","hint":"说明缺口以及可补充哪些信息","options":[{"label":"推荐路线","description":"效果与取舍"},{"label":"另一条路线","description":"效果与取舍"}]}。已有的公开说明、已知结论或进展可放入 explanation 字符串，保留在过程记录中；不要编造操作或输出内部推理。不要调用 request_user_input。用户选择后按原任务与补充继续，不重复询问已回答的问题。问题和选项名称须简短具体，补充处理说明仅放在 description 中。必须等待用户提交回答后才能继续；等待没有时限，关闭卡片、切换任务或未操作均不代表回答或授权，不得自动采用推荐路线。`

function parseObject(value) {
  try { return JSON.parse(String(value).trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '')) } catch { return null }
}
function normalizeCard(value) {
  if (!value || typeof value.question !== 'string' || !value.question.trim() || !Array.isArray(value.options) || value.options.length !== 2) return null
  if (value.options.some(option => typeof option?.label !== 'string' || typeof option?.description !== 'string')) return null
  const options = value.options.map(option => ({ label: String(option?.label || '').trim().slice(0, 160), description: String(option?.description || '').trim().slice(0, 400) }))
  if (options.some(option => !option.label || !option.description) || options[0].label === options[1].label) return null
  return { question: value.question.trim().slice(0, 1200), hint: String(value.hint || '').trim().slice(0, 600), options,
    ...(typeof value.explanation === 'string' && value.explanation.trim() ? { explanation: value.explanation.trim().slice(0, 8000) } : {}) }
}
function waitingCard(value) {
  const text = String(value || '').trim()
  // A standalone protocol line may follow public explanation. Never interpret
  // inline examples or fenced code as an actionable question.
  const match = /(?:^|\n)[ \t]*\[\[STABLE_WAITING_FOR_INPUT\]\][ \t]*(?:\r?\n|(?=\{))/.exec(text)
  if (!match) return null
  const prefix = text.slice(0, match.index).trim()
  if ((prefix.match(/^\s*```/gm) || []).length % 2) return null
  const card = normalizeCard(parseObject(text.slice(match.index + match[0].length)))
  if (!card) return null
  const explanation = [prefix, card.explanation].filter(Boolean).join('\n\n').slice(0, 8000)
  return { ...card, ...(explanation ? { explanation } : {}) }
}
function waitingAnswer(value) {
  const text = String(value || '').trim()
  const card = waitingCard(text)
  if (card) return card.question
  if (text.startsWith(WAIT_MARKER)) {
    const body = text.slice(WAIT_MARKER.length).trim()
    return waitingCard(text)?.question || parseObject(body)?.question || (body.startsWith('{') ? '请补充影响任务结果的关键信息。' : body) || '请补充影响任务结果的关键信息。'
  }
  if (/^(?:开始前[，,：:]?\s*)?(?:请问|请先确认|需要先确认|在开始之前)/.test(text) && /[？?]/.test(text)) return text
  if (/^(?:请|需要你|需要您)[^\n]{0,40}(?:提供|上传|补充|确认)[^\n]{0,40}(?:源文件|数据源|日期|时间范围|品牌|字段|口径|目标|读者|格式|交付)/.test(text)) return text
  return null
}
function clarificationStream() {
  const buffers = new Map(), hidden = new Set()
  return (id, delta) => {
    if (hidden.has(id)) return ''
    const buffer = (buffers.get(id) || '') + delta
    const marker = buffer.indexOf(WAIT_MARKER)
    if (marker >= 0) { buffers.delete(id); hidden.add(id); return buffer.slice(0, marker) }
    // Keep only a possible partial marker, allowing explanation to stream.
    let pending = 0
    for (let n = 1; n < WAIT_MARKER.length && n <= buffer.length; n++) {
      if (WAIT_MARKER.startsWith(buffer.slice(-n))) pending = n
    }
    buffers.set(id, pending ? buffer.slice(-pending) : '')
    return pending ? buffer.slice(0, -pending) : buffer
  }
}

function pendingClarification(messages) {
  const latest = (messages || []).at(-1)
  if (latest?.role !== 'assistant') return null
  return latest.trace?.findLast(item => item.clarification?.status === 'waiting')?.clarification || null
}

// Keep delivery records separate, but persist their logical task boundary in the
// trace so refresh/recovery can reconstruct one continuous clarification turn.
function clarificationTurn(messages, prompt, deliveryId, time = Date.now()) {
  const previous = (messages || []).at(-1)
  const resumes = pendingClarification(messages) && !/^(?:新任务|换个任务|换一个任务)[：:]/.test(String(prompt).trim())
  const times = resumes ? (previous.trace || []).map(item => item.startedAt ?? item.time).filter(Number.isFinite) : []
  const startedAt = times.length ? Math.min(...times) : time
  return { id: 'task-continuity', runId: deliveryId, kind: 'status', title: '', status: 'completed', time: startedAt, startedAt,
    ...(resumes ? { continuationOf: previous.id } : {}) }
}

function cleanPayload(payload) {
  return {
    ...(payload.design ? {design: require('./design-request.cjs').validateDesignRequest(payload.design)} : {}),
    prompt: String(payload.prompt || ''),
    attachments: (Array.isArray(payload.attachments) ? payload.attachments : []).slice(0, 24).map(item => ({ name: String(item?.name || ''), path: String(item?.path || ''), type: String(item?.type || ''), size: Number(item?.size) || 0 })),
    references: (Array.isArray(payload.references) ? payload.references : []).slice(0, 100).map(item => ({ kind: String(item?.kind || ''), id: String(item?.id || ''), name: String(item?.name || '') })),
  }
}

function mergePayload(original, reply) {
  const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()]
  return {
    ...(reply.design || original.design ? {design: reply.design || original.design} : {}),
    prompt: `${original.prompt}\n\n用户补充（以最新要求为准）：\n${reply.prompt}`,
    attachments: unique([...original.attachments, ...reply.attachments], item => item.path),
    references: unique([...original.references, ...reply.references], item => `${item.kind}:${item.id}`),
  }
}

function clarificationTrace(payload, answer, runId = 'clarification', card) {
  const details = normalizeCard(card) || {
    question: answer, hint: '可补充目标、使用场景或必须遵守的限制。',
    options: [
      { label: '采用合理默认值继续', description: '模型先说明假设，完成现有信息支持的部分。' },
      { label: '先提供方案与待补充清单', description: '先梳理做法，依赖缺失信息的部分留待补充。' },
    ],
  }
  return { id: 'clarification', runId, kind: 'status', title: '等待你补充信息', detail: '需要用户回答，提交后继续。', status: 'completed', time: Date.now(), clarification: { ...details, id: randomUUID(), status: 'waiting', payload: cleanPayload(payload) } }
}

function isSimpleChat(payload) {
  if (payload.attachments?.length || payload.references?.length) return false
  const text = String(payload.prompt || '').trim()
  if (!text) return false
  if (isKnowledgeQuestion(text)) return true
  // Whole-message matching prevents a greeting/identity prefix from skipping
  // assessment for an appended file task, approval or other requirement.
  const parts = text.split(/[，,。？！?!；;\n]+/).map(value => value.trim()).filter(Boolean)
  return parts.length > 0 && parts.every(part => /^(?:(?:你好|您好|嗨)\s*)?(?:(?:请问)?你(?:现在|当前|到底)?(?:是(?:什么|哪个|哪种)模型|用的(?:是)?(?:什么|哪个|哪种)模型|叫什么(?:名字)?|是谁|能(?:帮我)?(?:做哪些事|做什么|做些什么)|有什么功能)|(?:请)?介绍(?:一下)?你自己)?(?:呀|啊|呢|吗)?$/.test(part)
    || /^(?:谢谢(?:你)?|多谢|感谢|早上好|晚上好|hello|hi)$/i.test(part))
}

// A conservative whole-message route, not a general intent classifier. It only
// removes the extra assessor/predictor; the execution model and tool approvals
// still apply. Mixed requests, resources and context-dependent questions stay out.
function isKnowledgeQuestion(text) {
  if (text.length > 160 || /[\n；;。](?!\s*$)/.test(text)) return false
  if (/\b(?:then|also|delete|modify|execute|upload|download|send|purchase|latest|today)\b|\band\s+(?:run|write|create|save|open|search)\b/i.test(text)) return false
  if (/(?:然后|顺便|并且|再帮|帮我|文件|附件|截图|报告|这份|这个|上述|刚才|它|删除|写入|修改|执行|运行|发送|购买|支付|上传|下载|联网|搜索|查一下|今天|最新|实时|账户|账号)/i.test(text)) return false
  const clean = text.replace(/[。？?！!]\s*$/, '').trim()
  if (/^(?:请)?(?:计算)?\s*-?\d+(?:\.\d+)?\s*[+\-*/×÷]\s*-?\d+(?:\.\d+)?\s*(?:等于(?:多少|几)|是多少|=\s*)$/.test(clean)) return true
  const term = '[\\p{L}\\p{N} _+.#/-]{1,48}'
  return new RegExp(`^(?:请(?:问)?\\s*)?(?:(?:用一句话|简单|简要|通俗地)\\s*)?(?:(?:解释|介绍|说明)(?:一下)?(?:什么是)?${term}|什么是${term}|${term}是什么(?:意思)?|${term}和${term}(?:有)?什么区别)$`, 'u').test(clean)
    || /^(?:please\s+)?(?:briefly\s+)?(?:what is|define|explain) [a-z0-9 +.#/-]{1,60}\??$/i.test(text)
}

async function clarifyBeforeExecution({ payload, messages, ask }) {
  const reply = cleanPayload(payload)
  const pending = pendingClarification(messages)
  if (pending && /^(?:取消|取消任务|停止|不用了|算了)[。！!\s]*$/.test(reply.prompt)) return { status: 'cancelled', answer: '已取消待澄清的任务。', payload: reply }
  const resuming = Boolean(pending && !/^(?:新任务|换个任务|换一个任务)[：:]/.test(reply.prompt))
  const effective = resuming ? mergePayload(cleanPayload(pending.payload), reply) : reply
  const { designCountConflict, explicitImageCount } = require('./design-request.cjs')
  const previousConflict = resuming && designCountConflict(pending.payload)
  if (previousConflict && pending.question === previousConflict.question) {
    const chosenCount = explicitImageCount(reply.prompt)
    if (chosenCount) {
      effective.design = { ...effective.design, count: chosenCount }
      return { status: 'ready', payload: effective }
    }
    return { status: 'waiting', answer: previousConflict.question, payload: effective,
      trace: [clarificationTrace(cleanPayload(pending.payload), previousConflict.question, 'clarification', previousConflict)] }
  }
  const countConflict = designCountConflict(effective)
  if (countConflict) return { status: 'waiting', answer: countConflict.question, payload: effective,
    trace: [clarificationTrace(effective, countConflict.question, 'clarification', countConflict)] }
  // A validated card response already settles this decision. The execution model
  // still checks evidence and handles any genuinely new gaps in context.
  if (payload.clarificationResolved) return { status: 'ready', payload: effective }
  const latest = (messages || []).at(-1)
  // An executed conversation already has task/resource context. Let the same
  // execution model inspect it and ask inline if needed, rather than launching
  // another tool-less SDK run for every follow-up edit. This never answers a
  // pending question or grants tool approval.
  const executedFollowup = !resuming && !/^(?:新任务|换个任务|换一个任务)[：:]/.test(reply.prompt.trim())
    && latest?.role === 'assistant' && !waitingAnswer(latest.content)
    && (messages || []).some(message => message.role === 'user' && String(message.content || '').trim())
    && latest.trace?.some(item => item.kind === 'tool')
    && !latest.trace?.some(item => item.kind === 'approval' && ['running', 'pending'].includes(item.status))
  if (executedFollowup) return { status: 'ready', payload: effective }
  const continuation = /^(?:请)?(?:继续(?:执行|处理|完成)?|接着做|接着执行|接着处理)(?:吧)?[。！!\s]*$/.test(reply.prompt.trim())
  // Resume the existing task; the execution runner still enforces approvals.
  if (continuation && !pending && !effective.attachments.length && !effective.references.length
    && latest?.role === 'assistant' && !waitingAnswer(latest.content)
    && (messages || []).some(message => message.role === 'user' && String(message.content || '').trim())
    && !latest.trace?.some(item => item.kind === 'approval' && ['running', 'pending'].includes(item.status))) {
    return { status: 'ready', payload: effective }
  }
  const awaitingApproval = latest?.trace?.some(item => item.kind === 'approval' && ['running', 'pending'].includes(item.status))
  const simple = !resuming && !awaitingApproval && isSimpleChat(effective)
  if (simple || /(?:^|[。！!，,；;\n])\s*(?:本次)?(?:不用|不要|无需)(?:先)?(?:提问|问我|确认)/.test(reply.prompt.trim())) return { status: 'ready', payload: effective }
  const prompt = [
    '执行前的信息充分性判断。本阶段没有执行工具。遵循当前 90% 策略，覆盖旧的“每次先问”要求。',
    '若信心至少 0.9，或没有影响结果的关键信息缺口，直接返回 {"status":"ready"}。简单问答直接 ready。资源尚未读取不等于信息缺失；可从已有文件或仓库核实的问题，交给执行阶段读取，不问用户。',
    '仅在自评信心低于 0.9 且存在具体缺口时返回 {"status":"waiting","confidence":0.7,"missing":"影响结果的缺口","question":"一个清晰具体的问题","hint":"解释为什么要问，以及自由回答可提供哪些信息","options":[{"label":"推荐的具体路线","description":"效果与取舍"},{"label":"另一条互斥路线","description":"效果与取舍"}]}。必须两条有实际意义的路线，不使用笼统的同意/不同意。第一条应是无需虚构事实也可推进的推荐路线。',
    '只返回 JSON。当前用户要求优先于历史。已回答的内容不要重复提问。不要将澄清当作权限审批。',
    '若需要提问，已有可向用户说明的事实、已知结论或进展请放入 explanation 字符串，将展示在过程记录中；没有则省略。不要编造已完成的操作，也不要输出内部推理。',
    '最近对话：\n' + (messages || []).slice(-6).map(message => message.role + '：' + String(message.content || '').slice(-2000)).join('\n'),
    resuming ? '上一轮问题：' + pending.question : '',
    '当前任务与补充：\n' + effective.prompt,
    effective.design ? '本条图片参数：' + JSON.stringify(effective.design) + '。文字中的生成数量若与参数冲突，先提问，不自动覆盖参数或直接生成；已明确回答的数量选择按最新回答执行。' : '',
    '已提供的资源名称（待执行阶段读取）：' + [...effective.attachments, ...effective.references].map(item => item.name).join('、'),
  ].filter(Boolean).join('\n\n')
  const parsed = parseObject(await ask(prompt))
  const card = normalizeCard(parsed)
  // Invalid assessment output must not manufacture an extra confirmation step.
  if (parsed?.status !== 'waiting' || typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence >= 0.9 || (typeof parsed.missing !== 'string' || !parsed.missing.trim()) || !card) return { status: 'ready', payload: effective }
  const explanation = card.explanation || card.hint
  const trace = explanation && explanation !== card.question ? [{ id: 'clarification-explanation', runId: 'clarification', kind: 'reasoning', eventType: 'agent/answer', title: '提问前说明', content: explanation, status: 'completed', time: Date.now() }] : []
  return { status: 'waiting', answer: card.question, payload: effective, trace: [...trace, clarificationTrace(effective, card.question, 'clarification', card)] }
}

async function formatClarification(answer, ask, task = '') {
  const card = waitingCard(answer)
  if (card) return card
  return normalizeCard(parseObject(await ask('将执行中发现的信息缺口整理为提问卡片。只返回 JSON：{"question":"具体问题","hint":"缺口说明与自由回答提示","options":[{"label":"推荐路线","description":"效果与取舍"},{"label":"另一条路线","description":"效果与取舍"}]}。两条路线须互斥，问题和选项名称须简短具体，第一条是推荐答案，只有用户提交回答后才可继续，不假设缺失文件/事实存在，不绕过权限审批。原任务：\n' + task + '\n原问题：\n' + answer)))
}
module.exports = { isSimpleChat, clarificationTurn, clarificationStream, WAIT_MARKER, CLARIFICATION_GUIDANCE, waitingAnswer, waitingCard, normalizeCard, pendingClarification, cleanPayload, clarificationTrace, clarifyBeforeExecution, formatClarification }
