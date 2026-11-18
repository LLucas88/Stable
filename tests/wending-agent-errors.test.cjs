const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events')
function run({stdout='',stderr='',code=1,exitSignal,abort=false}) {
  const controller=new AbortController(),mod={exports:{}}
  const spawn=()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{}
    process.nextTick(()=>{for(const [stream,text] of [[child.stdout,stdout],[child.stderr,stderr]]){const bytes=Buffer.from(text);stream.emit('data',bytes.subarray(0,2));stream.emit('data',bytes.subarray(2))}if(abort)controller.abort();child.emit('close',code,exitSignal)});return child}
  const req=n=>n==='node:child_process'?{spawn}:n==='node:fs'?{existsSync:()=>true}:require(n)
  vm.runInNewContext(fs.readFileSync(require.resolve('../desktop/services/wending-agent-tool.cjs'),'utf8'),{require:req,module:mod,exports:mod.exports,Buffer,setTimeout,clearTimeout})
  return mod.exports.runWending({trustedCli:{root:'fixture',environment:{}},args:['query'],cwd:'.',signal:controller.signal})
}
test('stdout, stderr and mixed failures retain diagnostics and UTF8',async()=>{
  await assert.rejects(run({stdout:'查询失败：服务拒绝连接'}),/stdout:\n查询失败：服务拒绝连接/)
  await assert.rejects(run({stderr:'鉴权失败'}),/stderr:\n鉴权失败/)
  await assert.rejects(run({stdout:'业务错误',stderr:'warning'}),e=>e.message.includes('业务错误')&&e.message.includes('warning'))
  await assert.rejects(run({}),/进程未返回错误详情/)
  await assert.rejects(run({code:null,exitSignal:'SIGTERM'}),/SIGTERM/)
})
test('bounded errors preserve trailing reasons; success and cancellation retain semantics',async()=>{
  await assert.rejects(run({stdout:'x'.repeat(10000)+'STDOUT_CAUSE',stderr:'y'.repeat(10000)+'STDERR_CAUSE'}),e=>e.message.length<4200&&e.message.includes('STDOUT_CAUSE')&&e.message.includes('STDERR_CAUSE'))
  assert.equal((await run({code:0,stdout:'ok',stderr:'warning'})).output,'ok')
  await assert.rejects(run({abort:true,stdout:'partial'}),/已停止或超时/)
})
