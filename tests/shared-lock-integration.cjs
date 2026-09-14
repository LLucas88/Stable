const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {CodexHarnessRunner}=require('../desktop/services/codex-harness.cjs')
async function main(){
 const root=path.resolve(__dirname,'../qa-artifacts/shared-lock',String(Date.now())),lock=path.join(root,'default','.wending-session');fs.mkdirSync(lock,{recursive:true})
 const results=[]
 for(const name of ['project-a','project-b']){
  const workspace=path.join(root,name);fs.mkdirSync(workspace)
  let issued=false;const outputs=[]
  const python=path.resolve(__dirname,'../vendor/wending-cli/python/python.exe')
  const script=path.join(workspace,'shared-lock-probe.py')
  fs.writeFileSync(script,'import os, pathlib, msvcrt\np=pathlib.Path(os.environ["WENDING_SESSION_LOCK_DIR"])/"session.lock"\nwith open(p,"a+b") as f:\n f.write(b"0"); f.flush(); f.seek(0); msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)\n print("SHARED_LOCK_OK"); f.seek(0); msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)\n')
  const command=`& '${python}' -I -X utf8 '${script}'`

  const runner=new CodexHarnessRunner({userData:root,workspace,environment:{...process.env,WENDING_SESSION_LOCK_DIR:lock},fetchImpl:async(_url,opt)=>{
   const body=JSON.parse(opt.body);let delta,finish_reason
   if(!issued){issued=true;const tool=body.tools.find(x=>x.function.name==='shell_command');delta={tool_calls:[{index:0,id:'lock_probe',type:'function',function:{name:tool.function.name,arguments:JSON.stringify({command,workdir:workspace,timeout_ms:20000,login:false})}}]};finish_reason='tool_calls'}
   else{outputs.push(...body.messages.filter(x=>x.role==='tool').map(x=>x.content));delta={content:'DONE'};finish_reason='stop'}
   return new Response(`data: ${JSON.stringify({choices:[{index:0,delta,finish_reason}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}})
  }})
  await runner.run('Run only the shared lock probe.',{id:'mock',providerId:'mock',model:'mock',baseURL:'https://unused.invalid/v1'},'local-only',60000,e=>{if(e.eventType==='approval/request'&&e.status==='running'){assert(e.toolName.includes("shared-lock-probe.py"));runner.answerApproval(e.requestId,true)}},'workspace-write',[],{key:name,permissionMode:'full'})
  assert(outputs.some(x=>x.includes('SHARED_LOCK_OK')),outputs.join('\n'));results.push({project:name,passed:true});console.log(name+' passed')
 }
 fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(results,null,2));console.log(root)
}
main().catch(e=>{console.error(e);process.exitCode=1})
