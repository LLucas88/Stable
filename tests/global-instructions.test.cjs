'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DEFAULT_GLOBAL_INSTRUCTIONS, ensureGlobalInstructions, readGlobalInstructionsFile, saveGlobalInstructionsFile } = require('../desktop/services/global-instructions.cjs')
const { composeAgentPrompt } = require('../desktop/services/prompts.cjs')

const rules = [
  '请在每次我交给你任务或者对话时，首要明确任务目标和交付结果，需要先向我提问问题，一直到你有95%的信心你能达到我的预期，你再开始进行任务。',
  '将我提供的解释、诊断、假设和解决方案视为待验证假设，而不是既定事实；前提错误或缺乏依据时明确指出。',
  '保持客观。赞同和反对都应基于证据与推理，目标是得到更正确的结论。',
  '对技术判断，在条件允许时优先通过代码、测试、日志、运行结果或权威文档验证；可执行、可复现、可独立验证的证据优先于直觉和表面合理性。',
  '仅在出现新证据或更强推理时修改已有结论；用户的质疑、信心或重复坚持本身不构成新证据。修改结论时说明具体依据。',
  '明确区分已验证事实、当前假设和未知信息；证据不足时说明不确定性和验证办法。',
  '接受重要判断或方案前，主动检查其最强反例、失败场景、边界条件和隐藏假设。',
]

function sandbox(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'stable-global-rules-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return path.join(directory, 'profile')
}

test('source default contains all seven user rules verbatim and is included in both installer configurations', () => {
  const content = readFileSync(DEFAULT_GLOBAL_INSTRUCTIONS, 'utf8')
  assert.deepEqual(content.split(/\r?\n/).filter((line) => /^\d+\. /.test(line)), rules.map((rule, index) => `${index + 1}. ${rule}`))
  const pkg = require('../package.json')
  const update = require('../build/update-builder.config.cjs')
  assert.ok(pkg.build.files.includes('desktop/**/*'))
  assert.ok(update.files.includes('desktop/**/*'))
  const main = readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
  assert.match(main, /ensureGlobalInstructions\(paths\.userData\)/)
  assert.match(main, /globalInstructions: readGlobalInstructions\(\)\.content/)
})

test('first launch seeds the local global AGENTS.md from the bundled source exactly once', (t) => {
  const userData = sandbox(t)
  const expected = readFileSync(DEFAULT_GLOBAL_INSTRUCTIONS, 'utf8')
  const filePath = ensureGlobalInstructions(userData)
  assert.equal(filePath, path.join(userData, 'AGENTS.md'))
  assert.deepEqual(readGlobalInstructionsFile(userData), { path: filePath, content: expected, exists: true })
  ensureGlobalInstructions(userData)
  assert.equal(readFileSync(filePath, 'utf8'), expected)
})

test('existing custom rules and deliberately empty rules survive an upgraded default', (t) => {
  const userData = sandbox(t)
  const filePath = ensureGlobalInstructions(userData)
  const replacement = path.join(path.dirname(userData), 'new-default.md')
  writeFileSync(replacement, '未来版本的新默认值', 'utf8')
  for (const content of ['用户自己的规则\r\n请保留原有格式。', '']) {
    writeFileSync(filePath, content, 'utf8')
    const before = readFileSync(filePath)
    ensureGlobalInstructions(userData, replacement)
    assert.deepEqual(readFileSync(filePath), before)
    assert.equal(readGlobalInstructionsFile(userData).content, content)
  }
})

test('default rules reach future prompts, while saved user changes affect only subsequent prompt composition', (t) => {
  const userData = sandbox(t)
  const compose = () => composeAgentPrompt({ identity: 'Stable', globalInstructions: readGlobalInstructionsFile(userData).content, query: '测试任务', history: [], data: [], knowledge: [], skills: [] })
  const firstPrompt = compose()
  for (const rule of rules) assert.ok(firstPrompt.includes(rule))
  saveGlobalInstructionsFile(userData, '\uFEFF自定义说明')
  assert.match(compose(), /本机全局 Agent 对话提醒\n自定义说明/)
  assert.ok(firstPrompt.includes(rules[0]))
  assert.equal(readGlobalInstructionsFile(userData).content, '自定义说明')
})

test('invalid or oversized edits do not replace saved global rules', (t) => {
  const userData = sandbox(t)
  const before = readGlobalInstructionsFile(userData)
  assert.throws(() => saveGlobalInstructionsFile(userData, null), /内容无效/)
  assert.throws(() => saveGlobalInstructionsFile(userData, '中'.repeat(70_000)), /200 KB/)
  assert.deepEqual(readGlobalInstructionsFile(userData), before)
})
