'use strict'
// Opt-in real subscription acceptance. Uses an isolated profile and synthetic text.
// Run with Electron from the repository root: electron tests/chatgpt-live-ui.cjs --live
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')
const mock = process.argv.includes('--mock')
if (!mock && !process.argv.includes('--live')) throw Error('Explicit --live consent is required')
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.local', mock ? 'chatgpt-ui-fixture' : 'chatgpt-integration')
const profile = path.join(output, 'profile')
fs.mkdirSync(path.join(profile, 'workspace'), { recursive: true })
const fixture = path.join(profile, 'workspace', 'chatgpt-read-test.txt')
fs.writeFileSync(fixture, 'STABLE_CHATGPT_TOOL_OK', 'utf8')
process.env.STABLE_QA_USER_DATA = profile
process.env.STABLE_CLOUD_ENABLED = '0'
app.getAppPath = () => root
app.disableHardwareAcceleration()
const report = { startedAt: new Date().toISOString(), profile, checks: [] }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
if (!mock) {
  const service = require('../desktop/services/chatgpt-account.cjs')
  const { readSSE } = require('../desktop/services/model-provider.cjs')
  report.protocol = []
  service.ChatGPTAccount = class extends service.ChatGPTAccount {
    async request(...args) {
      report.inferenceRequests = (report.inferenceRequests || 0) + 1
      if (report.inferenceRequests > 4) throw service.failure('TEST_REQUEST_BUDGET_EXCEEDED')
      const response = await super.request(...args); const iterator = readSSE(response.body); const encoder = new TextEncoder()
      if (!process.argv.includes('--diagnostic')) return response
      let closed = false
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            const next = await iterator.next()
            if (closed) return
            if (next.done) { closed = true; controller.close(); return }
            const event = next.value
            report.protocol.push({ type: event.type, keys: Object.keys(event), status: event.response?.status, responseKeys: event.response ? Object.keys(event.response) : [], outputTypes: event.response?.output?.map(item => item.type), itemType: event.item?.type })
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch (error) { if (!closed) { closed = true; report.protocol.push({ failure: error.code || error.name }); controller.error(error) } }
        },
        async cancel() { closed = true; await iterator.return() },
      }), { headers: response.headers })
    }
  }
}
if (mock) {
  const service = require('../desktop/services/chatgpt-account.cjs')
  service.ChatGPTAccount = class extends service.ChatGPTAccount {
    async signIn() {
      this.busy = true; this.emit(); await wait(150)
      await this.locked(async () => {
        Object.assign(this.data, { subject: 'ui-fixture', clientId: 'ui-fixture-client', email: 'fixture@example.test', tokens: { access_token: 'mock-only', refresh_token: 'mock-only', id_token: 'mock-only' }, expiresAt: Date.now() + 86400_000, models: [{ slug: 'gpt-fixture', displayName: 'Fixture GPT' }] }); this.save()
      })
      this.busy = false; this.emit(); return this.state()
    }
    async request(_model, body) {
      let items
      if (!body.tools?.length) items = [{ type: 'message', content: [{ type: 'output_text', text: '{"status":"ready"}' }] }]
      else if (!body.input.some(item => item.type === 'function_call_output')) items = [{ type: 'function_call', namespace: 'stable_tools', call_id: 'call_ui_read', name: 'Read', arguments: JSON.stringify({ file_path: fixture }) }]
      else {
        assert(body.input.some(item => item.type === 'function_call_output' && JSON.stringify(item.output).includes('STABLE_CHATGPT_TOOL_OK')))
        items = [{ type: 'message', content: [{ type: 'output_text', text: 'STABLE_CHATGPT_TOOL_OK' }] }]
      }
      return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: items, usage: { input_tokens: 100, output_tokens: 5 } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })
    }
  }
}
async function until(fn, timeout = 30_000) { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await wait(200) } throw Error('Acceptance timed out') }
let driven = false
app.on('browser-window-created', (_event, window) => {
  // Background test only: never show or focus the app window.
  window.show = () => {}; window.showInactive = () => {}; window.focus = () => {}
  window.webContents.once('did-finish-load', () => {
    if (driven) return; driven = true
    void drive(window).catch(error => { report.error = error.message; console.error('LIVE_UI_FAILED', error.message); finish(1) })
  })
})
function finish(code) { report.mode = mock ? 'mock-provider-real-app' : 'live'; fs.writeFileSync(path.join(output, process.argv.includes('--restore-only') ? 'restart-ui-result.json' : 'live-ui-result.json'), JSON.stringify(report, null, 2)); app.once('will-quit', () => app.exit(code)); app.quit() }
async function drive(window) {
  const evaluate = async code => { report.lastStep = code.slice(0, 180); return window.webContents.executeJavaScript(code) }
  await until(() => evaluate('Boolean(window.stable && document.querySelector(".rail-account-trigger"))'))
  await evaluate('window.stable.settings.messagePredictions(false)')
  await evaluate('document.querySelector(".rail-account-trigger").click()')
  await until(() => evaluate('Boolean(document.querySelector(".account-menu-popover button"))'))
  await evaluate('Array.from(document.querySelectorAll(".account-menu-popover button")).find(b => b.textContent.includes("模型连接")).click()')
  await until(() => evaluate(`Boolean(document.querySelector('[aria-label="ChatGPT 订阅连接"]'))`))
  let status = await evaluate('window.stable.chatgpt.status()')
  report.restoredSession = status.status === 'connected'
  if (status.status !== 'connected') {
    await until(() => evaluate(`Array.from(document.querySelectorAll('[aria-label="ChatGPT 订阅连接"] button')).some(b => b.textContent === '登录 ChatGPT' && !b.disabled)`))
    await evaluate(`Array.from(document.querySelectorAll('[aria-label="ChatGPT 订阅连接"] button')).find(b => b.textContent === '登录 ChatGPT').click()`)
    console.log('CHATGPT_LOGIN_PENDING')
    await until(async () => { status = await evaluate('window.stable.chatgpt.status()'); if (status.status === 'error' || (status.status === 'disconnected' && status.message)) throw Error(status.message); return status.status === 'connected' }, 600_000)
  }
  report.checks.push('main_settings_login_connected')
  await until(() => evaluate(`document.querySelector('[aria-label="ChatGPT 订阅连接"]')?.textContent.includes('已连接')`))
  await until(() => evaluate('!document.querySelector(".launch-splash")'))
  await wait(1200)
  await window.webContents.capturePage()
  await wait(200)
  fs.writeFileSync(path.join(output, 'settings.png'), (await window.webContents.capturePage()).toPNG())
  const models = await evaluate('(async()=> (await window.stable.bootstrap()).models.items.filter(m=>m.providerId === "chatgpt").map(m=>({id:m.id,model:m.model})))()')
  assert(models.length); report.modelCount = models.length
  const selected = models.find(m => m.model === 'gpt-6.1-sol') || models[0]; report.model = selected.model
  const conversationId = await evaluate('(async()=>{const state=await window.stable.agent.create();return state.activeConversationId})()')
  await evaluate(`window.stable.agent.configurePermission(${JSON.stringify(conversationId)}, 'request')`)
  // Exercise the actual model picker before checking persisted selection.
  await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload() })
  await until(() => evaluate('Boolean(document.querySelector("#agent-prompt"))'))
  await evaluate(`document.querySelector('.model-menu summary').click()`)
  await evaluate(`document.querySelector('.effort-model-expand').click()`)
  await until(() => evaluate(`Boolean(document.querySelector('input[value="${selected.id}"]'))`))
  await evaluate(`document.querySelector('input[value="${selected.id}"]').click()`)
  await until(() => evaluate(`(async()=>{const b=await window.stable.bootstrap();return b.conversations.find(c=>c.id===${JSON.stringify(conversationId)})?.modelId===${JSON.stringify(selected.id)}})()`))
  await new Promise(resolve => { window.webContents.once('did-finish-load', resolve); window.webContents.reload() })
  await until(() => evaluate(`document.querySelector('.model-menu summary')?.textContent.includes('CHATGPT')`))
  report.checks.push('main_chat_model_selection_persisted')
  if (process.argv.includes('--restore-only')) { report.checks.push('restart_restored_encrypted_login'); console.log('CHATGPT_RESTART_OK'); finish(0); return }
  await evaluate(`window.__chatgptEvents=[];window.stable.agent.onEvent(event=>{window.__chatgptEvents.push(event);if(event.kind==='approval'&&event.status==='running')void window.stable.agent.answerApproval(${JSON.stringify(conversationId)},event.requestId,false)});void 0`)
  const prompt = `这是一项已授权的只读连通测试，目标和验收已明确，无需提问。仅用 Read 读取这个 UTF-8 文本文件：${fixture}。不要执行 Bash、写入、联网搜索或其他任务。读完仅回复文件内容。`
  await evaluate(`(()=>{const el=document.querySelector('#agent-prompt');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(prompt)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await until(() => evaluate('!document.querySelector(".composer-send")?.disabled'))
  await evaluate('document.querySelector(".composer-send").click()')
  console.log('CHATGPT_MAIN_CHAT_RUNNING')
  await until(async () => {
    const data = await evaluate('(async()=>{const b=await window.stable.bootstrap();return {messages:b.messages,running:b.runningConversationIds}})()')
    const answer = data.messages?.filter(m => m.role === 'assistant').at(-1)
    if (!answer) return false
    if (JSON.stringify(answer).includes('STABLE_CHATGPT_TOOL_OK')) { report.answer = answer.content; return true }
    if (answer.content) throw Error('Main chat returned: ' + String(answer.content).slice(0, 500))
    return false
  }, 180_000)
  const events = await evaluate('window.__chatgptEvents.map(e=>({id:e.id,kind:e.kind,status:e.status,title:e.title}))')
  report.events = events
  assert(events.some(e => e.status === 'completed' && /读取|Read|文件/.test(e.title || '')), 'Expected completed Read tool trace')
  await until(() => evaluate('document.body.innerText.includes("STABLE_CHATGPT_TOOL_OK")'))
  await until(() => evaluate('Boolean(document.querySelector(".composer-send"))'))
  await wait(500)
  await window.webContents.capturePage()
  await wait(200)
  fs.writeFileSync(path.join(output, 'chat.png'), (await window.webContents.capturePage()).toPNG())
  report.checks.push('main_chat_response', 'native_read_tool_completed', 'tool_result_visible_in_chat')
  console.log(mock ? 'CHATGPT_MOCK_UI_OK' : 'CHATGPT_LIVE_UI_OK', JSON.stringify({ model: report.model, checks: report.checks }))
  finish(0)
}
require(path.join(root, 'desktop', 'main.cjs'))
