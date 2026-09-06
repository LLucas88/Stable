const fs=require('node:fs'),path=require('node:path');
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const {id,method,params:p,result}=JSON.parse(line);
 if(id==='input-request'&&result)fs.writeFileSync(path.join(process.env.CODEX_HOME,'fabricated-answer.json'),JSON.stringify(result));
 if(method==='initialize')send({id,result:{userAgent:'fixture'}});
 else if(method==='thread/start'||method==='thread/resume')send({id,result:{thread:{id:'root'}}});
 else if(method==='turn/start'){
  send({id,result:{turn:{id:'turn'}}});send({method:'turn/started',params:{threadId:'root',turn:{id:'turn'}}});
  if(p.input[0].text==='ask')send({id:'input-request',method:'item/tool/requestUserInput',params:{threadId:'root',turnId:'turn',questions:[{id:'audience',question:'报告给谁看？'}]}});
  else send({method:'turn/completed',params:{threadId:'root',turn:{status:'completed',items:[{id:'answer',type:'agentMessage',phase:'final_answer',text:'用户补充已接收'}]}}});
 }else if(method==='turn/interrupt'){
  fs.writeFileSync(path.join(process.env.CODEX_HOME,'interrupted.json'),JSON.stringify(p));send({id,result:{}});
  send({method:'turn/completed',params:{threadId:'root',turn:{status:'interrupted',items:[]}}});
 }
}).on('close',()=>process.exit(0));
