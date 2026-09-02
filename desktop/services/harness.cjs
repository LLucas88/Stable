'use strict'

const { spawn, spawnSync } = require('node:child_process')
const { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, rmdirSync, unlinkSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')
const { isDeepSeekModel, isZhipuModel } = require('./model-registry.cjs')

const ZHIPU_SEARCH_PROVIDER_ID = 'zhipu-official'
const ZHIPU_SEARCH_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/web_search'

function isHttpSourceURL(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}

function mapZhipuSearchResponse(payload) {
  const sources = []
  const seen = new Set()
  for (const item of Array.isArray(payload?.search_result) ? payload.search_result : []) {
    const url = String(item?.link || '').trim()
    if (!isHttpSourceURL(url) || seen.has(url)) continue
    seen.add(url)
    const title = String(item?.title || '').trim()
    const snippet = String(item?.content || '').trim()
    const publishedAt = String(item?.publish_date || '').trim()
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    })
  }
  return { sources, truncated: false }
}

function createZhipuSearchProvider({ apiKey, WebError, fetchImpl = globalThis.fetch, endpoint = ZHIPU_SEARCH_ENDPOINT }) {
  const fail = (message, code = 'WEB_PROVIDER_ERROR', cause) => new WebError(message, code, cause === undefined ? undefined : { cause })
  const aborted = (signal, cause) => fail('智谱联网搜索已取消。', 'WEB_ABORTED', signal?.reason ?? cause)
  return {
    id: ZHIPU_SEARCH_PROVIDER_ID,
    available() { return Boolean(apiKey) && typeof fetchImpl === 'function' && isHttpSourceURL(endpoint) },
    async search(request, signal) {
      if (signal?.aborted) throw aborted(signal)
      const query = String(request?.query || '').trim().slice(0, 70)
      if (!query) throw fail('智谱联网搜索关键词不能为空。')
      const requestedCount = Number(request?.maxResults)
      const count = Number.isFinite(requestedCount) ? Math.max(1, Math.min(50, Math.trunc(requestedCount))) : 10
      let response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ search_query: query, search_engine: 'search_std', search_intent: false, count, search_recency_filter: 'noLimit', content_size: 'medium' }),
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw aborted(signal, error)
        throw fail(`智谱联网搜索请求失败：${String(error?.message || error)}`, 'WEB_PROVIDER_ERROR', error)
      }
      let payload
      try { payload = await response.json() }
      catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw aborted(signal, error)
        throw fail(`智谱联网搜索返回了无效数据（HTTP ${response.status}）。`, 'WEB_PROVIDER_ERROR', error)
      }
      if (!response.ok) {
        const detail = String(payload?.error?.message || payload?.message || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300)
        throw fail(`智谱联网搜索失败（HTTP ${response.status}）${detail ? `：${detail}` : '。'}`)
      }
      if (!Array.isArray(payload?.search_result)) throw fail('智谱联网搜索响应缺少 search_result。')
      const result = mapZhipuSearchResponse(payload)
      if (result.sources.length <= count) return result
      return { ...result, sources: result.sources.slice(0, count), truncated: true }
    },
  }
}

const ZHIPU_SEARCH_BRIDGE = [
  `const ZHIPU_SEARCH_PROVIDER_ID=${JSON.stringify(ZHIPU_SEARCH_PROVIDER_ID)};`,
  `const ZHIPU_SEARCH_ENDPOINT=${JSON.stringify(ZHIPU_SEARCH_ENDPOINT)};`,
  `${isHttpSourceURL.toString()};`,
  `${mapZhipuSearchResponse.toString()};`,
  `${createZhipuSearchProvider.toString()};`,
].join('')

const STDIN_BRIDGE = [
  "import path from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  "import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';",
  'const chunks=[];',
  'for await (const chunk of process.stdin) chunks.push(chunk);',
  'const cli=process.argv[1];',
  "const rawInput=Buffer.concat(chunks).toString('utf8');",
  "let task=rawInput;let imageInputs=[];try{const payload=JSON.parse(rawInput);if(payload&&typeof payload.prompt==='string'){task=payload.prompt;imageInputs=Array.isArray(payload.images)?payload.images:[];}}catch{}",
  "const packageEntry=(name)=>path.join(path.dirname(cli),'..','..',name,'lib','index.js');",
  "const {AgentLoop}=await import(pathToFileURL(packageEntry('dsh-agent-loop')).href);",
  "const {createUserMessage}=await import(pathToFileURL(packageEntry('dsh-llm')).href);",
  "const {WebError,WebRuntime}=await import(pathToFileURL(packageEntry('dsh-web')).href);",
  ZHIPU_SEARCH_BRIDGE,
  "const zhipuSearchKey=String(process.env.STABLE_ZHIPU_SEARCH_API_KEY||'');if(zhipuSearchKey){const zhipuSearchProvider=createZhipuSearchProvider({apiKey:zhipuSearchKey,WebError});WebRuntime.prototype.search=function(request,signal){return zhipuSearchProvider.search(request,signal);};}",
  "const originalCreateAgent=AgentLoop.prototype.createAgent;let imagesClaimed=false;",
  "AgentLoop.prototype.createAgent=async function(...args){const handle=await originalCreateAgent.apply(this,args);if(imagesClaimed||!imageInputs.length)return handle;imagesClaimed=true;const attachments=handle.agent.ctx.get('attachments');if(!attachments)throw new Error('Harness 图片存储服务不可用。');const refs=[];for(const input of imageInputs){const resolved=path.resolve(String(input.path||''));const relative=path.relative(process.cwd(),resolved);if(!resolved||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('图片只能从 Stable 工作区发送。');const mediaType=String(input.mediaType||'');const ref=await attachments.saveImage({data:readFileSync(resolved),mediaType,name:String(input.name||path.basename(resolved))});refs.push(ref);}const originalFollowup=handle.agent.followup.bind(handle.agent);handle.agent.followup=(message)=>originalFollowup(createUserMessage({content:[...message.content,...refs.map((attachment)=>({type:'image',attachment}))],source:message.source}));return handle;};",
  "const sessionPath=path.join(path.dirname(cli),'..','..','dsh-session','lib','index.js');",
  'const {Session}=await import(pathToFileURL(sessionPath).href);',
  'const originalAppend=Session.prototype.append;',
  'const toolNames=new Map();',
  'const agentNames=new Map();',
  "const clean=(value)=>String(value??'').replace(/[\\r\\n\\t]+/g,' ').replace(/\\s+/g,' ').trim().slice(0,180);",
  "const detail=(raw)=>{try{const value=JSON.parse(raw||'{}');const keys=['path','file','command','cmd','query','pattern','url'];for(const key of keys){if(value?.[key])return clean(value[key]);}}catch{}return '';};",
  "const publish=(event)=>process.stderr.write('STABLE_EVENT\\t'+JSON.stringify(event)+'\\n');",
  "const approvalDir=process.env.STABLE_APPROVAL_DIR;",
  "if(approvalDir){",
  "  mkdirSync(approvalDir,{recursive:true});",
  "  const approvalPath=path.join(path.dirname(cli),'..','..','dsh-user-approval','lib','index.js');",
  "  const {ApprovalService}=await import(pathToFileURL(approvalPath).href);",
  "  ApprovalService.prototype.decide=async function(req){",
  "    const requestId=`${Date.now()}-${Math.random().toString(16).slice(2)}`;",
  "    const toolName=clean(req.toolName||'未知操作');const reason=clean(req.reason||'该操作需要扩大权限');",
  "    const danger=/(delete|remove|unlink|rmdir|erase|overwrite|write|edit|replace|patch|move|rename|format|registry|regedit|unknown|删除|清空|覆盖|写入|编辑|替换|移动|重命名|格式化|注册表|未知程序)/i.test(`${toolName} ${reason}`);",
  "    publish({id:`approval:${requestId}`,kind:'approval',eventType:'approval/request',requestId,toolName,reason,danger,title:danger?'需要人工确认':'需要权限审批',detail:`${toolName} · ${reason}`,status:'running'});",
  "    const responsePath=path.join(approvalDir,`${requestId}.json`);",
  "    return await new Promise((resolve)=>{",
  "      const finish=(outcome)=>{try{if(existsSync(responsePath))unlinkSync(responsePath);}catch{}resolve(outcome);};",
  "      const timer=setInterval(()=>{try{if(!existsSync(responsePath))return;const value=JSON.parse(readFileSync(responsePath,'utf8'));clearInterval(timer);finish(value.allowed?'allowed-once':'rejected');}catch{}},100);",
  "      const abort=()=>{clearInterval(timer);finish('cancelled');};",
  "      if(req.signal?.aborted)abort();else req.signal?.addEventListener('abort',abort,{once:true});",
  "    });",
  "  };",
  "}",
  'Session.prototype.append=function(type,data,...opts){',
  '  const event=originalAppend.call(this,type,data,...opts);',
  '  const sessionId=String(this.id);const header=this.header||{};const parentSessionId=header.parentSession===undefined?undefined:String(header.parentSession);const depth=Number(header.delegationDepth||0);',
  '  const base={sessionId,parentSessionId,depth,time:event.time};',
  "  if(type==='subagent/descriptor'){const label=clean(data.label||'子 Agent');agentNames.set(sessionId,label);publish({...base,id:`${sessionId}:descriptor`,kind:'status',entity:'agent',eventType:'agent/descriptor',title:label,detail:`${clean(data.mode)} · ${clean(data.provider)}`,mode:data.mode,provider:clean(data.provider),status:'completed'});}",
  "  else if(type==='turn/start') publish({...base,id:`${sessionId}:agent`,kind:'status',entity:'agent',eventType:'agent/start',title:agentNames.get(sessionId)||(parentSessionId?'子 Agent':'Stable 总控'),detail:parentSessionId?'正在执行委派任务':'正在协调本次任务',status:'running'});",
  "  else if(type==='step/start') publish({...base,id:`${sessionId}:reasoning:${data.turn}:${data.step}`,kind:'reasoning',title:'分析任务与上下文',detail:'模型正在规划下一步动作',status:'running'});",
  "  else if(type==='assistant/chunk'&&!parentSessionId&&data.chunk?.type==='text-delta'&&data.chunk.text) publish({...base,id:`${sessionId}:answer:${data.turn}:${data.step}`,kind:'answer',eventType:'agent/answer-delta',turn:data.turn,step:data.step,delta:String(data.chunk.text),status:'running'});",
  "  else if(type==='tool/call'){const key=`${sessionId}:${data.callId}`;toolNames.set(key,data.name);publish({...base,id:`${sessionId}:tool:${data.callId}`,kind:'tool',entity:'tool',eventType:'tool/start',title:`使用工具 ${clean(data.name)}`,detail:detail(data.arguments),status:'running'});}",
  "  else if(type==='tool/result'){const key=`${sessionId}:${data.callId}`;const failed=Boolean(data.error);publish({...base,id:`${sessionId}:tool:${data.callId}`,kind:'tool',entity:'tool',eventType:'tool/end',title:`使用工具 ${clean(toolNames.get(key)||'工具')}`,detail:failed?clean(data.error?.message||'执行失败'):'执行完成',status:failed?'failed':'completed'});}",
  "  else if(type==='assistant/message') publish({...base,id:`${sessionId}:reasoning:${data.turn}:${data.step}`,kind:'reasoning',title:'整理回答',detail:parentSessionId?'正在向总控报告结果':'正在生成最终回答',status:'completed'});",
  "  else if(type==='turn/end'){const completed=data.reason?.kind==='completed';const cancelled=data.reason?.kind==='interrupted';publish({...base,id:`${sessionId}:agent`,kind:'status',entity:'agent',eventType:'agent/end',title:agentNames.get(sessionId)||(parentSessionId?'子 Agent':'Stable 总控'),detail:completed?(parentSessionId?'已向总控提交结果':'已完成任务'):clean(data.reason?.error?.message||data.reason?.kind||'执行中断'),status:completed?'completed':cancelled?'cancelled':'failed'});}",
  '  return event;',
  '};',
  "process.argv=[process.execPath,cli,'--profile','headless',task];",
  'await import(pathToFileURL(cli).href);',
].join('')

function buildHarnessEnvironment({ baseEnvironment = process.env, model, apiKey, approvalDir, dshHome, agentsHome, sandboxMode = 'workspace-write' }) {
  const environment = {
    ...baseEnvironment,
    STABLE_API_KEY: apiKey,
    STABLE_APPROVAL_DIR: approvalDir,
    DSH_HOME: dshHome,
    DSH_AGENTS_HOME: agentsHome,
    DSH_PERMISSION_MODE: sandboxMode === 'read-only' ? 'read-only' : 'workspace-write',
  }
  const usesCloudGateway = String(model?.providerId || '').toLowerCase() === 'stable-cloud'
  if (!usesCloudGateway && isDeepSeekModel(model)) {
    environment.DEEPSEEK_API_KEY = apiKey
    environment.DSH_WEB_SEARCH_PROVIDER = 'deepseek-official'
    delete environment.STABLE_ZHIPU_SEARCH_API_KEY
  } else if (!usesCloudGateway && isZhipuModel(model)) {
    environment.STABLE_ZHIPU_SEARCH_API_KEY = apiKey
    environment.DSH_WEB_SEARCH_PROVIDER = ZHIPU_SEARCH_PROVIDER_ID
  }
  delete environment.NODE_OPTIONS; delete environment.NODE_PATH
  return environment
}

function removeWithoutFollowingLinks(target) {
  let stats
  try { stats = lstatSync(target) }
  catch (error) { if (error?.code === 'ENOENT') return; throw error }
  if (stats.isSymbolicLink()) { unlinkSync(target); return }
  if (!stats.isDirectory()) { rmSync(target, { force: true }); return }
  for (const name of readdirSync(target)) removeWithoutFollowingLinks(path.join(target, name))
  rmdirSync(target)
}

function cleanupHarnessRunDirectory(dshHome, expectedRunsRoot) {
  const resolved = path.resolve(dshHome)
  const resolvedRunsRoot = path.resolve(expectedRunsRoot)
  const parentMatches = process.platform === 'win32'
    ? path.dirname(resolved).toLowerCase() === resolvedRunsRoot.toLowerCase()
    : path.dirname(resolved) === resolvedRunsRoot
  if (!parentMatches || !path.basename(resolved).startsWith('run-')) {
    throw new Error(`拒绝清理非 Harness 临时目录：${resolved}`)
  }
  removeWithoutFollowingLinks(resolved)
}

class HarnessRunner {
  constructor(options) { this.options = options; this.child = undefined; this.cancelled = false; this.approvalDir = undefined }

  runtimePaths() {
    const candidates = []
    if (process.env.STABLE_DSH_RUNTIME) {
      const root = process.env.STABLE_DSH_RUNTIME
      candidates.push(
        { node: path.join(root, 'node', 'node.exe'), cli: path.join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js') },
        { node: path.join(root, 'node', 'node.exe'), cli: path.join(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js') },
      )
    }
    if (this.options.packaged) {
      const persistentRoot = process.env.STABLE_RUNTIME_HOME || path.join(process.env.LOCALAPPDATA || this.options.userData, 'stable-desktop', 'runtime-v1')
      candidates.push({
        node: path.join(persistentRoot, 'node', 'node.exe'),
        cli: path.join(persistentRoot, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      }, {
        node: path.join(this.options.resourcesPath, 'runtime', 'node', 'node.exe'),
        cli: path.join(this.options.resourcesPath, 'runtime', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      })
      return candidates.find((candidate) => existsSync(candidate.node) && existsSync(candidate.cli)) || candidates[0]
    }
    const sourceRoot = path.resolve(__dirname, '..', '..')
    candidates.push({
      node: path.join(sourceRoot, 'runtime', 'node', 'node.exe'),
      cli: path.join(sourceRoot, 'runtime', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    })
    return candidates.find((candidate) => existsSync(candidate.node) && existsSync(candidate.cli)) || candidates[0]
  }

  ready() { const paths = this.runtimePaths(); return existsSync(paths.node) && existsSync(paths.cli) }

  writeSettings(model) {
    const runsRoot = path.join(this.options.userData, 'harness', 'runs')
    mkdirSync(runsRoot, { recursive: true })
    const dshHome = mkdtempSync(path.join(runsRoot, 'run-'))
    const config = {
      'agent-default-model': { provider: model.providerId, model: model.model },
      'llm-pi-ai': { providers: { [model.providerId]: {
        displayName: model.displayName, apiKeyEnv: 'STABLE_API_KEY', api: 'openai-completions', baseURL: model.baseURL,
        models: [{ id: model.model, name: model.model, input: isDeepSeekModel(model) ? ['text'] : ['text', 'image'] }],
      } } },
      'tool-subagent': { maxDepth: 3 },
      'tool-subagent-fork': { maxDepth: 3 },
    }
    writeFileSync(path.join(dshHome, 'settings.yaml'), YAML.stringify(config), 'utf8')
    return dshHome
  }

  run(prompt, model, apiKey, timeoutMs = 0, onEvent = () => {}, sandboxMode = 'workspace-write', imageAttachments = []) {
    if (this.child) throw new Error('已有任务正在运行。')
    if (!apiKey) throw new Error('请先在“设置”中保存 API Key。')
    if (imageAttachments.length && isDeepSeekModel(model)) throw new Error('DeepSeek 暂不支持图片分析，请切换其他模型。')
    const paths = this.runtimePaths()
    if (!this.ready()) throw new Error('Stable 的 Harness 运行时不完整，请重新安装。')
    const runsRoot = path.join(this.options.userData, 'harness', 'runs')
    const dshHome = this.writeSettings(model)
    this.approvalDir = path.join(dshHome, 'approvals', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(this.approvalDir, { recursive: true })
    this.cancelled = false
    mkdirSync(this.options.workspace, { recursive: true })
    const environment = buildHarnessEnvironment({
      baseEnvironment: this.options.environment ?? process.env,
      model, apiKey, approvalDir: this.approvalDir, dshHome,
      agentsHome: path.join(this.options.userData, 'agents'), sandboxMode,
    })
    return new Promise((resolve, reject) => {
      let stdout = ''; let stderr = ''; let eventBuffer = ''; let settled = false; let runtimeFailure = ''
      let child
      try {
        child = (this.options.spawn || spawn)(paths.node, ['--input-type=module', '--eval', STDIN_BRIDGE, paths.cli], {
          cwd: this.options.workspace, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (error) {
        try { cleanupHarnessRunDirectory(dshHome, runsRoot) } catch {}
        reject(error)
        return
      }
      this.child = child
      const timer = timeoutMs > 0
        ? setTimeout(() => { this.cancel(); finish(new Error(`执行超过 ${Math.ceil(timeoutMs / 60_000)} 分钟，已停止。`)) }, timeoutMs)
        : undefined
      const finish = (error, value) => {
        if (settled) return; settled = true; if (timer) clearTimeout(timer); this.child = undefined
        if (error) reject(error); else resolve(value)
      }
      child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString('utf8')).slice(-8 * 1024 * 1024) })
      const consumeEventLines = (final = false) => {
        const lines = eventBuffer.split(/\r?\n/)
        eventBuffer = final ? '' : (lines.pop() || '')
        for (const line of lines) {
          if (!line.startsWith('STABLE_EVENT\t')) { if (line) stderr = (stderr + line + '\n').slice(-1024 * 1024); continue }
          try {
            const event = JSON.parse(line.slice('STABLE_EVENT\t'.length))
            if (event.eventType === 'agent/end' && event.status === 'failed') runtimeFailure = String(event.detail || '')
            onEvent(event)
          }
          catch { stderr = (stderr + '无法解析 Harness 事件。\n').slice(-1024 * 1024) }
        }
      }
      child.stderr.on('data', (chunk) => { eventBuffer += chunk.toString('utf8'); consumeEventLines() })
      child.stdin.on('error', (error) => { if (!settled && error.code !== 'EPIPE') finish(error) })
      child.on('error', (error) => {
        if (!child.pid) {
          try { cleanupHarnessRunDirectory(dshHome, runsRoot) } catch {}
        }
        finish(error)
      })
      child.on('close', (code, signal) => {
        if (eventBuffer) { eventBuffer += '\n'; consumeEventLines(true) }
        try { cleanupHarnessRunDirectory(dshHome, runsRoot) } catch {}
        if (this.cancelled) finish(new Error('任务已停止。'))
        else if (code === 0 && stdout.trim()) finish(undefined, stdout.trim())
        else if (runtimeFailure === 'max-tokens') finish(Object.assign(new Error('本次任务的单次生成内容过长，模型达到输出长度上限。Stable 已停止本轮执行；请缩小单次生成范围或让 Agent 分步骤处理。'), { code: 'HARNESS_MAX_TOKENS' }))
        else finish(new Error(`Harness 执行失败（code ${code ?? 'unknown'}, signal ${signal ?? 'none'}）。${runtimeFailure ? `\n运行时原因：${runtimeFailure}` : ''}${stderr.trim() ? `\n${stderr.trim()}` : ''}`))
      })
      child.stdin.end(JSON.stringify({
        prompt,
        images: imageAttachments.map((item) => ({ path: item.path, mediaType: item.mediaType, name: item.name })),
      }), 'utf8')
    })
  }

  answerApproval(requestId, allowed) {
    if (!this.child || !this.approvalDir || !requestId) return false
    writeFileSync(path.join(this.approvalDir, `${requestId}.json`), JSON.stringify({ allowed: Boolean(allowed) }), 'utf8')
    return true
  }

  cancel() {
    const child = this.child; this.child = undefined
    if (!child?.pid || child.killed) return false
    this.cancelled = true
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else child.kill('SIGTERM')
    return true
  }
}

module.exports = {
  HarnessRunner, STDIN_BRIDGE, ZHIPU_SEARCH_ENDPOINT, ZHIPU_SEARCH_PROVIDER_ID,
  buildHarnessEnvironment, cleanupHarnessRunDirectory, createZhipuSearchProvider, mapZhipuSearchResponse,
}
