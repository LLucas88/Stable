const {app,BrowserWindow,session}=require('electron'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'../..');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'stable-ops-ui-')));app.disableHardwareAcceleration();let win
async function main(){
await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}))
win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{offscreen:true,sandbox:true}})
const js=(await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {SkillMarket} from './src/SkillMarket';\nlet items=[\n{id:'research',name:'用户访谈研究',kind:'skill',group:'数据分析与用户洞察',description:'研究方法',content:'研究原文',version:'2026',installed:true,enabled:true,bundled:true},\n{id:'campaign',name:'会员活动策划',kind:'skill',group:'会员增长与客户经营',description:'复购方法',content:'活动原文',version:'2026',installed:true,enabled:true,bundled:true},\n{id:'lark',name:'飞书聊天',kind:'skill',group:'办公协作与知识管理',description:'飞书',content:'飞书原文',version:'2026',installed:true,enabled:false,bundled:true,activationBlocked:true,compatibilityReason:'按用户要求飞书暂不启用'}\n];window.stable={market:{list:async()=>items,toggle:async(id,enabled)=>items=items.map(i=>i.id===id?{...i,enabled}:i),use:async()=>({})}};\ncreateRoot(document.getElementById('root')).render(<SkillMarket onUse={()=>{}} renderContent={c=><pre>{c}</pre>}/>);\n",resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
await win.loadURL('data:text/html,<div id="root"></div>');for(const file of ['tokens.css','app.css'])await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles',file),'utf8'));await win.webContents.executeJavaScript(js)
await win.webContents.executeJavaScript(`(async()=>{
const tick=()=>new Promise(r=>setTimeout(r,100)),expect=(v,m)=>{if(!v)throw Error(m)};
await tick();const market=document.querySelector('.skill-market'),bar=document.querySelector('.market-groups-bar'),nav=document.querySelector('.market-groups'),toggle=document.querySelector('.market-groups-toggle');
market.style.width='480px';await tick();
expect(toggle.getAttribute('aria-expanded')==='false','Groups must start collapsed');
expect(document.querySelectorAll('.skill-market-top [role="tab"] svg').length===3,'Tab icons missing');
const rowHeight=nav.firstElementChild.getBoundingClientRect().height;
expect(nav.getBoundingClientRect().height<=rowHeight+1,'Collapsed groups occupy multiple rows');
expect(nav.scrollWidth>nav.clientWidth,'Fixture must exercise overflow');
const firstToggle=toggle.getBoundingClientRect();expect(firstToggle.left>=nav.getBoundingClientRect().right,'Toggle must stay at right of first row');
toggle.click();await tick();expect(nav.getBoundingClientRect().height>rowHeight+5,'Expanded groups did not wrap');
expect(Math.abs(toggle.getBoundingClientRect().top-firstToggle.top)<1,'Toggle moved off first row');
nav.lastElementChild.click();await tick();toggle.click();await tick();
const active=nav.querySelector('[aria-current="page"]').getBoundingClientRect(),viewport=nav.getBoundingClientRect();
expect(active.left>=viewport.left-1&&active.right<=viewport.right+1,'Selected group hidden after collapse');
expect(document.querySelectorAll('.market-row').length===1,'Collapse changed selected filter');
nav.firstElementChild.click();toggle.click();await tick();market.style.width='';
})()`)
await win.webContents.executeJavaScript("(async()=>{\nconst tick=()=>new Promise(r=>setTimeout(r,90)),expect=(v,m)=>{if(!v)throw Error(m)},button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t);\nawait tick();expect(document.querySelectorAll('.market-row').length===3,'Imported catalog missing');expect(document.querySelector('[role=\"status\"]').textContent.includes('启用 2'),'Enabled count missing');expect(document.querySelector('[role=\"status\"]').textContent.includes('仅手动调用，不会自动匹配'),'Manual-only policy missing');\nbutton('会员增长与客户经营').click();await tick();expect(document.querySelectorAll('.market-row').length===1,'Category filter failed');expect(document.querySelector('.market-row-copy').textContent.includes('会员活动'),'Wrong category');\nbutton('办公协作与知识管理').click();await tick();expect(document.querySelector('.market-row-action').disabled,'Feishu activation must be disabled');\ndocument.querySelector('.market-row-copy').click();await tick();expect(document.querySelector('.market-enable input').disabled,'Detail activation bypass');expect(document.querySelector('dialog').textContent.includes('按用户要求飞书暂不启用'),'Missing reason');\ndocument.querySelector('.market-dialog-close').click();button('全部').click();await tick();expect(document.querySelectorAll('.market-row').length===3,'Reset filter failed');\nbutton('cli&mcp连接器').click();await tick();button('Skill技能').click();await tick();expect(document.querySelectorAll('.market-row').length===3,'Tab reset failed');\n})()")
console.log('OPS_SKILL_UI_PASSED');win.destroy();app.exit(0)
}
main().catch(e=>{console.error(e.stack);win?.destroy();app.exit(1)})
