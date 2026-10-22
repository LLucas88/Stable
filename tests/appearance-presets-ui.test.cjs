const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process')
test('hidden renderer verifies appearance, animation blending and model connection presets',{skip:process.platform!=='win32',timeout:35000},()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const result=spawnSync(require('electron'),[path.join(__dirname,'fixtures/appearance-presets-ui.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:30000})
  assert.equal(result.status,0,result.stdout+result.stderr)
  assert.match(result.stdout,/APPEARANCE_PRESETS_UI_PASSED/)
})
