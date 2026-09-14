const {app,BrowserWindow}=require('electron'),{build}=require('esbuild'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'qa-artifacts/skill-purpose');
fs.mkdirSync(out,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(out,'profile-')));app.disableHardwareAcceleration();
let win;
async function main(){
 await app.whenReady();
 win=new BrowserWindow({show:false,width:1440,height:1100,webPreferences:{offscreen:true,sandbox:true}});
 const code=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SkillMarket} from './src/SkillMarket';
 const item={id:'filtered-lenny-negotiating-compensation',name:'negotiating-compensation · lenny-negotiating-compensation',kind:'skill',group:'职业与招聘',description:'评估录用方案并准备薪酬谈判。',content:'# Original SKILL.md\\nDo not alter these instructions.\\nworkbuddy',version:'1.0',bundled:true,installed:true,enabled:true};
 window.used=[];window.stable={market:{list:async()=>[item],detail:async()=>item,use:async id=>{window.used.push(id);return {draftPrompt:'default',activeConversationId:'new',selectedSkillIds:[id]}}}};
 createRoot(document.getElementById('root')).render(<SkillMarket onUse={s=>window.delivered=s} renderContent={s=><pre data-source>{s}</pre>}/>);`,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text;
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><body><div id="root"></div></body></html>'));
 for(const file of ['tokens.css','app.css','codex-surfaces.css'])await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles',file),'utf8'));
 await win.webContents.executeJavaScript(code);
 await win.webContents.executeJavaScript(`(async()=>{
 const wait=()=>new Promise(r=>setTimeout(r,100)),check=(v,m)=>{if(!v)throw Error(m)};await wait();
 check(document.querySelector('.market-row strong').textContent==='薪酬谈判与录用方案评估','Purpose title missing');
 const input=document.querySelector('.market-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'negotiating-compensation');input.dispatchEvent(new Event('input',{bubbles:true}));await wait();check(document.querySelectorAll('.market-row').length===1,'Original name search failed');
 document.querySelector('.market-row-copy').click();await wait();
 check(document.querySelectorAll('.skill-conversation-prompts article').length===3,'Expected three prompts');
 check(window.used.length===0,'Opening detail triggered use');
 check(document.querySelector('[data-source]').textContent.includes('workbuddy'),'Original markdown changed');
 check(Boolean(document.querySelector('.skill-conversation-prompts').compareDocumentPosition(document.querySelector('[data-source]')) & Node.DOCUMENT_POSITION_FOLLOWING),'Markdown must follow prompts');
 document.querySelectorAll('.skill-conversation-prompts button')[1].click();await wait();
 check(window.used.length===1&&window.used[0]==='filtered-lenny-negotiating-compensation','Wrong skill selected');
 check(window.delivered.draftPrompt.includes('检查我提供的【现有材料或方案】'),'Selected prompt not passed');
 check(window.delivered.activeConversationId==='new','Conversation lost');
 })()`);
 fs.writeFileSync(path.join(out,'detail.png'),(await win.webContents.capturePage()).toPNG());
 console.log('SKILL_PURPOSE_UI_PASSED');win.destroy();app.exit(0);
}
main().catch(e=>{console.error(e);win?.destroy();app.exit(1)});
