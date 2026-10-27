'use strict'
const { randomUUID } = require('node:crypto')
const { normalizeWebUrl } = require('./preview.cjs')

// Runs only in an isolated DOM world. It never accepts model-generated JS or
// exposes cookies, localStorage, password values, Node, the app bridge or files.
function pageAction(action, ref, value, snapshotId) {
  const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'
  const inventory = () => ({ total: document.images.length, truncated: document.images.length > 80,
    images: Array.from(document.images).slice(0,80).map((img,index)=>({index,id:img.id.slice(0,100),alt:img.alt.slice(0,120),
      naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,loaded:img.complete&&img.naturalWidth>0,rendered:visible(img)})),
    limits:'前80张图片的浏览器实际解码尺寸（含隐藏画廊图片）；未加载时尺寸为0。没有读取像素、数据URL或验证隐藏画面的布局。' })
  if (action === 'audit') {
    const width = innerWidth, height = innerHeight
    const all = document.querySelectorAll('body *'), nodes = Array.from(all).slice(0, 3000)
    const hiddenHeadings = [], hiddenText = [], overlays = [], horizontalOverflow = [], charts = [], imageGeometry = []
    const typography = { candidates: [], measuredLabels: 0, scanTruncated: false }
    const imageSpacing = { candidates: [], observedTargets: [], scanTruncated: false }
    const imageIndexes = new Map(Array.from(document.images).map((img,index)=>[img,index]))
    function measureImageSpace(img, rect) {
      if (!img.complete || !img.naturalWidth) return
      for(let parent=img.parentElement;parent;parent=parent.parentElement)if(Number(getComputedStyle(parent).opacity)===0)return
      for(let box=img.parentElement,depth=0;box&&depth<3;box=box.parentElement,depth++) {
        const target=`image-${imageIndexes.get(img)}-container-${depth}`
        imageSpacing.observedTargets.push(target)
        const css=getComputedStyle(box), bounds=box.getBoundingClientRect()
        if(!['auto','scroll','hidden','clip'].includes(css.overflowY) || bounds.width>rect.width*1.5) continue
        const bottom=bounds.top+box.clientTop+box.clientHeight-parseFloat(css.paddingBottom||0)
        const gap=Math.round(bottom-rect.bottom)
        if(gap<=Math.max(60,bounds.height*.10) || rect.bottom<=bounds.top || rect.top>bottom) continue
        if([...box.querySelectorAll('img')].filter(visible).length!==1) continue
        const children=box.querySelectorAll('*')
        if(children.length>200){imageSpacing.scanTruncated=true;continue}
        // Captions, controls, pseudo-content and other visible content below the
        // picture are not unused container space. Do not infer from pixels.
        let occupied=false
        for(const child of [box,...children]) {
          if(!visible(child)) continue
          if(['::before','::after'].some(p=>!['none','normal','""'].includes(getComputedStyle(child,p).content))){occupied=true;break}
          for(const node of child.childNodes) if(node.nodeType===3&&node.textContent.trim()) {
            const range=document.createRange();range.selectNodeContents(node)
            if(range.getBoundingClientRect().bottom>rect.bottom+8){occupied=true;break}
          }
          if(occupied)break
        }
        if(occupied)continue
        if(imageSpacing.candidates.length>=20){imageSpacing.scanTruncated=true;return}
        imageSpacing.candidates.push({target,label:img.alt.slice(0,120)||`图片 ${imageIndexes.get(img)+1}`,
          gap,container:{tag:box.tagName.toLowerCase(),id:box.id.slice(0,100),classes:String(box.className||'').slice(0,160),height:Math.round(bounds.height),overflowY:css.overflowY},
          imageHeight:Math.round(rect.height),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight})
        return
      }
    }
    let measuredCharacters = 0
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    function measureLabel(element, style, rect) {
      if (!element.matches('h1,h2,h3,h4,h5,h6,button,a,[role=tab],[role=button],[role=heading],label') ||
          style.writingMode !== 'horizontal-tb' || element.closest('svg')) return
      const label = (element.innerText || '').trim()
      if (label.length < 5 || label.length > 120 || !/\p{Script=Han}/u.test(label)) return
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (Number(getComputedStyle(ancestor).opacity) === 0) return
      }
      if (typography.measuredLabels >= 80 || measuredCharacters + label.length > 4096) { typography.scanTruncated = true; return }
      typography.measuredLabels++; measuredCharacters += label.length
      const lines = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        if (!visible(node.parentElement) || Number(getComputedStyle(node.parentElement).opacity) === 0) continue
        if (node.textContent.length > 240) { typography.scanTruncated = true; return }
        for (const { segment, index } of segments.segment(node.textContent)) {
          if (!segment.trim()) continue
          const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + segment.length)
          const bounds = range.getBoundingClientRect()
          if (bounds.width <= 0 || bounds.height <= 0) continue
          // Baseline centres tolerate minor inline font-size differences.
          const y = bounds.top + bounds.height / 2
          let line = lines.find(l => Math.abs(l.y - y) < Math.min(l.height, bounds.height) * .4)
          if (!line) { line = { y, height: bounds.height, characters: [] }; lines.push(line) }
          line.characters.push(segment)
        }
      }
      lines.sort((a, b) => a.y - b.y)
      const last = lines.at(-1)
      if (lines.length >= 2 && lines.length <= 4 && last.characters.length === 1 &&
          /\p{Script=Han}/u.test(last.characters[0]) && lines.at(-2).characters.length >= 3) {
        if (typography.candidates.length >= 20) { typography.scanTruncated = true; return }
        typography.candidates.push({ kind: 'single-character-last-line', tag: element.tagName.toLowerCase(), id: element.id.slice(0,100),
          label, lineCharacters: lines.map(l => l.characters.length), fontSize: style.fontSize,
          explicitBreak: !!element.querySelector('br'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
      }
    }
    const describe = (element, style, rect) => ({
      tag: element.tagName.toLowerCase(), id: element.id.slice(0, 100), classes: String(element.getAttribute('class') || '').slice(0, 160),
      label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 120),
      rect: Object.fromEntries(['x', 'y', 'width', 'height', 'right', 'bottom'].map(key => [key, Math.round(rect[key] * 10) / 10])),
      position: style.position, display: style.display, visibility: style.visibility, opacity: style.opacity, transform: style.transform,
    })
    for (const element of nodes) {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect()
      const rendered = visible(element) && Number(style.opacity) > 0
      const heading = element.matches('h1,h2,h3,h4,h5,h6,[role=heading]')
      const text = !element.matches('script,style,template,textarea,option') && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())
      if (heading && hiddenHeadings.length < 40 || text && hiddenText.length < 40) {
        let hiddenBy = null
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor)
          if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) { hiddenBy = describe(ancestor, css, ancestor.getBoundingClientRect()); break }
        }
        if (hiddenBy) {
          const observation = { ...describe(element, style, rect), hiddenBy }
          if (heading && hiddenHeadings.length < 40) hiddenHeadings.push(observation)
          if (text && hiddenText.length < 40) hiddenText.push(observation)
        }
      }
      if (rendered && rect.width > 0 && rect.height > 0) {
        measureLabel(element, style, rect)
        if (element.tagName === 'IMG' && imageGeometry.length < 40) {
          measureImageSpace(element,rect)
          const containers = []
          for (let ancestor = element.parentElement, depth = 0; ancestor && depth < 3; ancestor = ancestor.parentElement, depth++) {
            const bounds = ancestor.getBoundingClientRect(), css = getComputedStyle(ancestor)
            containers.push({ ...describe(ancestor, css, bounds), overflowY: css.overflowY, scrollHeight: ancestor.scrollHeight,
              spaceBelowImage: Math.round(Math.max(0, bounds.bottom - rect.bottom) * 10) / 10 })
          }
          imageGeometry.push({ ...describe(element, style, rect), alt: element.alt.slice(0, 120), naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight, objectFit: style.objectFit, loaded: element.complete && element.naturalWidth > 0, containers })
        }
        if ((style.position === 'fixed' || element.matches('dialog[open],[role=dialog]')) && overlays.length < 40) {
          overlays.push({ ...describe(element, style, rect), outsideViewport: rect.left < -1 || rect.top < -1 || rect.right > width + 1 || rect.bottom > height + 1 })
        }
        if ((rect.left < -1 || rect.right > width + 1) && rect.bottom > 0 && rect.top < height && horizontalOverflow.length < 40) horizontalOverflow.push(describe(element, style, rect))
      }
      if (element.matches('canvas,svg') && charts.length < 40) charts.push({ ...describe(element, style, rect), zeroSize: rect.width < 1 || rect.height < 1 })
    }
    return { title: document.title, url: location.href, viewport: { width, height }, documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow, hiddenHeadings, hiddenText, overlays, charts, imageGeometry,
      imageInventory:inventory(),imageSpacing:{...imageSpacing,scanTruncated:imageSpacing.scanTruncated||all.length>nodes.length||imageGeometry.length>=40,
        limits:'最多20项单图滚动/裁切容器的下方空白候选，检查3层祖先；排除底部padding、可见文字/伪元素及多图容器。不是像素判断，固定比例或设计留白仍须复核。'},
      typography: { ...typography, scanTruncated: typography.scanTruncated || all.length > nodes.length,
        limits: '最多80个短中文标题/控件、4096字符；末行单字是需复核候选，不自动判错。隐藏、竖排及长段落不测；显式换行、品牌排版可能有意。无候选不代表文字可读性已验收。' },
      scannedElements: nodes.length, scanTruncated: all.length > nodes.length,
      limits: '当前文档前3000个元素；每类最多40项。imageGeometry 只测当前显示图片及3层容器，spaceBelowImage 可能包含有意内容或留白，不自动判错；可辅助区分图片内空白与容器额外留白。隐藏标题也可能有意折叠。只读 DOM 观察不等于视觉、数据或交互验收通过。iframe 需单独 audit。', untrustedContent: true }
  }
  if (['click', 'fill', 'select'].includes(action)) {
    const element = globalThis.__stableElements?.get(ref)
    if (!element) throw new Error('元素引用已失效：read、scroll 等返回新 controls 后，旧 ref 不再可用。请使用最近一次 controls 中的 ref；不确定时重新 read。本次操作未执行。')
    if (!element.isConnected || !visible(element) || element.disabled) throw new Error('目标元素已失效或不可用：已移除、隐藏或禁用，请重新 read 核对页面状态。本次操作未执行。')
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
  const elements = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[role=button]')].filter(element=>{const r=element.getBoundingClientRect();return visible(element)&&r.bottom>0&&r.top<(innerHeight||900)&&r.right>0&&r.left<(innerWidth||1280)}).slice(0, 120)
  globalThis.__stableElements = new Map()
  const controls = elements.map((element, i) => {
    const id = `${snapshotId}:${i + 1}`; globalThis.__stableElements.set(id, element)
    const label = (element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.innerText || element.getAttribute('placeholder') || element.name || '').slice(0, 150)
    return { ref: id, tag: element.tagName.toLowerCase(), type: element.getAttribute('type'), label,
      href: element.tagName === 'A' ? element.href : null, disabled: !!element.disabled,
      ...(element instanceof HTMLSelectElement ? { options: [...element.options].slice(0, 50).map(o => ({ label: o.text, value: o.value })) } : {}) }
  })
  const body = document.body?.innerText || ''
  const compact=action==='read-compact',textLimit=compact?2000:20000
  const tables = compact?undefined:[...document.querySelectorAll('table')].filter(visible).slice(0, 5).map(table => [...table.rows].slice(0, 100).map(row => [...row.cells].slice(0, 30).map(cell => cell.innerText.slice(0, 1000))))
  return { title: document.title, url: location.href, viewport:{width:innerWidth,height:innerHeight,scrollY}, text: body.slice(0, textLimit), textTruncated: body.length > textLimit, controls, ...(compact?{}:{tables,imageInventory:inventory()}), limits: (compact?'精简快照：正文前2000字，省略表格；需要完整正文/表格时使用 read 或 detail=full。':'')+'最多120个元素、5张表，每表100行30列；当前文档；iframe 可通过 frames 获取 frameId 后单独读取。原生按键和拖拽需要展开浏览器。', untrustedContent: true }
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
    if (!['open', 'read', 'audit', 'click', 'fill', 'select', 'close'].includes(args.action)) throw new Error('未知浏览器操作。')
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
        const result = await evaluate(args.action === 'audit' ? 'audit' : 'read')
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

module.exports = { BrowserTool, pageAction }
