'use strict'

const { spawn, spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')

const STDIN_BRIDGE = [
  "import path from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  "import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';",
  'const chunks=[];',
  'for await (const chunk of process.stdin) chunks.push(chunk);',
  'const cli=process.argv[1];',
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
  "  else if(type==='tool/call'){const key=`${sessionId}:${data.callId}`;toolNames.set(key,data.name);publish({...base,id:`${sessionId}:tool:${data.callId}`,kind:'tool',entity:'tool',eventType:'tool/start',title:`使用工具 ${clean(data.name)}`,detail:detail(data.arguments),status:'running'});}",
  "  else if(type==='tool/result'){const key=`${sessionId}:${data.callId}`;const failed=Boolean(data.error);publish({...base,id:`${sessionId}:tool:${data.callId}`,kind:'tool',entity:'tool',eventType:'tool/end',title:`使用工具 ${clean(toolNames.get(key)||'工具')}`,detail:failed?clean(data.error?.message||'执行失败'):'执行完成',status:failed?'failed':'completed'});}",
  "  else if(type==='assistant/message') publish({...base,id:`${sessionId}:reasoning:${data.turn}:${data.step}`,kind:'reasoning',title:'整理回答',detail:parentSessionId?'正在向总控报告结果':'正在生成最终回答',status:'completed'});",
  "  else if(type==='turn/end'){const completed=data.reason?.kind==='completed';const cancelled=data.reason?.kind==='interrupted';publish({...base,id:`${sessionId}:agent`,kind:'status',entity:'agent',eventType:'agent/end',title:agentNames.get(sessionId)||(parentSessionId?'子 Agent':'Stable 总控'),detail:completed?(parentSessionId?'已向总控提交结果':'已完成任务'):clean(data.reason?.error?.message||data.reason?.kind||'执行中断'),status:completed?'completed':cancelled?'cancelled':'failed'});}",
  '  return event;',
  '};',
  "process.argv=[process.execPath,cli,'--profile','headless',Buffer.concat(chunks).toString('utf8')];",
  'await import(pathToFileURL(cli).href);',
].join('')

class HarnessRunner {
  constructor(options) { this.options = options; this.child = undefined; this.cancelled = false; this.approvalDir = undefined }

  runtimePaths() {
    if (this.options.packaged) {
      return {
        node: path.join(this.options.resourcesPath, 'runtime', 'node', 'node.exe'),
        cli: path.join(this.options.resourcesPath, 'runtime', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      }
    }
    const candidates = []
    if (process.env.STABLE_DSH_RUNTIME) {
      const root = process.env.STABLE_DSH_RUNTIME
      candidates.push(
        { node: path.join(root, 'node', 'node.exe'), cli: path.join(root, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js') },
        { node: path.join(root, 'node', 'node.exe'), cli: path.join(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js') },
      )
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
    const dshHome = path.join(this.options.userData, 'harness')
    mkdirSync(dshHome, { recursive: true })
    const config = {
      'agent-default-model': { provider: model.providerId, model: model.model },
      'llm-pi-ai': { providers: { [model.providerId]: {
        displayName: model.displayName, apiKeyEnv: 'STABLE_API_KEY', api: 'openai-completions', baseURL: model.baseURL,
        models: [{ id: model.model, name: model.model }],
      } } },
      'tool-subagent': { maxDepth: 3 },
      'tool-subagent-fork': { maxDepth: 3 },
    }
    writeFileSync(path.join(dshHome, 'settings.yaml'), YAML.stringify(config), 'utf8')
    return dshHome
  }

  run(prompt, model, apiKey, timeoutMs = 0, onEvent = () => {}, sandboxMode = 'workspace-write') {
    if (this.child) throw new Error('已有任务正在运行。')
    if (!apiKey) throw new Error('请先在“设置”中保存 API Key。')
    const paths = this.runtimePaths()
    if (!this.ready()) throw new Error('Stable 的 Harness 运行时不完整，请重新安装。')
    const dshHome = this.writeSettings(model)
    this.approvalDir = path.join(dshHome, 'approvals', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(this.approvalDir, { recursive: true })
    this.cancelled = false
    mkdirSync(this.options.workspace, { recursive: true })
    const environment = {
      ...process.env,
      STABLE_API_KEY: apiKey,
      // DeepSeek Harness uses a separate credential reference for web search and
      // other provider-backed tools. Keep one user-managed key while exposing the
      // aliases only inside this short-lived child process.
      DEEPSEEK_API_KEY: apiKey,
      STABLE_APPROVAL_DIR: this.approvalDir,
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: path.join(this.options.userData, 'agents'),
      DSH_PERMISSION_MODE: sandboxMode === 'read-only' ? 'read-only' : 'workspace-write',
    }
    delete environment.NODE_OPTIONS; delete environment.NODE_PATH
    return new Promise((resolve, reject) => {
      let stdout = ''; let stderr = ''; let eventBuffer = ''; let settled = false; let runtimeFailure = ''
      const child = spawn(paths.node, ['--input-type=module', '--eval', STDIN_BRIDGE, paths.cli], {
        cwd: this.options.workspace, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      })
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
      child.on('error', finish)
      child.on('exit', (code, signal) => {
        if (eventBuffer) { eventBuffer += '\n'; consumeEventLines(true) }
        if (this.cancelled) finish(new Error('任务已停止。'))
        else if (code === 0 && stdout.trim()) finish(undefined, stdout.trim())
        else if (runtimeFailure === 'max-tokens') finish(Object.assign(new Error('本次任务的单次生成内容过长，模型达到输出长度上限。Stable 已停止本轮执行；请缩小单次生成范围或让 Agent 分步骤处理。'), { code: 'HARNESS_MAX_TOKENS' }))
        else finish(new Error(`Harness 执行失败（code ${code ?? 'unknown'}, signal ${signal ?? 'none'}）。${runtimeFailure ? `\n运行时原因：${runtimeFailure}` : ''}${stderr.trim() ? `\n${stderr.trim()}` : ''}`))
      })
      child.stdin.end(prompt, 'utf8')
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

module.exports = { HarnessRunner, STDIN_BRIDGE }
