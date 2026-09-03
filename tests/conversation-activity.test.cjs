const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { spawn } = require('node:child_process')
const path = require('node:path')
const app = readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
const css = readFileSync(path.join(__dirname, '../src/styles/app.css'), 'utf8')

test('conversation tab creates tasks, preserving its icon/label and guarding pending duplicate creates', () => {
  assert.doesNotMatch(app, /ConversationNewButton|conversationNewTarget|rail-conversation-new-slot/)
  assert.doesNotMatch(css, /\.conversation-new|\.rail-conversation-new-slot/)
  assert.match(app, /id: 'agent', label: '对话', icon: MessageSquareText/)
  const navigate = app.slice(app.indexOf('function navigate('), app.indexOf('function selectRepositoryTab('))
  assert.match(navigate, /if \(id === 'agent'\)/)
  assert.match(navigate, /if \(creatingConversationRef.current\) return/)
  assert.match(navigate, /await window.stable.agent.create\(\)/)
  assert.match(navigate, /finally \{ creatingConversationRef.current = false \}/)
})

test('only fresh successful assistant output marks completion, not stream/tool events or failure receipts', () => {
  const run = app.slice(app.indexOf('async function runQueuedMessage('), app.indexOf('async function steerQueuedMessage('))
  assert.match(run, /setRunningMap[\s\S]*markRead\(conversationId\)/)
  assert.match(run, /lastAnswer && !previousMessageIds.has\(lastAnswer.id\) && \(!lastAnswer.trace\?\.length \|\| savedTraceStatus\(lastAnswer.trace\) === 'completed'\)\) markCompleted\(conversationId\)/)
  const catchBlock = run.slice(run.indexOf('} catch (error)'))
  assert.doesNotMatch(catchBlock, /markCompleted/)
  assert.match(catchBlock, /\[conversationId\]: false/)
})

test('pinned and normal rows share spinner/unread indicators with hover and keyboard menu replacement', () => {
  assert.match(app, /runningMap\[item.id\] \? 'running' : unread.has\(item.id\) \? 'unread'/)
  assert.match(app, /<LoaderCircle className="spin" size=\{15\}/)
  assert.match(app, /className="conversation-unread-dot"/)
  assert.match(css, /\.conversation-list-item:has\(:focus-visible\) \.conversation-activity/)
  assert.match(css, /\.conversation-list-item:has\(:focus-visible\) \.conversation-item-actions/)
  assert.match(css, /prefers-reduced-motion: reduce[^\n]*\.conversation-activity \.spin \{ animation: spin 1\.6s steps\(8, end\) infinite !important;/)
})

test('hidden React renderer verifies unread clearing, focus/visibility and late callbacks across conversations', {skip:process.platform!=='win32',timeout:30_000}, async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=await new Promise(resolve=>{
    let output=''
    const child=spawn(require('electron'),[path.join(__dirname,'fixtures/conversation-unread-ui.cjs')],{cwd:path.join(__dirname,'..'),windowsHide:true,env,stdio:['ignore','pipe','pipe']})
    const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timed out: '+output})},25_000)
    child.stdout.on('data',chunk=>{output=(output+chunk).slice(-8000)})
    child.stderr.on('data',chunk=>{output=(output+chunk).slice(-8000)})
    child.on('error',error=>{clearTimeout(timer);resolve({code:-1,output:error.message})})
    child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output)
  assert.match(result.output,/CONVERSATION_UNREAD_UI_PASSED/)
})
