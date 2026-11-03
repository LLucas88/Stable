'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { collectDiagnostics, recordRecovery } = require('../desktop/services/support-diagnostics.cjs')
const { registerSupportIpc } = require('../desktop/ipc/support.cjs')
const { CloudAccountService } = require('../desktop/services/cloud-account.cjs')
const { createUpdateController } = require('../desktop/services/updater.cjs')
const { EventEmitter } = require('node:events')
function fixture(t) {
  const root = fs.mkdtempSync(path.join(__dirname, '../.local/support-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'logs'))
  return root
}
test('diagnostic export uses a strict allowlist and tolerates corrupt, missing and oversized logs', t => {
  const root = fixture(t), time = new Date().toISOString()
  const record = { time, id: '12345678-1234-1234-1234-123456789abc', version: '1.11.2', route: '/api/account', status: 200, responseType: 'json', phase: 'headers', elapsedMs: 25,
    password: 'PRIVATE_PASSWORD', authorization: 'PRIVATE_TOKEN', account: 'PRIVATE_USER', body: 'PRIVATE_CHAT', error: 'PRIVATE_PATH', headers: { cookie: 'PRIVATE_COOKIE' }, url: 'PRIVATE_URL' }
  fs.writeFileSync(path.join(root, 'logs/cloud-network.jsonl'), 'x'.repeat(600000) + '\ninvalid\n' + JSON.stringify(record) + '\n')
  fs.writeFileSync(path.join(root, 'logs/cloud-network.jsonl.1'), JSON.stringify({time, route:'/api/account?PRIVATE_TOKEN', phase:'PRIVATE_PHASE', networkCode:'PRIVATE_CODE', version:'PRIVATE_VERSION'}) + '\n')
  fs.writeFileSync(path.join(root, 'secrets.json'), 'PRIVATE_SECRETSTORE')
  recordRecovery(path.join(root, 'logs/cloud-recovery.jsonl'), record)
  const report = collectDiagnostics({userData:root, version:'1.11.2', cloudStatus:'unavailable', updateStatus:'error'})
  const text = JSON.stringify(report)
  assert.doesNotMatch(text, /PRIVATE_/)
  assert.equal(report.network.at(-1).phase, 'headers')
  assert.equal(report.recovery[0].elapsedMs, 25)
  assert.equal(report.cloudStatus, 'unavailable')
  assert.ok(text.length < 5000)
  const empty = collectDiagnostics({userData:path.join(root,'missing'),version:'PRIVATE',cloudStatus:'PRIVATE',updateStatus:'PRIVATE'})
  assert.equal(empty.version, 'unknown'); assert.deepEqual(empty.network, [])
})
test('request diagnostics distinguish HTTP headers from a hung body and ignore late completion', async t => {
  fixture(t)
  const events = [], settings = new Map()
  let finish
  const service = new CloudAccountService({store:{getSetting:k=>settings.get(k),setSetting:(k,v)=>settings.set(k,v)}, secrets:{get:()=> 'PRIVATE_TOKEN'}, appVersion:'1.11.2', baseURL:'https://fixture.invalid',requestTimeoutMs:20,onDiagnostic:e=>events.push(e),
    fetchImpl: async () => ({ok:true, status:200, text:()=>new Promise(resolve=>{finish=resolve})})})
  await assert.rejects(service.request('/api/account'), /超时/)
  assert.deepEqual(events.map(e=>e.phase), ['start','headers','timeout'])
  assert.equal(events[1].status, 200)
  assert.ok(events[2].elapsedMs >= 15)
  assert.equal(new Set(events.map(e=>e.id)).size, 1)
  finish('{"account":"PRIVATE_USER"}')
  await new Promise(r=>setImmediate(r))
  assert.equal(events.length, 3)
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_/)
  service.fetch = async () => Response.json({account:{id:'PRIVATE_USER'}})
  await service.request('/api/account')
  assert.equal(events.at(-1).phase, 'complete')
  service.onDiagnostic = () => {throw Error('disk full')}
  assert.ok(await service.request('/api/account'))
})
test('support IPC exports while Cloud is unavailable and only locates a fixed rollback script', async t => {
  const root = fixture(t), handlers = new Map(), shown = []
  const output = path.join(root, 'report.json'), rollback = path.join(root, 'Rollback-Stable.ps1')
  let canceled = true
  registerSupportIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showSaveDialog:async()=>({canceled,filePath:output})},shell:{showItemInFolder:p=>shown.push(p)}, getWindow:()=>undefined,userData:root,
    app:{getPath:()=>path.join(root,'Stable.exe'),isPackaged:true,getVersion:()=> '1.11.2'},cloudAccount:{publicState:()=>({status:'unavailable',account:'PRIVATE_USER',error:'PRIVATE_TOKEN'})},updateController:{state:()=>({status:'error',error:'PRIVATE_PATH'})}})
  assert.equal(await handlers.get('stable:support:export')(), null)
  assert.equal(fs.existsSync(output), false)
  canceled = false
  await handlers.get('stable:support:export')()
  assert.doesNotMatch(fs.readFileSync(output,'utf8'), /PRIVATE_/)
  assert.equal(handlers.get('stable:support:recovery')().rollbackAvailable, false)
  assert.throws(()=>handlers.get('stable:support:open-rollback')(), /没有回退脚本/)
  fs.writeFileSync(rollback,'must never execute')
  assert.equal(handlers.get('stable:support:recovery')().rollbackAvailable, true)
  handlers.get('stable:support:open-rollback')({}, 'C:/untrusted.ps1')
  assert.deepEqual(shown,[rollback])
  assert.equal(handlers.get('stable:cloud:diagnostic')({},'PRIVATE_TOKEN'),false)
  assert.equal(handlers.get('stable:cloud:diagnostic')({},'startup_failed'),true)
})
test('update failure codes are exported without raw errors and progress does not flood logs', async t => {
  const root = fixture(t), events=[]
  const updater = new EventEmitter()
  updater.checkForUpdates = async () => {throw Object.assign(Error('PRIVATE_PASSWORD'),{code:'ENOSPC'})}
  const controller = createUpdateController({autoUpdater:updater,isPackaged:true,currentVersion:'1.11.2',onDiagnostic:e=>{events.push(e);recordRecovery(path.join(root,'logs/cloud-recovery.jsonl'),e)}})
  await controller.check(true)
  const report = collectDiagnostics({userData:root,version:'1.11.2'})
  assert.ok(report.recovery.some(e=>e.updateCode === 'ENOSPC'))
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_/)
  updater.emit('download-progress',{percent:1})
  const count = events.length
  for (let i=2;i<=100;i++) updater.emit('download-progress',{percent:i})
  assert.equal(events.length,count)
  controller.dispose()
})
