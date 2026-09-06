'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {timerState,resolveResponse}=require('../desktop/services/clarification-interaction.cjs')
const {clarificationTrace}=require('../desktop/services/clarification.cjs')
function setup(){
 const settings=new Map(),messages=[{role:'assistant',trace:[clarificationTrace({prompt:'生成报告'},'给谁看？','c',{question:'给谁看？',hint:'受众影响内容',options:[{label:'管理层',description:'摘要优先'},{label:'技术团队',description:'展开方法'}]})]}]
 return {id:messages[0].trace[0].clarification.id,messages,store:{listMessages:()=>messages,getSetting:k=>settings.get(k),setSetting:(k,v)=>settings.set(k,structuredClone(v))}}
}
test('deadline starts when shown, lasts 20 seconds, survives reopening and submits recommended route only once',()=>{
 const {store,id}=setup();assert.equal(timerState(store,'a',id,'start',100).deadline,20100)
 assert.equal(timerState(store,'a',id,'start',5000).deadline,20100)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'timeout'},20099),/尚未结束/)
 const text=resolveResponse(store,'a',{id,source:'timeout',option:1},20100)
 assert.match(text,/模型自主选择/);assert.match(text,/路线：管理层/);assert.match(text,/不代表用户确认/)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'timeout'},20200),/倒计时已取消/)
})
test('any persisted interaction permanently cancels timeout even after returning to the card',()=>{
 const {store,id}=setup();timerState(store,'a',id,'start',0);timerState(store,'a',id,'interact',19999)
 assert.equal(timerState(store,'a',id,'start',99999).interacted,true)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'timeout'},99999),/取消/)
 assert.match(resolveResponse(store,'a',{id,source:'choice',option:1}),/用户选择[\s\S]*技术团队/)
})
test('skip and close choose the recommendation, custom text stays intact, stale and invalid responses are rejected',()=>{
 for(const source of ['skip','close']){const {store,id}=setup();assert.match(resolveResponse(store,'a',{id,source,option:1}),/委托模型[\s\S]*路线：管理层/)}
 const {store,id,messages}=setup();assert.match(resolveResponse(store,'a',{id,source:'custom',text:'客户，三页，中文'}),/客户，三页，中文/)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'custom',text:' '}),/填写/)
 assert.throws(()=>resolveResponse(store,'a',{id,source:'choice',option:2}),/有效/)
 assert.throws(()=>resolveResponse(store,'a',{id:'old',source:'skip'}),/已经结束/)
 messages.push({role:'user',content:'新任务'});assert.throws(()=>resolveResponse(store,'a',{id,source:'skip'}),/已经结束/)
})
