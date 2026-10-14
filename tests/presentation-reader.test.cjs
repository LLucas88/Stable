'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const PptxGenJS = require('pptxgenjs'), JSZip = require('jszip')
const { readPresentation } = require('../desktop/services/presentation-reader.cjs')
const { extractText } = require('../desktop/services/importers.cjs')
const { materializeAttachment, extractAttachmentText, inspectAttachmentPath, selectPresentationImages, attachmentImages } = require('../desktop/services/attachments.cjs')
const { composeAgentPrompt } = require('../desktop/services/prompts.cjs')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function deck() {
  const pptx = new PptxGenJS()
  const slide = pptx.addSlide()
  slide.addText('经营复盘 & <数据>', { x: 1, y: 1, w: 4, h: 1 })
  slide.addTable([['月份', '收入'], ['九月', '120']], { x: 1, y: 2, w: 3, h: 1 })
  slide.addNotes('这是一条备注。')
  slide.addImage({ data: 'image/png;base64,' + png, x: 5, y: 1, w: 1, h: 1 })
  slide.addChart(pptx.ChartType.bar, [{ name: '净收入', labels: ['八月', '九月'], values: [100, 120] }], { x: 1, y: 3, w: 4, h: 2 })
  pptx.addSlide().addText('第二页', { x: 1, y: 1, w: 2, h: 1 })
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }))
}

test('PPTX upload materializes text, tables, notes, images and chart data into model input without changing source', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-pptx-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, '业务.PPTX'), bytes = await deck()
  fs.writeFileSync(file, bytes)
  assert.equal(inspectAttachmentPath(file).type, 'pptx')
  const workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace)
  const copied = materializeAttachment(file, path.join(workspace, '.stable', 'attachments'), workspace)
  const parsed = await extractAttachmentText(copied.path, { presentationAssets: true })
  for (const content of ['经营复盘 & <数据>', '月份', '这是一条备注', '净收入', '100', '120', '内嵌图表工作簿', '第二页']) assert.ok(parsed.text.includes(content), content)
  assert.ok(parsed.text.indexOf('幻灯片 1') < parsed.text.indexOf('幻灯片 2'))
  assert.equal(parsed.images.length, 1)
  assert.deepEqual(fs.readFileSync(parsed.images[0].path), Buffer.from(png, 'base64'))
  assert.ok(fs.readFileSync(parsed.textPath, 'utf8').includes('内嵌图表工作簿'))
  assert.deepEqual(fs.readFileSync(file), bytes)
  const items = selectPresentationImages([{ ...copied, ...parsed }])
  assert.equal(attachmentImages(items).length, 1)
  const prompt = composeAgentPrompt({ query: '分析附件', attachments: items, workspace: root })
  assert.ok(prompt.includes(parsed.textPath))
  assert.match(prompt, /已发送 1 张内嵌图片像素/)
  assert.match(prompt, /不等同于整页幻灯片渲染/)
  assert.match((await extractText(file)).text, /经营复盘/)
})

test('PPTX respects presentation relationship order and never follows external image links', async () => {
  const zip = await JSZip.loadAsync(await deck())
  let xml = await zip.file('ppt/presentation.xml').async('string')
  xml = xml.replace(/(<p:sldId[^>]+\/>)(<p:sldId[^>]+\/>)/, '$2$1')
  zip.file('ppt/presentation.xml', xml)
  const relsPath = 'ppt/slides/_rels/slide1.xml.rels'
  zip.file(relsPath, (await zip.file(relsPath).async('string')).replace(/Target="[^\"]+"([^>]*Type="[^\"]*\/image")/, 'Target="https://example.invalid/image.png" TargetMode="External"$1'))
  const result = await readPresentation(await zip.generateAsync({ type: 'nodebuffer' }))
  assert.ok(result.text.indexOf('第二页') < result.text.indexOf('经营复盘'))
  // External relationship order can vary between producers; exercise it directly too.
  const relationships = await zip.file(relsPath).async('string')
  zip.file(relsPath, relationships.replace(/<Relationship\b[^>]*Type="[^\"]*\/image"[^>]*\/>/g, match => match.replace(/Target="[^\"]*"/, 'Target="https://example.invalid/image.png"').replace(/ TargetMode="[^\"]*"/g, '').replace('/>', ' TargetMode="External"/>')))
  assert.match((await readPresentation(await zip.generateAsync({ type: 'nodebuffer' }))).text, /图片：外部链接/)
})

test('PPTX rejects unsafe archives and entity declarations', async () => {
  const zip = await JSZip.loadAsync(await deck())
  zip.file('../outside.txt', 'unsafe')
  await assert.rejects(readPresentation(await zip.generateAsync({ type: 'nodebuffer' })), /不安全路径/)
  const other = await JSZip.loadAsync(await deck())
  other.file('ppt/presentation.xml', '<!DOCTYPE p [<!ENTITY leak SYSTEM "file:///secret">]><p/>')
  await assert.rejects(readPresentation(await other.generateAsync({ type: 'nodebuffer' })), /DTD/)
  await assert.rejects(readPresentation(Buffer.from('not pptx')))
})

test('presentation image budgets retain direct uploads and tell the model about deferred pixels', () => {
  const direct = { path: '/direct.png', mediaType: 'image/png', size: 5 * 1024 * 1024 }
  const items = selectPresentationImages([direct, { type: 'pptx', text: 'slides', images: [
    { path: '/one.png', name: '第一页', mediaType: 'image/png', size: 4 * 1024 * 1024 },
    { path: '/two.png', name: '第二页', mediaType: 'image/png', size: 4 * 1024 * 1024 },
    { path: '/vector.emf', name: '矢量图', mediaType: '', size: 100 },
  ] }])
  assert.deepEqual(attachmentImages(items).map(image => image.path), ['/direct.png', '/one.png'])
  assert.match(items[1].text, /第二页：未作为视觉输入发送/)
  assert.match(items[1].text, /矢量图：未作为视觉输入发送/)
})
