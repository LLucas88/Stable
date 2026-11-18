const test = require('node:test'), assert = require('node:assert/strict')
const { boundedDetail } = require('../desktop/services/trace-detail.cjs')
const { failedTurn } = require('../desktop/services/failed-turn.cjs')
test('large snapshot keeps context and trailing exception through both trace limits', () => {
  const original = 'COMMAND_CONTEXT\n' + 'snapshot '.repeat(9000) + '\n批量步骤 2 停止：真实异常'
  const result = boundedDetail(boundedDetail(original, 32000))
  assert(result.startsWith('COMMAND_CONTEXT')); assert(result.endsWith('批量步骤 2 停止：真实异常'))
  assert(result.length <= 8000); assert.match(result, /中间输出已省略/)
  assert.equal(boundedDetail('short error'), 'short error')
  const terminal = failedTurn({ id: 'test', state: 'failed', error: original }).trace.at(-1)
  assert(terminal.detail.endsWith('真实异常')); assert(terminal.detail.length <= 8000)
})
