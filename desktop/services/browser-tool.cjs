'use strict'
const { randomUUID } = require('node:crypto')
const { normalizeWebUrl } = require('./preview.cjs')

// Runs only in an isolated DOM world. It never accepts model-generated JS or
// exposes cookies, localStorage, password values, Node, the app bridge or files.
function pageAction(action, ref, value, snapshotId) {
  const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'
  if (['click', 'fill', 'select'].includes(action)) {
    const element = globalThis.__stableElements?.get(ref)
    if (!element?.isConnected || !visible(element) || element.disabled) throw new Error('元素已失效或不可用，请重新 read 获取 ref。')
    const type = (element.getAttribute('type') || '').toLowerCase()
    const hint = `${element.name || ''} ${element.autocomplete || ''} ${element.id || ''} ${element.getAttribute('aria-label') || ''}`
    if (['password', 'file', 'hidden'].includes(type) || /password|passwd|token|secret|one-time-code|credit.?card|cc-number|验证码|密码/i.test(hint)) throw new Error('敏感输入不能交给模型填写，请使用专门登录流程。')
    element.scrollIntoView({ block: 'center' })
    if (action === 'click') element.click()
    else if (action === 'select') {
      if (!(element instanceof HTMLSelectElement) || ![...element.options].some(o => o.value === value && !o.disabled)) throw new Error('目标不是可用下拉选项。')
      element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || element.readOnly || ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(type)) throw new Error('目标不是可填写的文本输入框。')
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return { actionPerformed: action }
  }
  const elements = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[role=button]')].filter(visible).slice(0, 120)
  globalThis.__stableElements = new Map()
  const controls = elements.map((element, i) => {
    const id = `${snapshotId}:${i + 1}`; globalThis.__stableElements.set(id, element)
    const label = (element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.innerText || element.getAttribute('placeholder') || element.name || '').slice(0, 150)
    return { ref: id, tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), label,
      href: element.tagName === 'A' ? element.href : null, disabled: !!element.disabled,
      ...(element instanceof HTMLSelectElement ? { options: [...element.options].slice(0, 50).map(o => ({ label: o.text, value: o.value })) } : {}) }
  })
  const body = document.body?.innerText || ''
  const tables = [...document.querySelectorAll('table')].filter(visible).slice(0, 5).map(table => [...table.rows].slice(0, 100).map(row => [...row.cells].slice(0, 30).map(cell => cell.innerText.slice(0, 1000))))
  return { title: document.title, url: location.href, text: body.slice(0, 20000), textTruncated: body.length > 20000, controls, tables, limits: '最多120个元素、5张表，每表100行30列；只读取主文档，iframe需单独打开允许的URL。', untrustedContent: true }
}

class BrowserTool {
  constructor({ electron }) { this.electron = electron; this.window = undefined; this.chain = Promise.resolve() }

  async ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window
    const { BrowserWindow, session } = this.electron
    this.session = session.fromPartition(`stable-agent-browser-${randomUUID()}`) // memory only, never persist/user profile
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    this.session.setPermissionCheckHandler(() => false)
    this.session.on('will-download', event => event.preventDefault())
    this.session.webRequest.onBeforeRequest((details, callback) => {
      const allowed = /^https?:\/\//i.test(details.url) || /^wss?:\/\//i.test(details.url) || details.url === 'about:blank' || ['image', 'font', 'media'].includes(details.resourceType) && /^(data|blob):/i.test(details.url)
      callback({ cancel: !allowed })
    })
    const window = new BrowserWindow({ show: false, width: 1280, height: 900, skipTaskbar: true,
      webPreferences: { session: this.session, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, backgroundThrottling: false, offscreen: true, disableDialogs: true } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', event => event.preventDefault())
    window.webContents.on('will-navigate', (event, url) => { try { normalizeWebUrl(url) } catch { event.preventDefault() } })
    this.window = window
    return window
  }

  execute(args, signal) {
    const running = this.chain.then(() => this.run(args, signal))
    this.chain = running.catch(() => {})
    return running
  }

  async run(args, signal) {
    signal?.throwIfAborted()
    if (!['open', 'read', 'click', 'fill', 'select', 'close'].includes(args.action)) throw new Error('未知浏览器操作。')
    if (args.action === 'close') { this.dispose(); return { closed: true } }
    if (args.action !== 'open' && (!this.window || this.window.isDestroyed())) throw new Error('请先 open 打开网页。')
    const url = args.action === 'open' ? normalizeWebUrl(args.url) : null
    if (['click', 'fill', 'select'].includes(args.action) && (typeof args.ref !== 'string' || args.ref.length > 100)) throw new Error('请使用最新快照的 ref。')
    if (['fill', 'select'].includes(args.action) && (typeof args.value !== 'string' || args.value.length > 4000)) throw new Error('请输入不超过4000字符的非敏感内容。')
    const window = await this.ensureWindow()
    if (signal?.aborted) { this.dispose(); signal.throwIfAborted() }
    let timer
    let rejectAbort
    const cancelled = new Promise((_resolve, reject) => { rejectAbort = reject })
    const abort = () => { this.dispose(); rejectAbort(new Error('网页操作已取消。')) }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const action = async () => {
        if (url) await window.loadURL(url)
        const evaluate = async (operation) => {
          const invocation = `(${pageAction.toString()})(${JSON.stringify(operation)},${JSON.stringify(args.ref || '')},${JSON.stringify(args.value || '')},${JSON.stringify(randomUUID())})`
          const response = await window.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(()=>{try{return {ok:true,value:${invocation}}}catch(error){return {ok:false,error:String(error.message||error)}}})()` }])
          if (!response.ok) throw new Error(response.error)
          return response.value
        }
        if (['click', 'fill', 'select'].includes(args.action)) {
          await evaluate(args.action)
          // Let a normal navigation/DOM event settle. Dynamic sites can be read again.
          await new Promise(resolve => setTimeout(resolve, 150))
          if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once('did-stop-loading', resolve))
        }
        signal?.throwIfAborted()
        const result = await evaluate('read')
        if (JSON.stringify(result).length > 200000) { result.tables = []; result.tablesOmitted = '表格过大，已保留正文和元素快照。' }
        return result
      }
      return await Promise.race([action(), cancelled, new Promise((_resolve, reject) => { timer = setTimeout(() => { this.dispose(); reject(new Error('网页操作超过30秒，请缩小任务或重试。')) }, 30_000) })])
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }

  dispose() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = undefined
    if (this.session) {
      this.session.webRequest.onBeforeRequest(null)
      void this.session.clearStorageData().catch(() => {})
      void this.session.closeAllConnections().catch(() => {})
      this.session = undefined
    }
  }
}

module.exports = { BrowserTool }
