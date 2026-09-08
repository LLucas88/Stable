const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), { build } = require('esbuild')
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'qa-artifacts/browser-panel')
fs.mkdirSync(out, { recursive: true }); app.setPath('userData', fs.mkdtempSync(path.join(out, 'profile-'))); app.disableHardwareAcceleration()
async function main() {
  await app.whenReady()
  const win = new BrowserWindow({ show:false, width:1440, height:900, webPreferences:{sandbox:true,offscreen:true} })
  const bundle = (await build({stdin:{contents:`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BrowserPanel}from'./src/BrowserPanel';
    window.crypto.randomUUID ||=()=> 'test-'+Math.random().toString(16).slice(2);window.calls=[];window.openedFiles=[];window.shown='';let listener=()=>{},previewListener=()=>{},counter=0;
    const sessions={};const session=id=>sessions[id]||=( {tabs:[],downloads:[]} );
    window.stable={preview:{close:async()=>{window.shown='';window.rejectPreview?.(Error('Preview closed'));window.rejectPreview=undefined;return true},openFile:async(path,bounds)=>{window.openedFiles.push({path,bounds});window.shown=path;if(window.holdPreview)await new Promise((resolve,reject)=>{window.rejectPreview=reject});return{url:path,title:path,loading:false,canGoBack:false,canGoForward:false}},setBounds:async bounds=>{window.latestBounds=bounds;return true},navigate:async()=>true,onEvent:fn=>{previewListener=fn;return()=>{previewListener=()=>{}}}},browser:{onChanged:fn=>{listener=fn;return()=>{listener=()=>{}}},command:async p=>{
      window.calls.push(p);const s=session(p.conversationId);
      if(p.action==='saveCurrent')return{path:'D:/Downloads/report.html'};
      if(p.action==='annotationStart')return{sessionId:'annotation-test'};
      if(p.action==='annotationPoll'){if(window.notePolled)return null;window.notePolled=true;return{ended:false,attachment:{name:'页面注释',path:'D:/mock/note.md',type:'md'}};}
      if(p.action==='create'){const tab={id:'web'+(++counter),title:p.url?'会员经营分析':'新标签页',url:p.url||'about:blank',state:'idle',diagnostics:false};s.tabs.push(tab);s.activeTabId=tab.id;}
      if(p.action==='close'){s.tabs=s.tabs.filter(t=>t.id!==p.tabId);s.activeTabId=s.tabs.at(-1)?.id;}
      if(p.action==='show'){window.shown=p.tabId;s.activeTabId=p.tabId;}
      if(p.action==='hide')window.shown='';
      if(p.action==='navigate'){s.tabs.find(t=>t.id===p.tabId).url=p.url||'https://example.com/back';}
      return structuredClone(s);
    }}};
    function Test(){const [id,setId]=useState('a'),[open,setOpen]=useState(true),[target,setTarget]=useState(),[obscured,setObscured]=useState(false);window.setConversation=value=>{setTarget(undefined);setId(value)};window.openTarget=setTarget;window.reopen=()=>setOpen(true);window.obscure=setObscured;
      return <div className="conversation-workspace" style={{height:'100vh'}}><div className="conversation" style={{padding:32}}><h2>会员经营分析</h2><p>已完成。点击文件可在右侧查看报告。</p></div>{open&&<BrowserPanel key={id} conversationId={id} initialTarget={target} obscured={obscured} onClose={()=>setOpen(false)} onImport={item=>window.imported=item}/>}</div>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife'})).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html data-theme="light"><body style="margin:0"><div id="root"></div></body></html>'))
  for(const file of ['tokens.css','app.css','codex-surfaces.css'])await win.webContents.insertCSS(fs.readFileSync(path.join(root,'src/styles',file),'utf8'))
  await win.webContents.executeJavaScript(bundle)
  await win.webContents.executeJavaScript(`(async()=>{
    const tick=()=>new Promise(r=>setTimeout(r,100));const expect=(v,m)=>{if(!v)throw Error(m)};
    const click=label=>{const el=document.querySelector('[aria-label="'+label+'"]');expect(el,'Missing '+label);el.click()};
    const tabs=()=>document.querySelectorAll('[role=tab]');
    await tick();expect(document.querySelector('.browser-empty'),'Empty state missing');
    click('新标签页');await tick();expect(tabs().length===1,'New tab failed');
    const input=document.querySelector('[aria-label="网页地址"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'example.com');input.dispatchEvent(new Event('input',{bubbles:true}));await tick();document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();expect(window.shown==='web1','Blank tab did not become visible web page');
    window.openTarget({kind:'file',value:'D:/mock/report.md',title:'经营报告.md',requestId:1});await tick();await tick();
    expect(tabs().length===2,'Document replaced web tab');expect(window.shown==='D:/mock/report.md','Document not displayed');
    window.openTarget({kind:'file',value:'D:/mock/report.md',title:'经营报告.md',requestId:2});await tick();expect(tabs().length===2,'Duplicate document tab');
    window.openTarget({kind:'file',value:'D:/mock/data.xlsx',title:'会员数据.xlsx',requestId:3});await tick();await tick();expect(tabs().length===3,'Excel tab missing');
    tabs()[0].click();await tick();await tick();expect(window.shown==='web1','Switching back to web failed');
    tabs()[1].click();await tick();await tick();expect(window.shown==='D:/mock/report.md','Returning to document failed');
    window.obscure(true);await tick();await tick();expect(window.shown==='','Native view covers dialog');window.obscure(false);await tick();await tick();expect(window.shown==='D:/mock/report.md','Document did not return after dialog');
    window.setConversation('b');await tick();await tick();expect(tabs().length===0,'Tabs leaked across conversations');click('新标签页');await tick();
    window.setConversation('a');await tick();await tick();expect(tabs().length===3,'Conversation lost tabs');expect(window.shown==='D:/mock/report.md','Conversation lost active document');
    click('收起浏览器');await tick();await tick();expect(!document.querySelector('.shared-browser')&&window.shown==='','Collapse failed');window.reopen();await tick();await tick();expect(tabs().length===3,'Collapse discarded tabs');
    const pane=document.querySelector('.shared-browser'),width=pane.getBoundingClientRect().width;
    document.querySelector('[role=separator]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await tick();expect(pane.getBoundingClientRect().width>width,'Keyboard resize failed');
    click('展开浏览器');for(let n=0;n<15&&pane.getBoundingClientRect().width<innerWidth-1;n++)await tick();expect(pane.getBoundingClientRect().width>=innerWidth-1,'Expand failed: '+JSON.stringify({width:pane.getBoundingClientRect().width,screen:innerWidth,expanded:pane.dataset.expanded,parent:pane.parentElement.getBoundingClientRect().width,flex:getComputedStyle(pane).flex,transition:getComputedStyle(pane).transition,other:getComputedStyle(pane.previousElementSibling).display,html:pane.outerHTML.slice(0,220)}));click('恢复分栏');await tick();
    click('关闭标签页 经营报告.md');await tick();await tick();expect(tabs().length===2,'Close did not remove only target');expect(window.shown==='D:/mock/data.xlsx','Closing active tab did not show neighbor');
    click('下载记录');await tick();await tick();expect(window.shown==='','Records covered by native page');click('下载记录');await tick();await tick();
    window.holdPreview=true;window.openTarget({kind:'file',value:'D:/mock/slow.html',title:'慢速页面.html',requestId:4});await tick();
    expect(window.shown==='D:/mock/slow.html','Slow preview did not start');window.obscure(true);await tick();await tick();expect(window.shown==='','In-flight preview blocked immediate hiding');window.holdPreview=false;window.obscure(false);await tick();await tick();expect(window.shown==='D:/mock/slow.html','Preview did not recover');
    const viewport=document.querySelector('.browser-viewport');viewport.style.transform='translateX(23px)';await tick();await tick();expect(Math.abs(window.latestBounds.x-viewport.getBoundingClientRect().x)<1,'Position-only layout change left native view behind');viewport.style.transform='';await tick();
    click('保存当前文件');await tick();expect(window.calls.some(c=>c.action==='saveCurrent'&&c.filePath==='D:/mock/slow.html'),'Save button did not save file');expect(document.body.textContent.includes('已保存到'),'Missing save feedback');
    click('添加注释');await tick();await tick();expect(!window.imported,'Annotation sent before draft confirmation');document.querySelector('.annotation-add-draft').click();await tick();expect(window.imported?.path==='D:/mock/note.md','Annotation not attached to composer');expect(document.body.textContent.includes('注释已加入输入框草稿'),'Missing annotation feedback');
    expect(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
  })()`)
  fs.writeFileSync(path.join(out,'panel.png'),(await win.webContents.capturePage()).toPNG())
  win.setSize(640,800);await new Promise(r=>setTimeout(r,200))
  await win.webContents.executeJavaScript(`if(document.documentElement.scrollWidth>innerWidth)throw Error('Narrow layout overflow');true`)
  win.destroy();console.log('BROWSER_PANEL_UI_PASSED');app.exit(0)
}
main().catch(error=>{console.error(error.stack);app.exit(1)})

