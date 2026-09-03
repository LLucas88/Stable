const test = require('node:test')
const assert = require('node:assert/strict')
const { taskErrorMessage } = require('../src/task-feedback.ts')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('expected task stop acknowledgements do not appear as errors', () => {
  for (const text of ['任务已停止。', '任务已取消', '任务已取消。', '脚本执行已取消。', ' 任务已停止。\n', '已停止发送，消息仍保留在队列中。']) {
    assert.equal(taskErrorMessage(text), '')
  }
})

test('real failures and unknown messages remain visible even if they mention stopping', () => {
  for (const text of ['停止任务失败：权限不足。', '任务已停止，但保存结果失败。', '网络连接已取消，请重试。', 'FAIL_BIZ_04 当前品牌无权访问该数据集', '请求超时', '找不到这个对话。', '这个对话已有任务正在执行。']) {
    assert.equal(taskErrorMessage(text), text)
  }
})

test('composer filters only task feedback and preserves terminal status and queue decisions', () => {
  const app = readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
  assert.match(app, /const feedback = taskErrorMessage\(detail\)/)
  assert.match(app, /\[conversationId\]: feedback/)
  assert.match(app, /return \{ accepted: messageAccepted, continue: false, error: detail \}/)
  assert.match(app, /taskErrorMessage\(errorMessage\(item.error\)\)/)
  assert.match(app, /status: trace.status === 'running' \? terminalStatus : trace.status/)
  assert.match(app, /catch\(\(error\) => setComposerErrorMap[^\n]+taskErrorMessage\(errorMessage\(error\)\)/)
})
