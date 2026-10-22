'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { compactToolContext } = require('../desktop/services/claude-context.cjs')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { createHash } = require('node:crypto')
const image = data => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + data } })
const pair = (id, content, name = 'mcp__stable__stable_browser', args = '{}') => [
  { role: 'assistant', content: null, reasoning_content: 'preserve', tool_calls: [{ id, type: 'function', function: { name, arguments: args } }] },
  { role: 'tool', tool_call_id: id, content },
]
const snapshot = (ref, text = 'page '.repeat(300)) => JSON.stringify({ tabId: 't', url: 'file:///report', untrustedContent: true, text, textTruncated: true, controls: [{ ref }], viewport: { width: ref === 'a' ? 1440 : 390 } })

test('native Read images share the evidence window using exact returned bytes, not mutable source files', t => {
  const imageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-read-images-'))
  t.after(() => fs.rmSync(imageDirectory, { recursive: true, force: true }))
  const input = [{ role: 'user', content: [image('dXBsb2Fk')] }]
  for (let i = 0; i < 9; i++) input.push(...pair('read-' + i,
    [image(Buffer.from('sdk-resized-image-' + i).toString('base64'))], 'Read',
    JSON.stringify({ file_path: path.join(imageDirectory, 'deleted-original.png') })))
  const original = JSON.stringify(input)
  const output = compactToolContext(input, { imageDirectory })
  assert.equal(output.filter(m => m.role === 'tool').flatMap(m => m.content).filter(p => p.type === 'image_url').length, 3)
  const bytes = Buffer.from('sdk-resized-image-0'), hash = createHash('sha256').update(bytes).digest('hex')
  const saved = path.join(imageDirectory, hash + '.png')
  assert(fs.readFileSync(saved).equals(bytes))
  assert(output[2].content[0].text.includes(JSON.stringify(saved)))
  assert.equal(JSON.stringify(input), original)
  assert.deepEqual(output[0], input[0], 'user images are never archived or replaced')
  assert.deepEqual(compactToolContext(input.slice(-4), { imageDirectory }), input.slice(-4), 'SDK compaction keeps surviving views inline')
  fs.writeFileSync(saved, 'tampered')
  assert.equal(compactToolContext(input, { imageDirectory })[2].content[0].type, 'image_url', 'never reference or overwrite changed artifacts')
  assert.equal(fs.readFileSync(saved, 'utf8'), 'tampered')
  assert.deepEqual(compactToolContext(input, { imageDirectory: path.join(imageDirectory, 'missing') }), input, 'archive failure preserves all pixels')
  const failed = pair('bad', [{ type: 'text', text: 'Tool execution error:' }, image('YQ==')], 'Read')
  assert.deepEqual(compactToolContext(failed, { imageDirectory }), failed)
})

test('only the latest complete notebook per run enters context; evidence, errors and raw history survive', () => {
  const record = (scope, revision, status) => ({ scope, revision, checks: [{ check: 'mobile', status }], evidence: [] })
  const input = [
    ...pair('a', JSON.stringify({ reviewNotebook: record('run1', 1, 'open'), screenshotPath: 'actual.png', controls: [{ ref: 'a' }] })),
    ...pair('b', JSON.stringify({ reviewNotebook: record('run1', 2, 'passed') })),
    ...pair('c', JSON.stringify({ reviewNotebook: record('run2', 1, 'needs-recheck') })),
    ...pair('error', JSON.stringify({ error: 'failed', reviewNotebook: record('run1', 3, 'open') })),
  ]
  const original = JSON.stringify(input), output = compactToolContext(input)
  const first = JSON.parse(output[1].content)
  assert.equal(first.reviewNotebook, undefined)
  assert.match(first.reviewNotebookReference, /scope=run1/)
  assert.equal(first.screenshotPath, 'actual.png')
  assert.deepEqual(first.controls, [{ ref: 'a' }])
  assert.equal(JSON.parse(output[3].content).reviewNotebook.checks[0].status, 'passed')
  assert.equal(JSON.parse(output[5].content).reviewNotebook.checks[0].status, 'needs-recheck')
  assert.deepEqual(output[7], input[7])
  assert.equal(JSON.stringify(input), original)
  assert.equal(JSON.parse(compactToolContext(input.slice(0, 2))[1].content).reviewNotebook.checks[0].status, 'open')
  const later = [...input, ...pair('d', JSON.stringify({ reviewNotebook: record('run1', 4, 'open') }))]
  assert.deepEqual(compactToolContext(later)[1], output[1], 'superseded references stay stable to preserve prompt cache prefixes')
})

test('older managed screenshots use readable evidence files; recent views and user images remain', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-evidence-context-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const input = [{ role: 'user', content: [image('uploaded')] }]
  for (let i = 0; i < 9; i++) {
    const data = Buffer.from('frame-' + i), file = path.join(dir, i + '.png')
    fs.writeFileSync(file, data)
    input.push(...pair('frame-' + i, [
      { type: 'text', text: JSON.stringify({ screenshotPath: file, screenshotArtifact: { path: file, sha256: createHash('sha256').update(data).digest('hex'), mimeType: 'image/png' } }) },
      image(data.toString('base64')),
    ], 'mcp__stable__stable_browser', '{"action":"screenshot"}'))
  }
  const output = compactToolContext(input)
  assert.equal(output.filter(m => m.role === 'tool').flatMap(m => m.content).filter(p => p.type === 'image_url').length, 3)
  assert.match(output[2].content[1].text, /0\.png/)
  assert.deepEqual(output[0], input[0])
  assert.deepEqual(output.at(-1), input.at(-1))
  fs.unlinkSync(path.join(dir, '0.png'))
  assert.equal(compactToolContext(input)[2].content[1].type, 'image_url', 'missing evidence must keep inline pixels')
  fs.writeFileSync(path.join(dir, '0.png'), Buffer.from('altered'))
  assert.equal(compactToolContext(input)[2].content[1].type, 'image_url', 'changed evidence must keep inline pixels')
  assert.deepEqual(compactToolContext(input.slice(-4)), input.slice(-4), 'compacted histories reselect their recent images')
})

test('identical browser body is referenced; current refs, dimensions and changed text remain', () => {
  const input = [...pair('a', snapshot('a')), ...pair('b', snapshot('b')), ...pair('c', snapshot('c', 'changed '.repeat(300)))]
  const saved = JSON.stringify(input), output = compactToolContext(input), second = JSON.parse(output[3].content)
  assert.equal(JSON.stringify(input), saved)
  assert.equal(second.text, undefined)
  assert.match(second.contextReferences.text, /tool_call_id=a.text/)
  assert.equal(second.controls[0].ref, 'b'); assert.equal(second.viewport.width, 390); assert.equal(second.textTruncated, true)
  assert.equal(JSON.parse(output[5].content).text, 'changed '.repeat(300))
  assert.deepEqual(output[2], input[2])
})

test('multi-image batches bound retained screenshots independently and preserve actual evidence paths', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-batch-context-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const input = []
  for (let batch = 0; batch < 3; batch++) {
    const content = []
    for (let i = 0; i < 4; i++) {
      const data = Buffer.from(`batch-${batch}-frame-${i}`), file = path.join(dir, `${batch}-${i}.png`)
      fs.writeFileSync(file, data)
      content.push({ type: 'text', text: JSON.stringify({ batchStep: i + 1, screenshotArtifact: {
        path: file, sha256: createHash('sha256').update(data).digest('hex'), mimeType: 'image/png',
      } }) }, image(data.toString('base64')))
    }
    input.push(...pair('batch-' + batch, content, 'mcp__stable__stable_browser', '{"action":"batch"}'))
  }
  const original = JSON.stringify(input), output = compactToolContext(input)
  assert.equal(output.filter(m => m.role === 'tool').flatMap(m => m.content).filter(p => p.type === 'image_url').length, 3)
  assert.match(output[1].content[1].text, /0-0\.png/)
  assert.match(output[1].content[7].text, /0-3\.png/)
  assert.equal(output[3].content[5].type, 'text'); assert.equal(output[5].content[3].type, 'image_url')
  assert.equal(JSON.stringify(input), original)
  fs.unlinkSync(path.join(dir, '0-0.png'))
  assert.equal(compactToolContext(input)[1].content[1].type, 'image_url')
})

test('SDK-transformed browser images are archived exactly and share the three-view window', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-resized-context-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const imageDirectory = path.join(dir, 'archive'); fs.mkdirSync(imageDirectory)
  const input = []
  for (let i = 0; i < 9; i++) {
    const original = Buffer.from('original-capture-' + i), file = path.join(dir, i + '.png')
    fs.writeFileSync(file, original)
    const transformed = image(Buffer.from('sdk-transformed-' + i).toString('base64'))
    // The SDK can change image encoding as well as dimensions.
    if (i === 0) transformed.image_url.url = transformed.image_url.url.replace('image/png', 'image/jpeg')
    input.push(...pair('capture-' + i, [
      { type: 'text', text: JSON.stringify({ screenshotArtifact: {
        path: file, sha256: createHash('sha256').update(original).digest('hex'), mimeType: 'image/png',
      } }) }, transformed,
    ], 'mcp__stable__stable_browser', '{"action":"batch"}'))
  }
  const saved = JSON.stringify(input), output = compactToolContext(input, { imageDirectory })
  assert.equal(output.flatMap(m => m.content || []).filter(p => p.type === 'image_url').length, 3)
  const bytes = Buffer.from('sdk-transformed-0')
  const actual = path.join(imageDirectory, createHash('sha256').update(bytes).digest('hex') + '.jpeg')
  assert(fs.readFileSync(actual).equals(bytes))
  assert(output[1].content[1].text.includes(JSON.stringify(actual)))
  assert.equal(fs.readFileSync(path.join(dir, '0.png'), 'utf8'), 'original-capture-0')
  assert.equal(JSON.stringify(input), saved)
  fs.writeFileSync(path.join(dir, '0.png'), 'changed original')
  assert.equal(compactToolContext(input, { imageDirectory })[1].content[1].type, 'image_url')
})

test('identical audit measurements are referenced but changed geometry and current viewport remain', () => {
  const hiddenText = [{ label: 'inactive panel '.repeat(60), hiddenBy: { display: 'none' } }]
  const make = (width, bottom) => JSON.stringify({ tabId: 't', url: 'file:///report', untrustedContent: true,
    viewport: { width }, hiddenText, imageGeometry: [{ label: 'image '.repeat(100), bottom }] })
  const input = [...pair('a', make(1440, 100)), ...pair('b', make(390, 100)), ...pair('c', make(390, 120))]
  const output = compactToolContext(input), second = JSON.parse(output[3].content), third = JSON.parse(output[5].content)
  assert.equal(second.hiddenText, undefined)
  assert.match(second.contextReferences.hiddenText, /tool_call_id=a/)
  assert.equal(second.viewport.width, 390)
  assert.equal(second.imageGeometry, undefined)
  assert.equal(third.imageGeometry[0].bottom, 120)
  assert.equal(JSON.parse(compactToolContext(input.slice(-2))[1].content).hiddenText.length, 1)
})
test('image inventories are reused only while decoded dimensions and loading state match', () => {
  const images = Array.from({ length: 20 }, (_, index) => ({ index, naturalWidth: 600, naturalHeight: 1011, loaded: true }))
  const make = images => JSON.stringify({ tabId: 't', url: 'file:///report', untrustedContent: true, imageInventory: { total: 20, images } })
  const changed = images.map((image, i) => i ? image : { ...image, loaded: false, naturalWidth: 0 })
  const input = [...pair('a', make(images)), ...pair('b', make(images)), ...pair('c', make(changed))]
  const output = compactToolContext(input)
  assert.match(JSON.parse(output[3].content).contextReferences.imageInventory, /tool_call_id=a/)
  assert.deepEqual(JSON.parse(output[5].content).imageInventory.images, changed)
  assert.deepEqual(compactToolContext(input.slice(-2)), input.slice(-2))
})

test('only identical tool image bytes are referenced; user uploads and different views stay intact', () => {
  const input = [{ role: 'user', content: [image('same')] }, ...pair('a', [image('same')]), ...pair('b', [image('same'), image('different')])]
  const output = compactToolContext(input)
  assert.deepEqual(output[0], input[0]); assert.deepEqual(output[2], input[2])
  assert.match(output[4].content[0].text, /tool_call_id=a/); assert.deepEqual(output[4].content[1], image('different'))
})
test('compaction, another conversation and repeated requests have no stale cache dependencies', () => {
  const input = [...pair('a', snapshot('a')), ...pair('b', snapshot('b'))]
  compactToolContext(input)
  assert.deepEqual(compactToolContext(input.slice(2)), input.slice(2))
  assert.deepEqual(compactToolContext(pair('fresh', [image('same')])), pair('fresh', [image('same')]))
  assert.deepEqual(compactToolContext(input), compactToolContext(input))
})
test('errors, commands, different read arguments and changed results are not suppressed', () => {
  const text = 'file data '.repeat(200), error = 'Tool execution error:\n\n' + text
  const input = [...pair('a', text, 'Read'), ...pair('b', text, 'Read'), ...pair('c', text, 'Read', '{"offset":20}'), ...pair('d', error, 'Read'), ...pair('e', text, 'Bash'), ...pair('f', text, 'Bash')]
  const output = compactToolContext(input)
  assert.match(output[3].content, /tool_call_id=a/)
  for (const index of [5, 7, 9, 11]) assert.deepEqual(output[index], input[index])
  const mixed = [...pair('x', [image('same')]), ...pair('y', [{ type: 'text', text: 'Tool execution error:' }, image('same')])]
  assert.deepEqual(compactToolContext(mixed)[3], mixed[3])
})

test('browser tables are referenced within one page only; remote image URLs are never assumed immutable', () => {
  const data = { untrustedContent: true, tabId: 't', url: 'file:///one', tables: [['cell '.repeat(200)]], controls: [] }
  const input = [...pair('a', JSON.stringify(data)), ...pair('b', JSON.stringify(data)), ...pair('c', JSON.stringify({ ...data, url: 'file:///two' }))]
  const output = compactToolContext(input)
  assert.match(JSON.parse(output[3].content).contextReferences.tables, /tool_call_id=a.tables/)
  assert.deepEqual(JSON.parse(output[5].content).tables, data.tables)
  const remote = { type: 'image_url', image_url: { url: 'https://example.test/live.png' } }
  const images = [...pair('x', [remote]), ...pair('y', [remote])]
  assert.deepEqual(compactToolContext(images), images)
})
