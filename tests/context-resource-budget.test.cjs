'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { composeAgentPrompt } = require('../desktop/services/prompts.cjs')

test('large retrieved resources share a budget and retain exact complete text for tools', t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-context-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const data = Array.from({ length: 5 }, (_, i) => ({ name: `数据${i}`, text_content: `开头${i}\n${'会员,净GMV,12345\n'.repeat(9000)}尾部${i}` }))
  const knowledge = Array.from({ length: 4 }, (_, i) => ({ name: `知识${i}`, excerpt: '相关片段'.repeat(5000), fullText: `完整知识${i}\n${'分析方法'.repeat(20000)}` }))
  const args = { identity: 'Stable', query: '根据数据生成报告', workspace, data, knowledge, attachments: [{ name: '本次.xls', text: '表格'.repeat(50000), path: path.join(workspace, '本次.xls') }] }
  const prompt = composeAgentPrompt(args)
  assert.ok(prompt.length < 50000, `prompt has ${prompt.length} characters`)
  assert.match(prompt, /预览不能作为完整数据/)
  for (const item of [...data, ...knowledge]) {
    assert.ok(item.contextPath.startsWith(path.join(workspace, '.stable', 'context') + path.sep))
    assert.ok(prompt.includes(item.contextPath))
    assert.equal(fs.readFileSync(item.contextPath, 'utf8'), item.fullText ?? item.text_content)
  }
  assert.equal(composeAgentPrompt(args), prompt)
  assert.equal(fs.readdirSync(path.join(workspace, '.stable', 'context')).length, 9)
})

test('resource snapshot rejects a junction escaping the execution workspace', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-context-link-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, 'workspace'), outside = path.join(root, 'outside')
  fs.mkdirSync(workspace); fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(workspace, '.stable'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => composeAgentPrompt({ query: '分析', workspace, data: [{ name: '数据', text_content: 'x'.repeat(50000) }] }), /Junction|符号链接/)
  assert.deepEqual(fs.readdirSync(outside), [])
})
