'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { createClaudeAnswer, joinContinuation } = require('../desktop/services/claude-answer.cjs')
const message = (id, text, stop_reason = 'end_turn', extra = []) => ({ uuid: id, message: { id, content: [{ type: 'text', text }, ...extra], stop_reason } })

test('output-limit chain retains three segments and does not duplicate result or replayed events', () => {
  const a = createClaudeAnswer()
  a.assistant(message('intro', '我先读取数据。'))
  a.assistant(message('a', '## 分析\n内容\n**⑥ ', 'max_tokens'))
  a.assistant(message('a', '## 分析\n内容\n**⑥ ', 'max_tokens'))
  a.assistant(message('b', '**⑥ 供给侧缺口。\n行动：', 'max_tokens'))
  a.assistant(message('c', '核实门店。'))
  assert.equal(a.finish('核实门店。'), '## 分析\n内容\n**⑥ 供给侧缺口。\n行动：核实门店。')
})

test('ordinary messages and tool boundaries cannot pollute the final answer', () => {
  const a = createClaudeAnswer()
  a.assistant(message('a', '准备分析'))
  a.assistant(message('tool', '需要补查', 'tool_use', [{ type: 'tool_use', id: 't', name: 'Read' }]))
  a.assistant(message('b', '修正后的最终结论'))
  assert.equal(a.finish('修正后的最终结论'), '修正后的最终结论')
  a.assistant(message('c', '另一个独立回答'))
  assert.equal(a.finish('另一个独立回答'), '另一个独立回答')
})

test('stream stop metadata arriving after the assistant identifies continuation', () => {
  const a = createClaudeAnswer()
  a.stream({ type: 'message_start', message: { id: 'a' } })
  a.assistant(message('a', '第一部分', null))
  a.stream({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } })
  a.assistant(message('b', '第二部分'))
  assert.equal(a.finish('第二部分'), '第一部分第二部分')
})

test('unresolved output limit cannot masquerade as successful completion', () => {
  const a = createClaudeAnswer()
  a.assistant(message('a', '未完正文', 'max_tokens'))
  assert.throws(() => a.finish('未完正文'), { code: 'CLAUDE_ANSWER_INCOMPLETE' })
  assert.equal(a.text(), '未完正文')
})

test('text equality never removes legitimate repeated content; only incomplete numbered markers are repaired', () => {
  const prefix = '长段落🌟中文与指标报告的完整开头。'
  assert.equal(joinContinuation(prefix, prefix + '尾段'), prefix + prefix + '尾段')
  assert.equal(joinContinuation('正文\n**⑥ ', '**⑥ 结论'), '正文\n**⑥ 结论')
  assert.equal(joinContinuation('哈哈', '哈继续'), '哈哈哈继续')
  assert.equal(joinContinuation('哈', '哈'), '哈哈')
  assert.equal(joinContinuation('代码\n```js\nconst x=', '1;\n```'), '代码\n```js\nconst x=1;\n```')
})

test('an authoritative different final summary is not appended to stale fragments', () => {
  const a = createClaudeAnswer()
  a.assistant(message('a', '旧', 'max_tokens')); a.assistant(message('b', '报告'))
  assert.equal(a.finish('独立总结'), '独立总结')
})

test('multiple text blocks in one SDK message survive while thinking-only events do not become an answer', () => {
  const a = createClaudeAnswer()
  a.assistant(message('a', '第一段', 'max_tokens'))
  a.assistant({ uuid: 'thought', message: { id: 'b', content: [{ type: 'thinking', thinking: 'private' }] } })
  a.assistant({ ...message('b', '第二段'), uuid: 'block-1' })
  a.assistant({ ...message('b', '第三段'), uuid: 'block-2' })
  assert.equal(a.finish('第三段'), '第一段第二段\n第三段')
})


test('truncated report survives tools but excludes tool commentary', () => {
 const a=createClaudeAnswer()
 a.assistant(message('a','前五条\n**⑥ ','max_tokens'))
 a.assistant(message('t','我再核对数据','tool_use',[{type:'tool_use',name:'Read',id:'r'}]))
 a.assistant(message('t2','','tool_use',[{type:'tool_use',name:'Read',id:'r2'}]))
 a.assistant(message('b','**⑥ 后文'))
 assert.equal(a.finish('**⑥ 后文'),'前五条\n**⑥ 后文')
 assert.deepEqual(a.sources().map(x=>x.id),['a','b'])
})

test('real repeated rows and fenced code are preserved byte for byte',()=>{
 for(const row of ['  "保持默认配置不变",\n','| 同类指标 | 100 |\n','完整的一句话重复两次也是合法内容。']) {
  assert.equal(joinContinuation(row,row),row+row)
 }
 for(const fence of ['```','~~~~']) {
  const left=fence+'\n**⑥ '
  assert.equal(joinContinuation(left,'**⑥ 内容'),left+'**⑥ 内容')
 }
})

test('independent text blocks sharing a prefix remain separate and UUID replays stay idempotent',()=>{
 const a=createClaudeAnswer()
 const b1={...message('m','第一个条目。'),uuid:'block1'}
 const b2={...message('m','第一个条目。补充。'),uuid:'block2'}
 a.assistant(b1);a.assistant(b2);a.assistant(b2)
 assert.equal(a.finish('第一个条目。补充。'),'第一个条目。\n第一个条目。补充。')
})

test('new accepted input drops all old continuation and stop metadata',()=>{
 const a=createClaudeAnswer()
 a.assistant(message('old','旧报告','max_tokens'));a.reset()
 a.assistant(message('new','新要求的答案'))
 assert.equal(a.finish('新要求的答案'),'新要求的答案')
 assert.deepEqual(a.sources().map(x=>x.id),['new'])
})

test('message-level result preserves continuation and source identities without hiding an independent summary', () => {
 const a=createClaudeAnswer()
 a.assistant(message('first','前文','max_tokens'))
 a.assistant({...message('last','下一段'),uuid:'last-block1'})
 a.assistant({...message('last','同样的表格行'),uuid:'last-block2'})
 assert.equal(a.finish('下一段\n同样的表格行'),'前文下一段\n同样的表格行')
 assert.equal(a.finish('独立的最终总结'),'独立的最终总结')
 assert.deepEqual(a.sources().flatMap(x=>x.sourceIds),['first','last-block1','last-block2'])
 const sources=a.sources();sources[0].sourceIds.push('external')
 assert(!a.sources()[0].sourceIds.includes('external'))
})

test('SDK split text then tool blocks restore the pending continuation', () => {
 for (const truncated of [true, false]) {
  const a = createClaudeAnswer()
  a.assistant(message('a', '前文', truncated ? 'max_tokens' : 'end_turn'))
  a.stream({ type: 'message_start', message: { id: 'tool-message' } })
  a.assistant({ ...message('tool-message', '核查说明', null), uuid: 'preamble' })
  a.assistant({ ...message('tool-message', '', null, [{ type: 'tool_use', id: 'r', name: 'Read' }]), uuid: 'tool-block' })
  a.stream({ type: 'message_delta', delta: { stop_reason: 'tool_use' } })
  a.assistant(message('b', '后文'))
  assert.equal(a.finish('后文'), truncated ? '前文后文' : '后文')
 }
})
