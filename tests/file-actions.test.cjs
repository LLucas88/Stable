'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createFileActions,registerFileActions,windowsFileAction}=require('../desktop/services/file-actions.cjs')
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-file-actions-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
 const file=path.join(root,'中文 % & 报告.html');fs.writeFileSync(file,'<h1>你好</h1>')
 const calls=[],options={roots:()=>[root],clipboard:{writeText:value=>calls.push(['text',value])},shell:{showItemInFolder:value=>calls.push(['reveal',value])},dialog:{showSaveDialog:async()=>({canceled:true})},platform:'win32',windows:async(...args)=>calls.push(args)}
 return {root,file,calls,options,act:createFileActions(options)}
}
test('file menu copies exact canonical paths/content and dispatches native actions',async t=>{
 const {file,calls,act}=fixture(t)
 for(const action of ['copyPath','copyContent','reveal','browser','openWith'])assert.equal(await act(action,file),true)
 assert.deepEqual(calls,[['text',fs.realpathSync(file)],['text','<h1>你好</h1>'],['reveal',fs.realpathSync(file)],['browser',fs.realpathSync(file)],['openWith',fs.realpathSync(file)]])
})
test('save as cancellation, copy and self overwrite protection',async t=>{
 const {root,file,options,act}=fixture(t);assert.equal(await act('saveAs',file),false)
 const output=path.join(root,'copy.html');options.dialog.showSaveDialog=async()=>({filePath:output})
 assert.equal(await act('saveAs',file),true);assert.equal(fs.readFileSync(output,'utf8'),fs.readFileSync(file,'utf8'))
 options.dialog.showSaveDialog=async()=>({filePath:file});await assert.rejects(act('saveAs',file),/原文件/)
 const link=path.join(root,'hardlink.html');fs.linkSync(file,link);options.dialog.showSaveDialog=async()=>({filePath:link});await assert.rejects(act('saveAs',file),/原文件/)
})
test('untrusted IPC, out of scope/missing paths and unsafe content are rejected',async t=>{
 const {root,file,options,act}=fixture(t)
 await assert.rejects(act('unknown',file),/未知/)
 await assert.rejects(act('copyPath',__filename));await assert.rejects(act('copyPath',path.join(root,'missing')))
 for(const [name,content] of [['file.xlsx','binary'],['binary.txt',Buffer.from([0,1])],['bad.txt',Buffer.from([255])],['huge.txt',Buffer.alloc(2_000_001)]]){const p=path.join(root,name);fs.writeFileSync(p,content);await assert.rejects(act('copyContent',p))}
 const binary=path.join(root,'file.xlsx');await assert.rejects(act('browser',binary),/格式/)
 const utf16=path.join(root,'utf16.txt');fs.writeFileSync(utf16,Buffer.concat([Buffer.from([255,254]),Buffer.from('你好','utf16le')]));await act('copyContent',utf16)
 let handler;registerFileActions({...options,ipcMain:{handle:(_,fn)=>handler=fn},trusted:()=>false});assert.throws(()=>handler({}, {path:file,action:'copyContent'}),/无权/)
})
test('Windows command does not interpolate user file path into executable code',async()=>{
 let call;const file=String.raw`C:\报告 & $(calc)\你好 100%.html`
 await windowsFileAction('browser',file,async(...args)=>{call=args})
 assert(!call[1].join(' ').includes(file));assert.equal(call[2].windowsHide,true)
 assert.match(call[2].env.STABLE_FILE_TARGET,/^file:\/\//);assert(!call[2].env.STABLE_FILE_TARGET.includes(' '))
 assert.match(Buffer.from(call[1].at(-1),'base64').toString('utf16le'),/SHOpenWithDialog/)
})
test('native action failures remain visible rather than falling back to file associations',async t=>{
 const {file,options}=fixture(t)
 const act=createFileActions({...options,windows:async()=>{throw Error('fixture launch failure')}})
 await assert.rejects(act('browser',file),/无法启动默认浏览器/)
 await assert.rejects(act('openWith',file),/无法打开.*选择其他应用/)
 await assert.rejects(act('reveal',file),/无法在资源管理器中定位文件/)
})

test('Windows reveal waits for native completion and bypasses the silent Electron API',async t=>{
 const {file,options}=fixture(t);let finish,settled=false
 const act=createFileActions({...options,shell:{showItemInFolder:()=>assert.fail('Silent API used')},windows:(action,value)=>{
  assert.equal(action,'reveal');assert.equal(value,fs.realpathSync(file));return new Promise(resolve=>{finish=resolve})
 }})
 const pending=act('reveal',file).then(result=>{settled=true;return result})
 await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false)
 finish();assert.equal(await pending,true)
 let call;await windowsFileAction('reveal',file,async(...args)=>{call=args;return {stdout:'FILE_REVEAL_VISIBLE_AND_SELECTED\r\n'}})
 assert.equal(call[2].timeout,20000);assert.equal(call[2].env.STABLE_FILE_TARGET,file)
 assert(!call[1].join(' ').includes(file));assert.equal(call[2].windowsHide,true)
})

test('successful native process exit without verified Explorer visibility is not reported as success',async()=>{
 await assert.rejects(windowsFileAction('reveal',__filename,async()=>({stdout:''})),/did not confirm/)
 await assert.rejects(windowsFileAction('reveal',__filename,async()=>({stdout:'FILE_ITEM_RESOLVED\r\n'})),/did not confirm/)
 await assert.rejects(windowsFileAction('reveal',__filename,async()=>{throw Error('foreground blocked')}),/foreground blocked/)
})

test('overlapping reveal requests share one launch; different files and later clicks remain usable',async t=>{
 const {root,file,options}=fixture(t),other=path.join(root,'other.txt');fs.writeFileSync(other,'fixture')
 const launches=[]
 const act=createFileActions({...options,windows:(action,target)=>new Promise((resolve,reject)=>launches.push({target,resolve,reject}))})
 const a=act('reveal',file),b=act('reveal',file),c=act('reveal',other)
 await new Promise(resolve=>setImmediate(resolve));assert.equal(launches.length,2)
 launches[0].resolve();launches[1].resolve();assert.deepEqual(await Promise.all([a,b,c]),[true,true,true])
 const retry=act('reveal',file);await new Promise(resolve=>setImmediate(resolve));assert.equal(launches.length,3)
 launches[2].reject(Error('fixture shell failure'));await assert.rejects(retry,/无法在资源管理器中定位/)
 const afterFailure=act('reveal',file);await new Promise(resolve=>setImmediate(resolve));assert.equal(launches.length,4)
 launches[3].resolve();assert.equal(await afterFailure,true)
})

test('non-Windows reveal still uses the native shell',async t=>{
 const {file,options,calls}=fixture(t)
 await createFileActions({...options,platform:'darwin',windows:()=>assert.fail('Windows helper used')})('reveal',file)
 assert.deepEqual(calls,[['reveal',fs.realpathSync(file)]])
})
