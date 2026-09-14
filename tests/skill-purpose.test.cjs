const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
test('every bundled skill has a purpose label',()=>{
 const items=require('../desktop/skills/filtered/bundle/manifest.json').skills,labels=require('../src/skill-purposes.json');
 for(const item of items)assert.match(labels['filtered-'+item.id],/[\u3400-\u9fff]/,item.id);
});
test('skill detail shows prompts before original instructions and returns a draft',{skip:process.platform!=='win32',timeout:40000},async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=await new Promise(resolve=>{let output='';const child=spawn(require('electron'),[path.join(__dirname,'fixtures/skill-purpose-ui.cjs')],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>child.kill(),35000);child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:String(e)})});child.on('close',code=>{clearTimeout(timer);resolve({code,output})});});
 assert.equal(result.code,0,result.output);assert.match(result.output,/SKILL_PURPOSE_UI_PASSED/);
});
