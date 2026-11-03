const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/shared/cloud-startup.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:exportsObject, setTimeout, clearTimeout, Promise, Error})
const {recoverCloudStartup} = exportsObject
const pause = () => new Promise(resolve => setTimeout(resolve,40))
test('hung IPC exits once, ignores late recovery and permits a fresh attempt', async () => {
  let release, success=0, failure=0
  recoverCloudStartup(()=>new Promise(r=>release=r),()=>success++,()=>failure++,10)
  await pause()
  assert.equal(failure,1)
  release({cloud:{status:'authenticated'}})
  await pause()
  assert.equal(success,0)
  recoverCloudStartup(()=>Promise.resolve({cloud:{status:'signed_out'}}),()=>success++,()=>failure++,10)
  await pause()
  assert.equal(success,1); assert.equal(failure,1)
})
test('unmounted recovery cannot change a newer login state', async () => {
  let count=0
  const cancel=recoverCloudStartup(()=>Promise.resolve({cloud:{status:'authenticated'}}),()=>count++,()=>count++,10)
  cancel(); await pause(); assert.equal(count,0)
})
test('still-checking reply and synchronous IPC error become actionable failures', async () => {
  let count=0
  recoverCloudStartup(()=>Promise.resolve({cloud:{status:'checking'}}),()=>assert.fail('unexpected success'),()=>count++,10)
  recoverCloudStartup(()=>{throw Error('ipc failed')},()=>assert.fail('unexpected success'),()=>count++,10)
  await pause(); assert.equal(count,2)
})
