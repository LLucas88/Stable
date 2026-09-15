'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const source = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
const code = transformSync(source.slice(source.indexOf('  async function addPastedAttachments('), source.indexOf('  async function catchReply(')), { loader: 'tsx' }).code

function setup(existing = []) {
  const calls = { inspected: [], saved: [], discarded: [], attachments: existing, prompt: '原文字', error: '' }
  const context = {
    state: { activeConversationId: 'conversation' }, attachments: existing,
    window: { stable: {
      files: { path: file => file.diskPath || '' },
      agent: {
        inspectAttachments: async paths => {
          calls.inspected.push(...paths)
          return paths.map(path => ({ path, name: path, size: 10, type: 'file' }))
        },
        savePastedImage: async (_id, name) => { calls.saved.push(name); return { path: 'draft/' + name, name, size: 10, type: 'image' } },
        discardDraftImage: async path => { calls.discarded.push(path) },
      },
    } },
    attachmentIsImage: item => item.type === 'image',
    setAttachments: items => { calls.attachments = items },
    setComposerErrorMap: update => { calls.error = update({}).conversation },
    setAttachmentStatus: text => { calls.status = text },
    errorMessage: error => error.message,
    setPrompt: update => { calls.prompt = update(calls.prompt) },
    Uint8Array,
  }
  vm.createContext(context); vm.runInContext(code, context)
  return { calls, context }
}
const file = (diskPath, type = '') => ({ diskPath, name: path.basename(diskPath), type })
const image = { name: 'image.png', type: 'image/png', arrayBuffer: async () => new ArrayBuffer(8) }

test('copied Windows documents and images use original paths and deduplicate attachments', async () => {
  const doc = String.raw`C:\测试 文档\报告.xlsx`, png = String.raw`C:\测试 文档\图片.png`
  const { context, calls } = setup([{ path: doc, size: 10, type: 'file' }])
  await context.addPastedAttachments([file(doc), file(doc), file(png, 'image/png')])
  assert.deepEqual(calls.inspected, [doc, png])
  assert.deepEqual(Array.from(calls.attachments, item => item.path), [doc, png])
  assert.equal(calls.saved.length, 0)
})

test('mixed copied files and screenshots merge together without losing either attachment', async () => {
  const { context, calls } = setup()
  await context.addPastedAttachments([file('D:\\报告.pdf', 'application/pdf'), image])
  assert.equal(calls.attachments.length, 2)
  assert.equal(calls.saved.length, 1)
  assert.equal(calls.discarded.length, 0)
})

test('failed attachment limit cleans only temporary screenshots, never copied original files', async () => {
  const original = Array.from({ length: 8 }, (_, i) => ({ path: 'existing-' + i, size: 10, type: 'file' }))
  const { context, calls } = setup(original)
  await context.addPastedAttachments([file('D:\\原件.txt'), image])
  assert.equal(calls.attachments, original)
  assert.match(calls.error, /最多添加 8/)
  assert.equal(calls.discarded.length, 1)
  assert.match(calls.discarded[0], /^draft\//)
})

test('text-only paste retains native editing and document MIME types are not filtered out', async () => {
  const { context, calls } = setup()
  let prevented = 0, captured
  context.handlePromptPaste({ clipboardData: { items: [{ kind: 'string' }] }, preventDefault: () => prevented++ })
  assert.equal(prevented, 0)
  context.addPastedAttachments = async files => { captured = files }
  const pdf = file('D:\\报告.pdf', 'application/pdf')
  context.handlePromptPaste({
    clipboardData: { items: [{ kind: 'file', type: pdf.type, getAsFile: () => pdf }], getData: () => '替换' },
    currentTarget: { selectionStart: 1, selectionEnd: 2 }, preventDefault: () => prevented++,
  })
  assert.equal(prevented, 1)
  assert.equal(captured[0], pdf)
  assert.equal(calls.prompt, '原替换字')
})
