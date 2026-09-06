const {app}=require('electron'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stable-installer-lock-')),repo=path.resolve(__dirname,'../..');app.setName(require('../../package.json').name);app.setPath('userData',profile);app.disableHardwareAcceleration();
if(!app.requestSingleInstanceLock())throw Error('Test could not acquire profile lock');
app.whenReady().then(async()=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const result=await new Promise(resolve=>{let output='';const child=spawn(process.execPath,[path.join(repo,'scripts/ops-skill-installer-host.cjs'),'--user-data',profile,'--source',path.join(profile,'nonexistent')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('close',code=>resolve({code,output}));child.on('error',e=>resolve({code:-1,output:e.message}))});
if(result.code!==2||fs.existsSync(path.join(profile,'stable.db')))throw Error(JSON.stringify(result));
console.log('INSTALLER_LIVE_PROFILE_BLOCKED');app.releaseSingleInstanceLock();app.exit(0)
}).catch(e=>{console.error(e.stack);app.exit(1)});
setTimeout(()=>app.exit(3),18000).unref();
