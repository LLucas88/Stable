'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { spawn } = require('node:child_process')
const { resolveWorkspaceEntry } = require('../desktop/services/preview.cjs')
const root = path.resolve(__dirname, '..')

// Execute the actual IPC callback with an inert OS shell: never open Explorer.
function handler(shell, workspace, platform = 'win32') {
  const source = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8')
  const start = source.indexOf("  ipcMain.handle('stable:system:showItemInFolder'")
  const end = source.indexOf("  ipcMain.handle('stable:system:openExternalHtml'", start)
  assert.ok(start >= 0 && end > start)
  let callback
  vm.runInNewContext(source.slice(start, end), {
    ipcMain: { handle: (name, fn) => { assert.equal(name, 'stable:system:showItemInFolder'); callback = fn } },
    requireText: value => value.trim(), resolveWorkspaceEntry, paths: { workspace }, conversationPaths:()=>({workspace}), store:{activeConversationId:()=> 'test'}, path, shell, process: { platform },
  })
  return value => callback(null, { path: value })
}

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-file-location-'))
  const workspace = path.join(temporary, 'workspace')
  const directory = path.join(workspace, '中文 报告 (一), 100%')
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, '虾姐蟹妹_CRM营销效果_近30天_20260806-20260904.xlsx')
  fs.writeFileSync(file, 'fixture')
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  return { temporary, workspace, directory, file }
}

test('Windows file location selects the canonical file, preserving Unicode and special characters', async t => {
  const { workspace, directory, file } = fixture(t)
  const calls = []
  const open = handler({ openPath: async value => { calls.push(['directory',value]); return '' }, showItemInFolder: value => calls.push(['file',value]) }, workspace)
  assert.equal(await open(file), true)
  assert.equal(await open(file.replaceAll('\\', '/')), true)
  assert.equal(await open(directory), true)
  assert.deepEqual(calls, [['file',file], ['file',file], ['directory',directory]])
})

test('missing and outside-workspace files never reach Explorer', async t => {
  const { workspace, temporary } = fixture(t)
  const open = handler({ openPath: () => assert.fail('Invalid file reached the OS shell') }, workspace)
  await assert.rejects(open(path.join(workspace, 'missing.xlsx')), /文件不存在/)
  const outside = path.join(temporary, 'outside.xlsx')
  fs.writeFileSync(outside, 'fixture')
  await assert.rejects(open(outside), /工作区内真实存在/)
})

test('Windows folder opening waits for completion and propagates shell errors', async t => {
  const { workspace, directory } = fixture(t)
  let complete
  const open = handler({ openPath: () => new Promise(resolve => { complete = resolve }) }, workspace)
  let settled = false
  const pending = open(directory).finally(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  complete('fixture access denied')
  await assert.rejects(pending, /无法打开文件所在文件夹：fixture access denied/)
})

test('non-Windows platforms retain native file selection', async t => {
  const { workspace, file } = fixture(t)
  const calls = []
  const open = handler({ showItemInFolder: value => calls.push(value), openPath: () => assert.fail('Unexpected directory open') }, workspace, 'darwin')
  assert.equal(await open(file), true)
  assert.deepEqual(calls, [file])
})

test('delivery card sends the exact Windows path and visibly handles failure and retry', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/file-location-ui.cjs')], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('File location UI timeout')) }, 15000)
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }) })
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /FILE_LOCATION_UI_PASSED/)
})

test('file preview resolves an additional registered project root without accepting adjacent folders',t=>{
 const {workspace,temporary}=fixture(t),second=path.join(temporary,'project-source'),outside=path.join(temporary,'adjacent');fs.mkdirSync(second);fs.mkdirSync(outside)
 const file=path.join(second,'交付.xlsx');fs.writeFileSync(file,'fixture');const other=path.join(outside,'private.xlsx');fs.writeFileSync(other,'fixture')
 assert.equal(resolveWorkspaceEntry(file,[workspace,second]).path,file);assert.throws(()=>resolveWorkspaceEntry(other,[workspace,second]),/工作区内真实存在/)
})


test('local preview request guard allows a project source image and rejects files outside project roots',t=>{
 const {workspace,temporary}=fixture(t),second=path.join(temporary,'images');fs.mkdirSync(second);const image=path.join(second,'image.png');fs.writeFileSync(image,'fixture')
 const outside=path.join(temporary,'outside.png');fs.writeFileSync(outside,'fixture')
 const source=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8'),start=source.indexOf('function isAllowedWorkspacePreviewFile('),end=source.indexOf('function isAllowedLocalPreviewRequest(',start)
 const context={URL,fileURLToPath:require('node:url').fileURLToPath,previewTemporaryPath:null,existsSync:fs.existsSync,statSync:fs.statSync,resolveWorkspaceEntry,conversationPaths:()=>({workspace,writableRoots:[workspace,second]}),store:{activeConversationId:()=> 'test'}}
 vm.createContext(context);vm.runInContext(source.slice(start,end),context)
 assert(context.isAllowedWorkspacePreviewFile(require('node:url').pathToFileURL(image).href));assert(!context.isAllowedWorkspacePreviewFile(require('node:url').pathToFileURL(outside).href))
})
