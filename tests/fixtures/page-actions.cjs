const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {PageAnnotations,saveCurrentPage,WORLD}=require('../../desktop/services/browser-page-actions.cjs')
const {renderMarkdownDocument}=require('../../desktop/services/preview.cjs')
const {renderSpreadsheetDocument}=require('../../desktop/services/spreadsheet-preview.cjs')
const XLSX=require('xlsx')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'qa-artifacts/page-actions');fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(out,'profile-')));app.disableHardwareAcceleration()
async function main(){
 await app.whenReady();const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,offscreen:true,javascript:true}});const wc=win.webContents
 const annotations=new PageAnnotations(),exec=code=>wc.executeJavaScriptInIsolatedWorld(WORLD,[{code}]);const workspace=fs.mkdtempSync(path.join(out,'workspace-'))
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['会员等级','人数'],['金卡',120]]),'会员');const xlsx=path.join(workspace,'会员.xlsx');XLSX.writeFile(book,xlsx)
 for(const [kind,html,selector] of [['HTML','<h1>会员经营报告</h1><p>收入增长</p>','h1'],['Markdown',renderMarkdownDocument('# 会员经营报告\n\n数据说明','报告.md','light'),'h1'],['Excel',renderSpreadsheetDocument(xlsx,'light'),'td']]){
   const file=path.join(workspace,kind+'.html');fs.writeFileSync(file,html);const before=fs.readFileSync(file);await wc.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
   await exec(`const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){const r=original.call(this,o);globalThis.fixtureRoot=r;return r};true`)
   const {sessionId}=await annotations.start('a',wc,file)
   await exec(`document.querySelector(${JSON.stringify(selector)}).click();fixtureRoot.querySelector('textarea').value='请突出会员留存结论';true`)
   await exec(`fixtureRoot.querySelector('.settings').click();const color=fixtureRoot.querySelector('[data-property=color]');color.value='rgb(255, 0, 0)';color.dispatchEvent(new Event('input'));true`);assert.equal(await exec(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).color`),'rgb(255, 0, 0)');
   if(kind==='HTML')fs.writeFileSync(path.join(out,'annotation-popup.png'),(await wc.capturePage()).toPNG())
   await exec(`fixtureRoot.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`)
   assert.deepEqual(await annotations.poll('other',sessionId,workspace),{ended:true})
   const result=await annotations.poll('a',sessionId,workspace);assert(result.attachment.annotation.text);assert.equal(result.attachment.annotation.comment,'请突出会员留存结论');assert(fs.readFileSync(result.attachment.path,'utf8').includes('请突出会员留存结论'));assert(fs.readFileSync(result.attachment.path,'utf8').includes(file));assert(result.attachment.annotation.thumbnail.startsWith('data:image/png'));assert(before.equals(fs.readFileSync(file)));assert.equal(result.ended,false);assert(fs.readFileSync(result.attachment.path,'utf8').includes('rgb(255, 0, 0)'));await exec(`document.querySelector(${JSON.stringify(selector)}).click();fixtureRoot.querySelector('textarea').value='第二条批注';fixtureRoot.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`);const second=await annotations.poll('a',sessionId,workspace);assert.equal(second.attachment.annotation.comment,'第二条批注');assert.equal(await exec(`fixtureRoot.querySelectorAll('.saved').length`),2);assert.equal(await annotations.poll('a',sessionId,workspace),null);await annotations.stop('a',sessionId);assert.notEqual(await exec(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).color`),'rgb(255, 0, 0)')
 }
 const data=new Map();const downloads={items:[],store:{getSetting:k=>data.get(k)},persist(){}};const source=path.join(workspace,'原稿.html');fs.writeFileSync(source,'<h1>原稿</h1>');const dest=path.join(workspace,'保存副本.html')
 const electron={app:{getPath:()=>workspace},dialog:{showSaveDialog:async()=>({filePath:dest,canceled:false})}}
 const saved=await saveCurrentPage({electron,window:win,downloads,conversationId:'a',sourcePath:source});assert.equal(saved.path,dest);assert(fs.readFileSync(source).equals(fs.readFileSync(dest)));assert.equal(downloads.items[0].state,'completed')
 electron.dialog.showSaveDialog=async()=>({canceled:true});assert((await saveCurrentPage({electron,window:win,downloads,conversationId:'a',sourcePath:source})).cancelled);assert.equal(downloads.items.length,1)
 win.destroy();console.log('PAGE_ACTIONS_PASSED');app.exit(0)
}
main().catch(e=>{console.error(e.stack);app.exit(1)})
