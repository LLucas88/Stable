const electron=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const repo=path.resolve(__dirname,'../..');fs.mkdirSync(path.join(repo,'qa-artifacts/feature-v2'),{recursive:true});
const {app,BrowserWindow}=electron,root=fs.mkdtempSync(path.join(repo,'qa-artifacts/feature-v2/startup-'))
fs.mkdirSync(path.join(root,'build'));for(const file of ['stable_logo_transparent.png','stable_logo.png'])fs.copyFileSync(path.join(repo,'build',file),path.join(root,'build',file));fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'stable-fixture',version:'0.91.7'}))
fs.cpSync(path.join(repo,'dist'),path.join(root,'dist'),{recursive:true});fs.mkdirSync(path.join(root,'desktop'));fs.copyFileSync(path.join(repo,'desktop/preload.cjs'),path.join(root,'desktop/preload.cjs'))
process.env.STABLE_QA_USER_DATA=path.join(root,'profile');process.env.STABLE_QA_CAPTURE=path.join(root,'startup.png');process.env.STABLE_QA_INSPECT=path.join(root,'inspect.json');process.env.STABLE_QA_CAPTURE_DELAY='6000';process.env.STABLE_QA_WIDTH='1440';process.env.STABLE_QA_HEIGHT='960';process.env.STABLE_QA_THEME='light'
app.getAppPath=()=>repo
for(const name of ['show','showInactive','focus'])BrowserWindow.prototype[name]=function(){}
let errors=[];process.on('unhandledRejection',error=>{errors.push(String(error));console.error('STARTUP_ERROR',error)})
app.whenReady().then(()=>electron.session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)})))
app.on('before-quit',()=>{const file=path.join(root,'inspect.json');if(!fs.existsSync(file))return;const metrics=JSON.parse(fs.readFileSync(file));fs.writeFileSync(path.join(repo,'qa-artifacts/feature-v2/startup-result.json'),JSON.stringify({errors,metrics},null,2));console.log('FEATURE_V2_STARTUP',JSON.stringify({errors,root,body:metrics.bodyText?.slice(0,200)}))})
require('../../desktop/main.cjs')
