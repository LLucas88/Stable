'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createClaudeTools } = require('../desktop/services/claude-tools.cjs')
const sdk = { tool: (name, _description, _shape, handler) => ({ name, handler }), createSdkMcpServer: value => value }
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-claude-tools-'))
  const workspace = path.join(root, 'workspace'), outside = path.join(root, 'outside')
  fs.mkdirSync(workspace); fs.mkdirSync(outside)
  const events = [], requests = []
  const server = createClaudeTools({ sdk, workspace, requestApproval: async request => { requests.push(request); return true }, onToolEvent: event => events.push(event), ...options })
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()))
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, workspace, outside, events, requests, server, invoke: (name, args, extra) => server.tools.find(tool => tool.name === name).handler(args, extra) }
}
const textOf = result => result.content.find(item => item.type === 'text')?.text || ''
const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='

test('image container gaps stay pending across gallery changes and require current-width evidence', async t => {
  const review={};let width=390, candidates=[{target:'img-0-box-1',label:'short image',gap:150}], observedTargets=['img-0-box-1']
  const x=fixture(t,{review,builtinTools:{execute:async()=>({tabId:'t',epoch:1,viewport:{width,height:844},imageSpacing:{candidates,observedTargets}}),cancel(){}}})
  const first=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  const issue=first.reviewNotebook.checks.find(c=>c.source==='image-spacing')
  assert(issue,'measured whitespace must be recorded before the model can forget it')
  const masked=JSON.parse(textOf(await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:issue.check,status:'passed',evidenceId:first.reviewNotebook.evidence.at(-1).id,note:'background fill looks intentional'}]})))
  assert.equal(masked.reviewNotebook.checks[0].status,'needs-recheck','a still-measured gap cannot pass on a model assertion')
  candidates=[];width=1440
  const desktop=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  const wrong=JSON.parse(textOf(await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:issue.check,status:'passed',evidenceId:desktop.reviewNotebook.evidence.at(-1).id,note:'desktop is fine'}]})))
  assert.equal(wrong.reviewNotebook.checks[0].status,'needs-recheck')
  assert.equal(review.stop().decision,'block')
  width=390
  observedTargets=[]
  const other=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  const hidden=JSON.parse(textOf(await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:issue.check,status:'passed',evidenceId:other.reviewNotebook.evidence.at(-1).id,note:'another gallery has no gaps'}]})))
  assert.equal(hidden.reviewNotebook.checks[0].status,'needs-recheck','hiding the affected image does not repair it')
  observedTargets=['img-0-box-1']
  const fixed=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:issue.check,status:'passed',evidenceId:fixed.reviewNotebook.evidence.at(-1).id,note:'mobile gap repaired and verified'}]})
  assert.deepEqual(review.stop(),{})
})

test('measured wrapping persists as a review item and cannot be cleared with earlier evidence', async t => {
  const review = {}; let candidates = []
  const x = fixture(t, { review, builtinTools: { execute: async request => ({tabId:'t',epoch:1,viewport:{width:390,height:844},
    ...(request.args.action==='screenshot'?{image:screenshot}:{}),typography:{candidates,scanTruncated:false}}),cancel(){} } })
  const before=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  candidates=[{id:'tab',label:'会员专属活动日',lineCharacters:[6,1],kind:'single-character-last-line'}]
  const shot=JSON.parse(textOf(await x.invoke('stable_browser',{action:'screenshot',tabId:'t'})))
  const check=shot.reviewNotebook.checks.find(c=>c.source==='typography')
  assert(check,'measured issue must not depend on the model remembering to add a check')
  assert.equal(check.status,'open')
  await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:'图片比例',status:'passed',evidenceId:shot.reviewNotebook.evidence.at(-1).id,note:'比例正常'}]})
  assert.equal(review.stop().decision,'block','passing unrelated work must not hide wrapping')
  const old=JSON.parse(textOf(await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:check.check,status:'passed',evidenceId:before.reviewNotebook.evidence[0].id,note:'旧测量'}]})))
  assert.equal(old.reviewNotebook.checks.find(c=>c.check===check.check).status,'needs-recheck')
  candidates=[]
  const repaired=JSON.parse(textOf(await x.invoke('stable_browser',{action:'screenshot',tabId:'t'})))
  await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check:check.check,status:'passed',evidenceId:repaired.reviewNotebook.evidence.at(-1).id,note:'复查手机文字，无孤字换行'}]})
  assert.deepEqual(review.stop(),{})
})

test('browser batch combines known checks with fresh refs, real evidence and per-action approvals', async t => {
  const calls = []
  const x = fixture(t, { builtinTools: { execute: async request => {
    calls.push(request.args)
    return { tabId: 't', epoch: 1, controls: [{ ref: `fresh-${calls.length}`, label: 'Details' }],
      ...(request.args.action === 'screenshot' ? { image: screenshot } : {}) }
  }, cancel() {} } })
  await x.invoke('stable_browser', { action: 'read', tabId: 't' })
  const result = await x.invoke('stable_browser', { action: 'batch', tabId: 't', purpose: 'responsive checks',
    reviewUpdates: [{check:'responsive layout',status:'open',note:'inspect both widths'}], steps: [
    { action: 'resize', width: 390, height: 844 },
    { action: 'click', label: 'Details' },
    { action: 'screenshot', purpose: 'mobile details' },
    { action: 'resize', width: 1440, height: 1000 },
    { action: 'screenshot', purpose: 'desktop details' },
  ] })
  assert.equal(result.isError, undefined, textOf(result))
  assert.equal(calls[2].ref, 'fresh-2', 'label resolves against the snapshot after resize')
  assert.equal(calls[2].label, undefined)
  assert.equal(x.requests.length, 1, 'click still requires its own approval')
  assert.equal(result.content.filter(p => p.type === 'image').length, 2)
  const data = result.content.filter(p => p.type === 'text').map(p => JSON.parse(p.text))
  assert.equal(data.filter(p => p.reviewNotebook).length, 1)
  assert(data.filter(p => p.screenshotPath).every(p => fs.existsSync(p.screenshotPath)))
  assert.equal(data.at(-1).reviewNotebook.evidence.length, 2)
  assert.equal(data.at(-1).reviewNotebook.checks.find(c=>c.check==='responsive layout').status,'open')
  assert(x.events.every(e => e.args.action !== 'batch'), 'UI keeps ordinary per-action events')
})

test('wrapping findings from separate page states do not overwrite unresolved earlier labels', async t => {
  const review={}; let label='第一个需要修复的标题'
  const x=fixture(t,{review,builtinTools:{execute:async()=>({tabId:'t',epoch:1,viewport:{width:390,height:844},
    typography:{candidates:[{kind:'single-character-last-line',id:label,label,lineCharacters:[9,1]}]}}),cancel(){}}})
  await x.invoke('stable_browser',{action:'audit',tabId:'t'})
  label='另一个需要修复的标题'
  const second=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  const pending=second.reviewNotebook.checks.filter(c=>c.status==='open')
  assert(pending.some(c=>c.note.includes('第一个需要修复的标题')),'switching visible sections cannot erase an earlier unresolved label')
  assert(pending.some(c=>c.note.includes(label)))
})

test('repeated wrapping observations stay bounded but a resolved issue reappearing reopens review', async t => {
  let candidates=[{id:'tab',label:'会员专属活动日',lineCharacters:[6,1],kind:'single-character-last-line'}]
  const x=fixture(t,{builtinTools:{execute:async()=>({tabId:'t',epoch:1,viewport:{width:390,height:844},typography:{candidates}}),cancel(){}}})
  const first=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  const check=first.reviewNotebook.checks[0].check
  const duplicate=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  assert.equal(duplicate.reviewNotebook.checks.length,1)
  candidates=[]
  const clear=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:[{check,status:'passed',evidenceId:clear.reviewNotebook.evidence.at(-1).id,note:'文字布局已修复'}]})
  candidates=[{id:'tab',label:'会员专属活动日',lineCharacters:[6,1],kind:'single-character-last-line'}]
  const again=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'})))
  assert.equal(again.reviewNotebook.checks.length,1)
  assert.equal(again.reviewNotebook.checks[0].status,'open','reappearing measured risk must not retain stale success')
})

test('wrapping checklist overflow cannot silently certify unrecorded findings', async t => {
  const review={}; let offset=0
  const x=fixture(t,{review,builtinTools:{execute:async()=>({tabId:'t',epoch:1,viewport:{width:390,height:844},
    typography:{candidates:Array.from({length:13},(_,i)=>({id:String(i+offset),label:'需要检查的标题'+(i+offset),lineCharacters:[8,1]}))}}),cancel(){}}})
  await x.invoke('stable_browser',{action:'audit',tabId:'t'})
  offset=13
  const full=JSON.parse(textOf(await x.invoke('stable_browser',{action:'audit',tabId:'t'}))).reviewNotebook
  assert.equal(full.checks.length,24)
  assert.equal(full.capacityExceeded,true)
  for(let i=0;i<24;i+=12) await x.invoke('stable_browser',{action:'review',tabId:'t',reviewUpdates:full.checks.slice(i,i+12).map(c=>({check:c.check,status:'passed',evidenceId:full.evidence.at(-1).id,note:'人工复核当前排版'}))})
  assert.match(review.stop().reason,/超出24项/,'passing recorded items does not cover omitted findings')
})

test('browser batch stops on failure and preserves completed evidence without retrying effects', async t => {
  const calls = []
  const x = fixture(t, { builtinTools: { execute: async request => {
    calls.push(request.args.action)
    if (request.args.action === 'click') throw Error('stale ref')
    return { tabId: 't', image: screenshot }
  }, cancel() {} } })
  const result = await x.invoke('stable_browser', { action: 'batch', tabId: 't', steps: [
    { action: 'screenshot' }, { action: 'click', ref: 'old' }, { action: 'screenshot' },
  ] })
  assert.equal(result.isError, true)
  assert.deepEqual(calls, ['screenshot', 'click'])
  assert(result.content.some(p => p.type === 'image'))
  assert.match(result.content.at(-1).text, /stale ref/)
})

test('browser batch validates all steps before effects and respects rejection and cancellation', async t => {
  const calls = [], controller = new AbortController()
  const x = fixture(t, { requestApproval: async () => false, builtinTools: {
    execute: async r => { calls.push(r.args); controller.abort(); return { tabId: 't' } }, cancel() {},
  } })
  for (const steps of [[{ action: 'resize', width: 390 }, { action: 'fill', value: 'secret' }],
    Array.from({ length: 5 }, () => ({ action: 'screenshot' }))]) {
    assert.equal((await x.invoke('stable_browser', { action: 'batch', tabId: 't', steps })).isError, true)
  }
  assert.equal(calls.length, 0)
  const denied = await x.invoke('stable_browser', { action: 'batch', tabId: 't', steps: [
    { action: 'click', ref: 'x' }, { action: 'screenshot' },
  ] })
  assert.equal(denied.isError, true); assert.equal(calls.length, 0)
  const stopped = await x.invoke('stable_browser', { action: 'batch', tabId: 't', steps: [
    { action: 'resize', width: 390 }, { action: 'screenshot' },
  ] }, { signal: controller.signal })
  assert.equal(stopped.isError, true); assert.equal(calls.length, 1)
})

test('browser batch never guesses labels and stops on navigation or structured failure', async t => {
  let fail = false, nav = false
  const calls = []
  const x = fixture(t, { builtinTools: { execute: async r => {
    calls.push(r.args)
    if (fail) return { ok: false, error: 'page detached' }
    return { tabId: 't', epoch: nav ? 2 : 1, url: nav ? 'https://other.invalid' : 'https://fixture.invalid',
      controls: [{ ref: 'a', label: 'Duplicate' }, { ref: 'b', label: 'Duplicate' }, { ref: 'c', label: 'Unique' }] }
  }, cancel() {} } })
  await x.invoke('stable_browser', { action: 'read', tabId: 't' })
  for (const label of ['Unknown', 'Duplicate']) {
    const result = await x.invoke('stable_browser', { action: 'batch', tabId: 't', steps: [{ action: 'click', label }] })
    assert.equal(result.isError, true)
  }
  assert.equal(calls.length, 1)
  nav = true
  const navigated = await x.invoke('stable_browser', { action: 'batch', tabId: 't',
    steps: [{ action: 'click', label: 'Unique' }, { action: 'screenshot' }] })
  assert.equal(navigated.isError, true); assert.equal(calls.length, 2)
  fail = true
  const failed = await x.invoke('stable_browser', { action: 'batch', tabId: 't',
    steps: [{ action: 'read' }, { action: 'screenshot' }] })
  assert.equal(failed.isError, true); assert.equal(calls.length, 3)
})

test('read-only browser batches cannot introduce interactive permissions', async t => {
  const calls = []
  const x = fixture(t, { sandboxMode: 'read-only', builtinTools: { execute: async r => {
    calls.push(r.args.action); return { tabId: 't', image: screenshot }
  }, cancel() {} } })
  const result = await x.invoke('stable_browser', { action: 'batch', tabId: 't', steps: [
    { action: 'screenshot' }, { action: 'click', ref: 'x' }, { action: 'read' },
  ] })
  assert.equal(result.isError, true)
  assert.deepEqual(calls, ['screenshot'])
  assert.equal(x.requests.length, 0)
})

test('review can finish a check without a new capture or parent browser operation; Stop feeds back unresolved work', async t => {
  const review = {}, calls = []
  const x = fixture(t, { review, builtinTools: { execute: async request => {
    calls.push(request.args); return { tabId: 't', image: screenshot }
  }, cancel() {} } })
  assert.deepEqual(review.stop(), {})
  const shot = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't', purpose: 'mobile layout' })))
  assert.equal(review.stop().decision, 'block', 'an inspected page needs explicit final review')
  const id = shot.reviewNotebook.evidence[0].id
  const pending = await x.invoke('stable_browser', { action: 'review', tabId: 't',
    reviewUpdates: [{ check: 'mobile', status: 'open', note: 'image frame leaves blank space' }] })
  assert.equal(pending.isError, undefined)
  assert.match(review.stop().reason, /mobile/)
  const done = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'review', tabId: 't',
    reviewUpdates: [{ check: 'mobile', status: 'passed', evidenceId: id, note: 'checked current pixels' }] })))
  assert.equal(done.reviewNotebook.checks[0].status, 'passed')
  assert.deepEqual(review.stop(), {})
  assert.equal(calls.length, 1)
  assert.equal(x.requests.length, 0)
})

test('unfinished review cannot silently become success after bounded completion retries', async t => {
  const review = {}
  const x = fixture(t, { review, builtinTools: { execute: async () => ({ tabId: 't', image: screenshot }), cancel() {} } })
  await x.invoke('stable_browser', { action: 'screenshot', tabId: 't' })
  for (let i = 0; i < 2; i++) assert.equal(review.stop().decision, 'block')
  assert.equal(review.stop().continue, false)
  assert.match(review.failure, /检查记录/)
})

test('read-only review accepts real inline evidence; blocked work is reported separately', async t => {
  const review = {}
  const x = fixture(t, { sandboxMode: 'read-only', review, builtinTools: { execute: async () => ({ tabId: 't', image: screenshot }), cancel() {} } })
  const shot = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't' })))
  const result = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'review', tabId: 't', reviewUpdates: [
    { check: 'observe', status: 'passed', evidenceId: shot.reviewNotebook.evidence[0].id, note: 'viewed inline screenshot' },
    { check: 'fix', status: 'blocked', note: 'read-only task cannot modify file' },
  ] })))
  assert.equal(result.reviewNotebook.checks[0].status, 'passed')
  assert.deepEqual(review.stop(), {})
  assert.match(review.incomplete(), /read-only task/)
})

test('browser review notebook carries evidence and checks across views without changing parent calls or UI', async t => {
  const calls = []
  const x = fixture(t, { builtinTools: { execute: async request => {
    calls.push(request.args)
    return { tabId: 't', epoch: 1, viewport: { width: 390, height: 844, scrollY: 400 },
      ...(request.args.action === 'screenshot' ? { image: screenshot } : {}) }
  }, cancel() {} } })
  const shot = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't', purpose: '手机短图留白' })))
  assert.equal(shot.reviewNotebook.evidence[0].purpose, '手机短图留白')
  const id = shot.reviewNotebook.evidence[0].id
  const read = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'read', tabId: 't',
    reviewUpdates: [{ check: '手机短图留白', status: 'passed', evidenceId: id, note: '底部没有额外留白' }] })))
  assert.equal(read.reviewNotebook.checks[0].status, 'passed')
  assert.equal(read.reviewNotebook.evidence[0].path, shot.screenshotPath)
  assert.equal(read.reviewNotebook.evidence[0].viewport.width, 390)
  assert.deepEqual(calls, [{ action: 'screenshot', tabId: 't' }, { action: 'read', tabId: 't' }])
  assert(x.events.every(e => !e.args.purpose && !e.args.reviewUpdates))
  const invalid = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'read', tabId: 't',
    reviewUpdates: [{ check: '凭空通过', status: 'passed', evidenceId: 'missing', note: '没有证据' }] })))
  assert.equal(invalid.reviewNotebook.checks.find(c => c.check === '凭空通过').status, 'needs-recheck')
})

test('browser review evidence is historical: reloads, missing files and other tabs cannot certify current checks', async t => {
  let epoch = 1
  const x = fixture(t, { builtinTools: { execute: async request => ({ tabId: request.args.tabId, epoch,
    ...(request.args.action === 'screenshot' ? { image: screenshot } : {}) }), cancel() {} } })
  const capture = async () => JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't' })))
  const shot = await capture(), id = shot.reviewNotebook.evidence[0].id
  const update = { check: '图片比例', status: 'passed', evidenceId: id, note: '比例正常' }
  epoch++
  const reload = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'open', tabId: 't', url: 'https://example.com', reviewUpdates: [update] })))
  assert.equal(reload.reviewNotebook.checks[0].status, 'needs-recheck')
  const other = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'read', tabId: 'other', reviewUpdates: [update] })))
  assert.equal(other.reviewNotebook.checks[0].status, 'needs-recheck')
  const latest = await capture()
  fs.unlinkSync(latest.screenshotPath)
  const missing = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'read', tabId: 't' })))
  assert(missing.reviewNotebook.evidence.every(e => !e.path))
})

test('review notebook does not treat a same-epoch reload or temporary viewport as unchanged evidence', async t => {
  const x = fixture(t, { builtinTools: { execute: async request => request.args.action === 'screenshot'
    ? { tabId: 't', epoch: 1, image: screenshot }
    : { tabId: 't', epoch: 1, viewport: { width: 1280, height: 900, scrollY: 0 } }, cancel() {} } })
  await x.invoke('stable_browser', { action: 'read', tabId: 't' })
  const shot = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't', width: 390 })))
  assert.equal(shot.reviewNotebook.evidence[0].viewport.width, 390)
  const next = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't' })))
  assert.equal(next.reviewNotebook.evidence.at(-1).viewport.width, 1280)
  const reload = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'open', tabId: 't', url: 'https://example.com',
    reviewUpdates: [{ check: '布局', status: 'passed', evidenceId: shot.reviewNotebook.evidence[0].id, note: '旧画面' }] })))
  assert.equal(reload.reviewNotebook.checks[0].status, 'needs-recheck')
  const invalid = await x.invoke('stable_browser', { action: 'screenshot', purpose: 'x'.repeat(161) })
  assert.equal(invalid.isError, true)
})

test('browser screenshots expose durable readable files and repeated captures retain fresh execution', async t => {
  let calls = 0
  const x = fixture(t, { builtinTools: { execute: async () => { calls++; return { tabId: 't', image: screenshot } }, cancel() {} } })
  const first = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't' })))
  assert.equal(typeof first.screenshotPath, 'string', 'screenshot must advertise a real file instead of an SDK blob hint')
  assert.deepEqual(fs.readFileSync(first.screenshotPath), Buffer.from(screenshot.split(',')[1], 'base64'))
  const second = JSON.parse(textOf(await x.invoke('stable_browser', { action: 'screenshot', tabId: 't' })))
  assert.equal(calls, 2, 'dynamic pages must still be captured')
  assert.equal(second.screenshotPath, first.screenshotPath)
  assert.equal(second.reviewProgress.repeatedScreenshots, 1)
  assert.match(second.reviewProgress.guidance, /收尾|交付/)
  assert.equal(fs.existsSync(first.screenshotPath), true)
})

test('read-only screenshots and failed artifact writes retain inline images without advertising fake paths', async t => {
  const builtinTools = { execute: async () => ({ tabId: 't', image: screenshot }), cancel() {} }
  const readonly = fixture(t, { sandboxMode: 'read-only', builtinTools })
  const result = await readonly.invoke('stable_browser', { action: 'screenshot' })
  assert.equal(JSON.parse(textOf(result)).screenshotPath, undefined)
  assert.equal(result.content[1].type, 'image')
  assert.deepEqual(fs.readdirSync(readonly.workspace), [])
  const x = fixture(t, { builtinTools })
  fs.symlinkSync(x.outside, path.join(x.workspace, '.stable'), process.platform === 'win32' ? 'junction' : 'dir')
  const denied = await x.invoke('stable_browser', { action: 'screenshot' })
  assert.equal(JSON.parse(textOf(denied)).screenshotPath, undefined)
  assert.equal(denied.content[1].type, 'image')
  assert.deepEqual(fs.readdirSync(x.outside), [])
})

test('MCP supplements native tools without duplicate files and retains read-only browser restrictions', async t => {
  const x = fixture(t)
  assert(!x.server.tools.some(tool => tool.name === 'stable_file'))
  assert(!x.server.tools.some(tool => tool.name === 'stable_exec'))
  let calls = 0
  const readOnly = fixture(t, { sandboxMode: 'read-only', builtinTools: { execute: async () => { calls++; return {} }, cancel() {} } })
  assert.equal((await readOnly.invoke('stable_browser', { action: 'open', url: 'https://example.com' })).isError, true)
  assert.equal((await readOnly.invoke('stable_skill_install', { path: readOnly.workspace })).isError, true)
  assert.equal(calls, 0)
  assert.equal(readOnly.requests.length, 0)
  assert.equal((await readOnly.invoke('stable_browser', { action: 'audit', tabId: 'existing-tab' })).isError, undefined)
  assert.equal(calls, 1)
  assert.equal(readOnly.requests.length, 0, 'read-only layout inspection needs no mutation approval')
})

test('builtin approval and image content are routed through the parent implementation', async t => {
  let execute
  const x = fixture(t, { builtinTools: { execute: async request => { execute = request; return { tabId: 'test', image: 'data:image/png;base64,YQ==' } }, cancel() {} } })
  const result = await x.invoke('stable_browser', { action: 'open', url: 'https://example.com' })
  assert.equal(x.requests.length, 1); assert.equal(execute.approved, true)
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].data, 'YQ==')
  assert.equal(JSON.parse(result.content[0].text).tabId, 'test')
})

test('viewport schema reaches MCP and rejects invalid sizes before dispatch', async t => {
  const calls=[]
  const x=fixture(t,{sandboxMode:'read-only',builtinTools:{execute:async request=>{calls.push(request.args);return {viewport:{width:390,height:844}}},cancel(){}}})
  assert.equal((await x.invoke('stable_browser',{action:'resize',width:390,height:844,detail:'compact'})).isError,undefined)
  assert.deepEqual(calls,[{action:'resize',width:390,height:844,detail:'compact'}]);assert.equal(x.requests.length,0)
  for(const width of [319,2561,390.5,'390'])assert.equal((await x.invoke('stable_browser',{action:'resize',width})).isError,true)
  assert.equal(calls.length,1)
})
