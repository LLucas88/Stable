const test = require('node:test'), assert = require('node:assert/strict')
const { clarificationDisplay, clarificationPendingContent, isClarificationOnly } = require('../src/clarification-display.ts')
test('generated answers expose only question and answer without altering the model prompt', () => {
  for (const prefix of ['用户选择', '20 秒未操作，模型自主选择推荐路线', '用户委托模型选择推荐路线']) {
    const prompt = `【${prefix}】\n问题：新增哪两列？\n路线：新客单价 + 老客单价\n处理提示：读取源表后插入两列，并核对公式。`
    assert.deepEqual(clarificationDisplay(prompt), {question:'新增哪两列？',answer:'新客单价 + 老客单价'})
    assert.match(prompt, /读取源表后插入两列/)
  }
  assert.deepEqual(clarificationDisplay('针对“给谁看？”的补充：\n管理层\n保留三页'), {question:'给谁看？',answer:'管理层\n保留三页'})
  assert.equal(clarificationDisplay('问题：业务增长？\n处理提示：这是我正常输入的消息。'), undefined)
})

test('pending clarification matches persisted question and answer and pure question turns are hidden', () => {
  const {resolveResponse}=require('../desktop/services/clarification-interaction.cjs')
  const card={id:'q',status:'waiting',question:'要哪种花边？',options:[{label:'CSS 花边',description:'适配卡片'},{label:'图片',description:'使用本地素材'}]}
  const message={role:'assistant',content:card.question,trace:[{kind:'status',status:'completed',clarification:card}]},messages=[message],store={listMessages:()=>messages}
  for(const response of [{id:'q',source:'choice',option:0},{id:'q',source:'custom',text:' 自定义花边 '}]) {
    assert.equal(clarificationPendingContent('CSS 花边',response,messages),resolveResponse(store,'c',response))
    assert.equal(clarificationDisplay(clarificationPendingContent('CSS 花边',response,messages)).question,card.question)
  }
  assert.ok(isClarificationOnly(message));assert.equal(isClarificationOnly({...message,trace:[...message.trace,{kind:'tool',status:'completed'}]}),false)
  assert.equal(isClarificationOnly({...message,content:'已经修改报告，然后请确认花边'}),false)
  assert.equal(clarificationPendingContent('普通消息',undefined,messages),'普通消息')
})


test('question-only answer is hidden while public explanation remains a process turn',()=>{
 const {isClarificationQuestion}=require('../src/clarification-display.ts');
 const message={role:'assistant',content:'是否保留？',trace:[{kind:'reasoning',eventType:'agent/answer',content:'发现三行额外内容。'},{kind:'status',clarification:{question:'是否保留？'}}]};
 assert.equal(isClarificationOnly(message),false);assert.equal(isClarificationQuestion(message),true);
 assert.equal(isClarificationOnly({...message,trace:message.trace.map(i=>({...i,content:''}))}),true);
});
