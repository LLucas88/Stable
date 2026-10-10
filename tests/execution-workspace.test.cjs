const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { executionWorkspace } = require('../desktop/services/execution-workspace.cjs')
test('project execution directory exists before attachment import', { skip: process.platform !== 'win32' }, () => {
  const vm = require('node:vm'), root = fs.mkdtempSync(path.join(os.tmpdir(),'stable-volume-attachments-'))
  try {
    const source = fs.readFileSync(path.resolve(__dirname,'../desktop/main.cjs'),'utf8')
    const code = source.slice(source.indexOf('function conversationPaths('),source.indexOf('function agentState('))
    const context = {cwd:path.parse(root).root,writableRoots:[path.parse(root).root]}
    const resolve = vm.runInNewContext(code+';conversationPaths',{store:{resolveRunContext:()=>context,conversationContext:()=>context},paths:{workspace:path.join(root,'workspace')},mkdirSync:fs.mkdirSync,require:()=>({executionWorkspace})})
    const preview = resolve('task',false); assert.equal(fs.existsSync(preview.workspace),false)
    const active = resolve('task',true); assert.ok(fs.statSync(active.workspace).isDirectory())
    const { materializeAttachment } = require('../desktop/services/attachments.cjs')
    const file=path.join(root,'source.html');fs.writeFileSync(file,'<h1>Keep</h1>')
    const attachment=materializeAttachment(file,path.join(active.workspace,'.stable','attachments'),active.workspace)
    assert.equal(fs.readFileSync(attachment.path,'utf8'),'<h1>Keep</h1>')
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})
