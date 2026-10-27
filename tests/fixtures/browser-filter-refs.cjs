'use strict'
const electron=require('electron'),{app}=electron,fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {BrowserSessionService}=require('../../desktop/services/browser-session.cjs')
const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'stable-filter-refs-'));app.setPath('userData',dir);app.disableHardwareAcceleration();app.on('window-all-closed',()=>{})
let service,server
async function main(){
 await app.whenReady()
 const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0}.top{height:400px}</style><div class="top"><button>Top</button></div><label>类别<select id="category" onchange="render()"><option value="all">全部</option><option value="drink">饮品</option></select></label><label>排序<select id="sort" onchange="render()"><option value="default">默认</option><option value="price-desc">价格降序</option></select></label><p id="result"></p><input type="password" aria-label="密码"><script>function render(){document.querySelector('#result').textContent=document.querySelector('#category').value==='drink'&&document.querySelector('#sort').value==='price-desc'?'咖啡 ￥24 绿茶 ￥18':'全部'}render()</script>`
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const url='http://127.0.0.1:'+server.address().port,data=new Map(),store={getSetting:k=>data.get(k),setSetting:(k,v)=>data.set(k,structuredClone(v))}
 service=new BrowserSessionService({electron,store,getWindow:()=>null})
 let snap=await service.execute('filters',{action:'open',url}),tab=service.get('filters',snap.tabId)
 const layout=await tab.view.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,categoryY:document.querySelector("#category").getBoundingClientRect().top})')
 console.log(JSON.stringify({phase:'initial',layout,controls:snap.controls.map(c=>({label:c.label,tag:c.tag}))}))
 assert.equal(layout.width,1280);assert.equal(layout.height,900)
 assert(snap.controls.some(c=>c.tag==='select'&&c.label.includes('类别')),'collapsed initial read omits category')
 const firstRef=snap.controls.find(c=>c.tag==='select'&&c.label.includes('类别')).ref
 // Read intentionally revokes the old snapshot. Do not repair stale refs by guessing selectors.
 snap=await service.execute('filters',{action:'read'})
 await assert.rejects(service.execute('filters',{action:'select',ref:firstRef,value:'drink'}),/最近一次 controls/)
 assert.equal(await tab.view.webContents.executeJavaScript('document.querySelector("#category").value'),'all','stale ref must not perform the selection')
 const beforeScroll=snap.controls.find(c=>c.tag==='select'&&c.label.includes('类别')).ref
 snap=await service.execute('filters',{action:'scroll',value:'50'})
 await assert.rejects(service.execute('filters',{action:'select',ref:beforeScroll,value:'drink'}),/最近一次 controls/)
 await assert.rejects(service.execute('filters',{action:'select',ref:'#category',value:'drink'}),/失效/)
 const category=snap.controls.find(c=>c.tag==='select'&&c.label.includes('类别')).ref
 const located=await service.execute('filters',{action:'locate',value:'类别'});assert(located.refs.includes(category),'locate must use the visible control label')
 await service.execute('filters',{action:'audit'})
 snap=await service.execute('filters',{action:'select',ref:category,value:'drink'})
 snap=await service.execute('filters',{action:'select',ref:snap.controls.find(c=>c.tag==='select'&&c.label.includes('排序')).ref,value:'price-desc'})
 assert(snap.text.includes('咖啡 ￥24 绿茶 ￥18'))
 await assert.rejects(service.execute('filters',{action:'fill',ref:snap.controls.find(c=>c.type==='password').ref,value:'forbidden'}),/敏感/)
 const stale=snap.controls.find(c=>c.tag==='select').ref
 await tab.view.webContents.executeJavaScript('document.querySelector("#category").replaceWith(document.querySelector("#category").cloneNode(true))')
 await assert.rejects(service.execute('filters',{action:'select',ref:stale,value:'all'}),/失效/)
 await service.navigate('filters',tab.id,'open',url)
 await assert.rejects(service.execute('filters',{action:'select',ref:stale,value:'all'}),/失效/)
 service.control('filters',tab.id,true);await assert.rejects(service.execute('filters',{action:'read'}),/接管/)
 assert(electron.BrowserWindow.getAllWindows().every(w=>!w.isVisible()),'test must remain hidden')
 console.log('FILTER_REFS_PASSED')
}
main().then(()=>{service?.dispose();server?.close();app.exit(0)}).catch(e=>{console.error(e.stack);service?.dispose();server?.close();app.exit(1)})
