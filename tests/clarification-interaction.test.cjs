'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {timerState,resolveResponse}=require('../desktop/services/clarification-interaction.cjs')
const {clarificationTrace}=require('../desktop/services/clarification.cjs')
function setup(){
 const settings=new Map(),messages=[{role:'assistant',trace:[clarificationTrace({prompt:'生成报告'},'给谁看？','c',{question:'给谁看？',hint:'受众影响内容',options:[{label:'管理层',description:'摘要优先'},{label:'技术团队',description:'展开方法'}]})]}]
 return {id:messages[0].trace[0].clarification.id,messages,store:{listMessages:()=>messages,getSetting:k=>settings.get(k),setSetting:(k,v)=>settings.set(k,structuredClone(v))}}
}
test('waiting has no deadline and old automatic actions cannot resume even after days',()=>{
 const {store,id}=setup()
 store.setSetting('clarification-timer:a',{id,deadline:0,interacted:false})
 assert.deepEqual(timerState(store,'a',id,'start',86400000),{id,deadline:null,interacted:true})
 for(const source of ['timeout','skip','close']) assert.throws(()=>resolveResponse(store,'a',{id,source},86400000),/提交回答/)
 assert.match(resolveResponse(store,'a',{id,source:'choice',option:1},86400000),/用户选择[\s\S]*技术团队[\s\S]*处理提示：展开方法/)
})
test('custom answers survive unchanged and invalid or stale submissions are rejected',()=>{
 const {store,id,messages}=setup()
 assert.match(resolveResponse(store,'a',{id,source:'custom',text:'客户，三页，中文'}),/客户，三页，中文/)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'custom',text:' '}),/填写/)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'choice',option:2}),/有效/)
 assert.throws(()=>resolveResponse(store,'a',{id:'old',source:'choice',option:0}),/已经结束/)
 messages.push({role:'user',content:'新任务'})
 assert.throws(()=>resolveResponse(store,'a',{id,source:'choice',option:0}),/已经结束/)
})
