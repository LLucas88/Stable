'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const {canAutoApprove}=require('../desktop/services/codex-approval.cjs')
const {parseDecision}=require('../desktop/services/approval-ledger.cjs')
const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8').replace(/\r\n/g,'\n')
const start=source.indexOf("    if (source.kind === 'approval' && source.requestId && source.status === 'running') {")
const end=source.indexOf('\n  }\n  if (installedSkills.length)',start)
assert.ok(start>=0&&end>start)
const block='(source)=>{'+source.slice(start,end)+'\n}'
async function route(mode, decision='approved', options={}) {
  const replies=[],events=[],reviews=[],records=[],waits=[]
  const digest='a'.repeat(64), control={reviewers:new Set()}
  const invoke=vm.runInNewContext(block,{
    ApprovalLedger:class {register(){return {id:'id',actionDigest:digest}} finish(id,d){records.push(d);return true} limited(){return !!options.limited} prompt(){return 'review'}},
    store:{},conversationId:'conversation',runId:'run',query:'User task',paths:{workspace:__dirname},permissionModeOverride:mode,
    canAutoApprove,parseDecision,redactApproval:s=>s,featureFlags:{compatibilityReviewer:options.enabled!==false},
    executionRunner:{answerApproval:(...args)=>{replies.push(args);return true}},
    publish:event=>events.push(event),taskAlerts:{wait:(...args)=>waits.push(args)},
    agentRunners:new Map([['conversation',control]]),model:{model:'mock'},apiKey:'unused',
    createHarnessRunner:()=>({run:async(...args)=>{reviews.push(args);if(decision==='error')throw Error('timeout');return JSON.stringify({decision,actionDigest:digest,approvedScope:digest,policyVersion:3,reasonCode:'TEST',rationale:'test decision',authorizationBasis:'User task'})}})
  })
  invoke({kind:'approval',requestId:'q',status:'running',danger:true,approvalRisk:'safe',toolName:'Remove-Item data -Recurse'})
  await new Promise(resolve=>setImmediate(resolve))
  return {replies,events,reviews,records,waits,control}
}
test('request waits for user even with a formerly safe classification; full allows even destructive requests',async()=>{
  const manual=await route('request');assert.equal(manual.replies.length,0);assert.equal(manual.reviews.length,0);assert.equal(manual.waits.length,1)
  const full=await route('full');assert.deepEqual(full.replies,[['q',true]]);assert.equal(full.reviews.length,0);assert.equal(full.records[0].reasonCode,'FULL_ACCESS')
})
test('auto sends destructive requests to the reviewer and respects approve, deny and needs_user',async()=>{
  for(const decision of ['approved','denied','needs_user']){
    const result=await route('auto',decision);assert.equal(result.reviews.length,1);assert.equal(result.reviews[0][3],60000);assert.equal(result.reviews[0][5],'read-only')
    assert.deepEqual(result.replies,decision==='needs_user'?[]:[['q',decision==='approved']])
    if(decision==='needs_user')assert.equal(result.events[0].status,'awaiting_user')
    assert.equal(result.control.reviewers.size,0)
  }
})
test('review timeout denies; disabled or exhausted reviewer falls back to user without executing',async()=>{
  const failed=await route('auto','error');assert.deepEqual(failed.replies,[['q',false]]);assert.equal(failed.records[0].decision,'timed_out')
  for(const options of [{limited:true},{enabled:false}]){const result=await route('auto','approved',options);assert.equal(result.reviews.length,0);assert.equal(result.replies.length,0);assert.equal(result.events[0].status,'awaiting_user')}
})

test('full permission suppresses pending approval broadcasts; other modes retain them',()=>{
 const expression=source.match(/const silentApproval = ([^\n]+)/)[1];
 for(const mode of ['full','auto','request']) for(const status of ['running','completed']) {
  const silent=vm.runInNewContext(expression,{source:{kind:'approval',status},canAutoApprove,permissionModeOverride:mode});
  assert.equal(silent,mode==='full'&&status==='running');
 }
 assert.match(source,/if \(!silentApproval && broadcast/);
});
