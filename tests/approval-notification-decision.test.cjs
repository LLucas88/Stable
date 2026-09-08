'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite')
const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8')
const block=source.slice(source.indexOf('function pendingApproval'),source.indexOf('const { TaskAlerts }'))
test('notification and dialog share single-use decision and exact audit row',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE approval_requests(id TEXT,conversation_id TEXT,request_json TEXT,state TEXT,created_at TEXT,decision_json TEXT,decided_at TEXT)')
 db.prepare('INSERT INTO approval_requests VALUES(?,?,?,?,?,NULL,NULL)').run('run:a','a',JSON.stringify({requestId:'q'}),'pending','2026')
 const calls=[],resolved=[];const runner={supportsPersistentSessions:true,answerApproval:(...args)=>{calls.push(args);return true}},controls=new Map([['a',{runner}]])
 const api=vm.runInNewContext(block+';({pendingApproval,answerTaskApproval})',{agentRunners:controls,store:{db},requireText:v=>v,ApprovalLedger:class{},taskAlerts:{resolve:(...args)=>resolved.push(args)}})
 assert.equal(api.answerTaskApproval({conversationId:'a',requestId:'q',decision:'once'},{id:'run:wrong',runner}),false)
 assert.equal(api.answerTaskApproval({conversationId:'a',requestId:'q',decision:'once'},{id:'run:a',runner}),true)
 assert.equal(api.answerTaskApproval({conversationId:'a',requestId:'q',decision:'deny'}),false)
 assert.deepEqual(calls,[['q',true,'once']]);assert.deepEqual(resolved,[['a','q']]);assert.equal(db.prepare('SELECT state FROM approval_requests').get().state,'approved')
 db.close()
})
test('cancelled task and replaced runner cannot be approved by old notification',()=>{
 const calls=[],runner={supportsPersistentSessions:true,answerApproval:()=>calls.push(1)},control={runner,cancelled:true}
 const api=vm.runInNewContext(block+';({answerTaskApproval})',{agentRunners:new Map([['a',control]]),store:{db:{prepare:()=>({get:()=>({id:'run:a'})})}},requireText:v=>v})
 assert.equal(api.answerTaskApproval({conversationId:'a',requestId:'q',decision:'once'}),false)
 control.cancelled=false
 assert.equal(api.answerTaskApproval({conversationId:'a',requestId:'q',decision:'once'},{id:'run:a',runner:{}}),false)
 assert.equal(calls.length,0)
})
