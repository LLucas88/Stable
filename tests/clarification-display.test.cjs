const test = require('node:test'), assert = require('node:assert/strict')
const { clarificationDisplay } = require('../src/clarification-display.ts')
test('generated answers expose only question and answer without altering the model prompt', () => {
  for (const prefix of ['用户选择', '20 秒未操作，模型自主选择推荐路线', '用户委托模型选择推荐路线']) {
    const prompt = `【${prefix}】\n问题：新增哪两列？\n路线：新客单价 + 老客单价\n处理提示：读取源表后插入两列，并核对公式。`
    assert.deepEqual(clarificationDisplay(prompt), {question:'新增哪两列？',answer:'新客单价 + 老客单价'})
    assert.match(prompt, /读取源表后插入两列/)
  }
  assert.deepEqual(clarificationDisplay('针对“给谁看？”的补充：\n管理层\n保留三页'), {question:'给谁看？',answer:'管理层\n保留三页'})
  assert.equal(clarificationDisplay('问题：业务增长？\n处理提示：这是我正常输入的消息。'), undefined)
})
