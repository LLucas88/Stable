const {app,BrowserWindow,session}=require('electron'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'../..'),output=path.join(root,'qa-artifacts/skill-market-refresh')
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'stable-ops-ui-')));app.disableHardwareAcceleration();let win
async function main(){
await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}))
win=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{offscreen:true,sandbox:true}})
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {SkillMarket} from './src/SkillMarket';
let items=[
{id:'research',name:'用户访谈研究 · WorkBuddy',kind:'skill',group:'数据分析与用户洞察',description:'Work Buddy 研究方法',content:'来源：WorkBuddy\\n研究原文，由 work Buddy 提供',version:'2026',installed:true,enabled:true,bundled:true},
{id:'campaign',name:'会员活动策划 · 豆包工作',kind:'skill',group:'会员增长与客户经营',description:'复购方法',content:'豆包工作活动原文',version:'2026',installed:true,enabled:true,bundled:true},
{id:'audio',name:'音频生成 · TRAE Work',kind:'skill',group:'内容运营',description:'音频',content:'TRAE Work 音频原文',version:'2026',installed:true,enabled:false,bundled:true,activationBlocked:true,compatibilityReason:'需要豆包音频生成工具'},
{id:'expert',name:'内容创作专家',kind:'expert',group:'内容运营',description:'多平台内容',content:'WorkBuddy · 原始专家定义\\n豆包工作内容策略',source:'WorkBuddy',version:'2026',installed:true,enabled:true,bundled:true}
];window.originalItems=items;window.stable={market:{list:async()=>items,toggle:async(id,enabled)=>items=items.map(i=>i.id===id?{...i,enabled}:i),use:async()=>({})}};
createRoot(document.getElementById('root')).render(<SkillMarket onUse={()=>{}} renderContent={c=><pre>{c}</pre>}/>);`
const js=(await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
await win.loadURL('data:text/html,<html data-theme="light"><body><div id="root"></div></body></html>')
for(const name of ['tokens.css','app.css','codex-surfaces.css'])await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles',name),'utf8'))
await win.webContents.executeJavaScript(js)
await win.webContents.executeJavaScript(`(async()=>{
const tick=()=>new Promise(r=>setTimeout(r,100)),expect=(v,m)=>{if(!v)throw Error(m)},button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t);
const clean=()=>expect(!/work[\\s_-]*buddy|trae[\\s_-]*work|豆包|doubao/i.test(document.body.innerText),'Platform branding visible');
await tick();expect(document.querySelectorAll('.market-row').length===3,'Imported catalog missing');clean();expect(document.querySelector('[role="status"]').textContent.includes('启用 2'),'Enabled count missing');expect(!document.body.innerText.includes('飞书'),'Obsolete Feishu notice');
expect(new Set([...document.querySelectorAll('.market-row .market-avatar')].map(e=>e.dataset.tone)).size===3,'Icons must vary by function');
button('会员增长与客户经营').click();await tick();expect(document.querySelectorAll('.market-row').length===1,'Category filter failed');
document.querySelector('.market-row-copy').click();await tick();clean();expect(document.querySelector('dialog').textContent.includes('原平台活动原文'),'Body presentation missing');
document.querySelector('.market-dialog-close').click();button('全部').click();await tick();
button('Agent专家').click();await tick();document.querySelector('.market-row-copy').click();await tick();clean();expect(document.querySelector('dialog .market-avatar .lucide-bot'),'Expert identity icon missing');
document.querySelector('.market-dialog-close').click();button('Skill技能').click();await tick();button('内容运营').click();await tick();expect(document.querySelector('.market-row-action').disabled,'Dependency restriction changed');document.querySelector('.market-row-copy').click();await tick();clean();expect(document.querySelector('.market-enable input').disabled,'Detail activation bypass');
document.querySelector('.market-dialog-close').click();button('全部').click();await tick();expect(window.originalItems[0].content.includes('WorkBuddy'),'Display cleanup modified source');
})()`)
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'skills-light.png'),(await win.webContents.capturePage()).toPNG())
await win.webContents.executeJavaScript('document.documentElement.dataset.theme="dark"')
fs.writeFileSync(path.join(output,'skills-dark.png'),(await win.webContents.capturePage()).toPNG())
console.log('OPS_SKILL_UI_PASSED');win.destroy();app.exit(0)
}
main().catch(e=>{console.error(e.stack);win?.destroy();app.exit(1)})
