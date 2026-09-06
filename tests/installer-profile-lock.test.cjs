const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
test('native installer refuses a profile locked by the running Electron client before opening its database',{skip:process.platform!=='win32',timeout:25000},()=>{
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const r=spawnSync(require('electron'),[path.join(__dirname,'fixtures/installer-profile-lock.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:22000});
assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/INSTALLER_LIVE_PROFILE_BLOCKED/)
});
