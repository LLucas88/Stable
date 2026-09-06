'use strict'
const { randomUUID } = require('node:crypto')

const WAIT_MARKER = '[[STABLE_WAITING_FOR_INPUT]]'
const CLARIFICATION_GUIDANCE = `Stable 当前澄清策略（覆盖旧全局规则中“每次先问”及 95% 的提问频率要求，其他规则仍适用）：简单问候、自我介绍、能力介绍、明确的知识问答和需求完整的任务直接处理。仅在自评完成任务的信心低于 90%，且存在会影响结果、无法从已有上下文或可读取资源获得的关键信息时提问。90% 是自评阈值，不是成功率保证。不要为确认而确认，先利用可读取的证据。每次聚焦一个关键决策，梳理目标及缺口，给出两条具体、互斥且可行的路线：第一条为推荐路线，各带一句影响说明，另给用户自由补充的提示。需要提问时结束本轮，在最终回答第一行写 ${WAIT_MARKER}，后面只写 JSON：{"question":"具体问题","hint":"说明缺口以及可补充哪些信息","options":[{"label":"推荐路线","description":"效果与取舍"},{"label":"另一条路线","description":"效果与取舍"}]}。不要调用 request_user_input。用户选择后按原任务与补充继续，不重复询问已回答的问题。超时/跳过/关闭表示委托模型选择推荐路线，不是用户确认事实或授予操作权限，不得据此绕过权限审批、编造数据或文件；无法继续的部分说明缺失，完成可完成的部分。`

function parseObject(value) {
  try { return JSON.parse(String(value).trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '')) } catch { return null }
}
function normalizeCard(value) {
  if (!value || typeof value.question !== 'string' || !value.question.trim() || !Array.isArray(value.options) || value.options.length !== 2) return null
  if (value.options.some(option => typeof option?.label !== 'string' || typeof option?.description !== 'string')) return null
  const options = value.options.map(option => ({ label: String(option?.label || '').trim().slice(0, 160), description: String(option?.description || '').trim().slice(0, 400) }))
  if (options.some(option => !option.label || !option.description) || options[0].label === options[1].label) return null
  return { question: value.question.trim().slice(0, 1200), hint: String(value.hint || '').trim().slice(0, 600), options }
}
function waitingCard(value) {
  const text = String(value || '').trim()
  return text.startsWith(WAIT_MARKER) ? normalizeCard(parseObject(text.slice(WAIT_MARKER.length))) : null
}
function waitingAnswer(value) {
  const text = String(value || '').trim()
  if (text.startsWith(WAIT_MARKER)) {
    const body = text.slice(WAIT_MARKER.length).trim()
    return waitingCard(text)?.question || parseObject(body)?.question || (body.startsWith('{') ? '请补充影响任务结果的关键信息。' : body) || '请补充影响任务结果的关键信息。'
  }
  if (/^(?:开始前[，,：:]?\s*)?(?:请问|请先确认|需要先确认|在开始之前)/.test(text) && /[？?]/.test(text)) return text
  if (/^(?:请|需要你|需要您)[^\n]{0,40}(?:提供|上传|补充|确认)[^\n]{0,40}(?:源文件|数据源|日期|时间范围|品牌|字段|口径|目标|读者|格式|交付)/.test(text)) return text
  return null
}
function clarificationStream() {
  const buffers = new Map(), released = new Set(), hidden = new Set()
  return (id, delta) => {
    if (hidden.has(id)) return ''
    if (released.has(id)) return delta
    const buffer = (buffers.get(id) || '') + delta
    buffers.set(id, buffer)
    const candidate = buffer.trimStart()
    if (WAIT_MARKER.startsWith(candidate)) return ''
    buffers.delete(id)
    if (candidate.startsWith(WAIT_MARKER)) { hidden.add(id); return '' }
    released.add(id); return buffer
  }
}

function pendingClarification(messages) {
  const latest = (messages || []).at(-1)
  if (latest?.role !== 'assistant') return null
  return latest.trace?.findLast(item => item.clarification?.status === 'waiting')?.clarification || null
}

function cleanPayload(payload) {
  return {
    prompt: String(payload.prompt || ''),
    attachments: (Array.isArray(payload.attachments) ? payload.attachments : []).slice(0, 24).map(item => ({ name: String(item?.name || ''), path: String(item?.path || ''), type: String(item?.type || ''), size: Number(item?.size) || 0 })),
    references: (Array.isArray(payload.references) ? payload.references : []).slice(0, 100).map(item => ({ kind: String(item?.kind || ''), id: String(item?.id || ''), name: String(item?.name || '') })),
  }
}

function mergePayload(original, reply) {
  const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()]
  return {
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
  return { id: 'clarification', runId, kind: 'status', title: '等待你补充信息', detail: '可选择建议或自行补充；未操作时由模型选择推荐路线。', status: 'completed', time: Date.now(), clarification: { ...details, id: randomUUID(), status: 'waiting', payload: cleanPayload(payload) } }
}

async function clarifyBeforeExecution({ payload, messages, ask }) {
  const reply = cleanPayload(payload)
  const pending = pendingClarification(messages)
  if (pending && /^(?:取消|取消任务|停止|不用了|算了)[。！!\s]*$/.test(reply.prompt)) return { status: 'cancelled', answer: '已取消待澄清的任务。', payload: reply }
  const resuming = Boolean(pending && !/^(?:新任务|换个任务|换一个任务)[：:]/.test(reply.prompt))
  const effective = resuming ? mergePayload(cleanPayload(pending.payload), reply) : reply
  // A validated card response already settles this decision. The execution model
  // still checks evidence and handles any genuinely new gaps in context.
  if (payload.clarificationResolved) return { status: 'ready', payload: effective }
  const simple = !resuming && !effective.attachments.length && !effective.references.length && /^(?:(?:你好|您好|嗨)[，,！!。\s]*)?(?:(?:你叫什么(?:名字)?|你是谁|介绍(?:一下)?你自己)[，,。？?\s]*)?(?:(?:你能(?:帮我)?(?:做哪些事|做什么|做些什么)|你有什么功能)[。？?！!\s]*)?$/.test(reply.prompt.trim())
  if (simple || /(?:^|[。！!，,；;\n])\s*(?:本次)?(?:不用|不要|无需)(?:先)?(?:提问|问我|确认)/.test(reply.prompt.trim())) return { status: 'ready', payload: effective }
  const prompt = [
    '执行前的信息充分性判断。本阶段没有执行工具。遵循当前 90% 策略，覆盖旧的“每次先问”要求。',
    '若信心至少 0.9，或没有影响结果的关键信息缺口，直接返回 {"status":"ready"}。简单问答直接 ready。资源尚未读取不等于信息缺失；可从已有文件或仓库核实的问题，交给执行阶段读取，不问用户。',
    '仅在自评信心低于 0.9 且存在具体缺口时返回 {"status":"waiting","confidence":0.7,"missing":"影响结果的缺口","question":"一个清晰具体的问题","hint":"解释为什么要问，以及自由回答可提供哪些信息","options":[{"label":"推荐的具体路线","description":"效果与取舍"},{"label":"另一条互斥路线","description":"效果与取舍"}]}。必须两条有实际意义的路线，不使用笼统的同意/不同意。第一条应是无需虚构事实也可推进的推荐路线。',
    '只返回 JSON。当前用户要求优先于历史。已回答的内容不要重复提问。不要将澄清当作权限审批。',
    '最近对话：\n' + (messages || []).slice(-6).map(message => message.role + '：' + String(message.content || '').slice(-2000)).join('\n'),
    resuming ? '上一轮问题：' + pending.question : '',
    '当前任务与补充：\n' + effective.prompt,
    '已提供的资源名称（待执行阶段读取）：' + [...effective.attachments, ...effective.references].map(item => item.name).join('、'),
  ].filter(Boolean).join('\n\n')
  const parsed = parseObject(await ask(prompt))
  const card = normalizeCard(parsed)
  // Invalid assessment output must not manufacture an extra confirmation step.
  if (parsed?.status !== 'waiting' || typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence >= 0.9 || (typeof parsed.missing !== 'string' || !parsed.missing.trim()) || !card) return { status: 'ready', payload: effective }
  return { status: 'waiting', answer: card.question, payload: effective, trace: [clarificationTrace(effective, card.question, 'clarification', card)] }
}

async function formatClarification(answer, ask, task = '') {
  const card = waitingCard(answer)
  if (card) return card
  return normalizeCard(parseObject(await ask('将执行中发现的信息缺口整理为提问卡片。只返回 JSON：{"question":"具体问题","hint":"缺口说明与自由回答提示","options":[{"label":"推荐路线","description":"效果与取舍"},{"label":"另一条路线","description":"效果与取舍"}]}。两条路线须互斥，第一条在无补充时也可合理推进，不假设缺失文件/事实存在，不绕过权限审批。原任务：\n' + task + '\n原问题：\n' + answer)))
}
module.exports = { clarificationStream, WAIT_MARKER, CLARIFICATION_GUIDANCE, waitingAnswer, waitingCard, normalizeCard, pendingClarification, cleanPayload, clarificationTrace, clarifyBeforeExecution, formatClarification }
