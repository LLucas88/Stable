'use strict'
const prepareVisualFixture = require('../helpers/visual-fixture.cjs')
const { readSource } = require('./../helpers/read-source.cjs')
// Isolated, hidden component test. No live client, network, or Explorer access.
const { app, BrowserWindow, session } = require('electron')
const { buildSync } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = path.resolve(__dirname, '../..')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-file-location-ui-'))
app.setPath('userData', temporary)
app.disableHardwareAcceleration()
let window

async function run() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  window = new BrowserWindow({ show: false, width:1280, height:800, webPreferences: { backgroundThrottling: false, offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } })
  window.webContents.on('console-message', event => console.error(event.message))
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const card = source.slice(source.indexOf('function ConversationFileCard('), source.indexOf('function useAttachmentImageSource('))
  const images = source.slice(source.indexOf('function useAttachmentImageSource('), source.indexOf('function ImageLightbox('))
  const isImage = source.slice(source.indexOf('function attachmentIsImage('), source.indexOf('\n}', source.indexOf('function attachmentIsImage(')) + 2)
  const artifacts = source.slice(source.indexOf('function localArtifactPaths('), source.indexOf('function UserTurn('))
  const row = source.slice(source.indexOf('  function ConversationRow('), source.indexOf('  function LimitedTaskRows('));
  const title = source.slice(source.indexOf('function ConversationTitle('), source.indexOf('function MessageTurn('));
  const workspace = String.raw`C:\Users\25702\AppData\Roaming\stable-desktop\workspace`
  const file = workspace + String.raw`\中文 报告 (一), 100%\虾姐蟹妹_CRM营销效果_近30天_20260806-20260904.xlsx`
  const bundle = buildSync({ stdin: { contents: `
    import React, {useState, useEffect, useRef} from 'react';
    import {createRoot} from 'react-dom/client';
    import {MarkdownContent} from './src/components/MarkdownContent';
    import {FileText, FileSpreadsheet, ImageIcon, X, ChevronRight, FolderOpen, ExternalLink, Pin, PinOff, MoreHorizontal} from 'lucide-react';
    const errorMessage = reason => reason instanceof Error ? reason.message : String(reason);
    const conversationMenuId='',menuMobile=false,approvalUnread=new Set(),runningMap={},unread=new Set(),active=true,activeConversation={id:'row'};
    ${title}
    ${row}
    ${isImage}
    ${images}
    ${card}
    ${artifacts}
    window.expected = ${JSON.stringify(file)}; window.calls = []; window.failOpen = true;
    window.fileExists = true; window.opened = []; window.imageCalls = []; window.changeContent = null;
    window.stable = { agent: { imagePreview: async value => { window.imageCalls.push(value); return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="orange"/></svg>') } }, preview: { existingFiles: async (_id, paths) => window.fileExists ? paths : [] }, system: { showItemInFolder: async value => {
      window.calls.push(value); if (window.failOpen) throw new Error('无法打开文件所在文件夹：fixture access denied'); return true;
    } } };
    function Test(){const [content,setContent]=useState(${JSON.stringify('完整路径：`' + file + '`')});window.changeContent=setContent;
      return <><div className="rail-task-pane" style={{width:260,marginBottom:24}}><ConversationRow item={{id:"row",title:"根据上传的数据源做一个经营情况的数据分析报告，交付HTML格式"}} mobile={false}/></div><header className="conversation-topbar"><div><strong>任务标题</strong></div></header><section className="upload-reference"><ConversationFileCard compact item={{name:window.expected.split('\\\\').pop(),path:window.expected,detail:'XLSX'}} onOpen={()=>{}} onRemove={()=>{}}/></section><ArtifactLinks conversationId="fixture" content={content} workspace={${JSON.stringify(workspace)}} onPreview={target=>window.opened.push(target.value)}/></>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text
  await window.loadURL('data:text/html,<html data-theme="light"><div id="root"></div></html>')
  await prepareVisualFixture(window)
  await window.webContents.insertCSS(readSource(path.join(root,'src/styles/tokens.css'),'utf8')+readSource(path.join(root,'src/styles/app.css'),'utf8')+readSource(path.join(root,'src/styles/sidebar-layout.css'),'utf8'))
  await window.webContents.executeJavaScript(bundle)
  await window.webContents.executeJavaScript(`(async () => {
    const wait = async predicate => { for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out'); };
    const expect = (value, message) => {if(!value)throw Error(message);};
    const reveal = async () => {
      document.querySelector('.upload-reference .conversation-file-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100}));
      await wait(()=>document.querySelector('[role=menuitem]'));
      const item = document.querySelector('[role=menuitem]'); expect(item.textContent.includes('打开文件所在位置'),'Wrong menu item'); item.click();
    };
    await wait(()=>document.querySelector('.markdown-file-link:not(:disabled)'));
    const link=document.querySelector('.markdown-file-link');
    expect(link.title===window.expected,'Link corrupted the path');
    expect(link.textContent===window.expected.split('\\\\').pop(),'Full path still visible');
    expect(link.querySelector('svg'),'File type icon missing');
    expect(!document.querySelector('.artifact-links'),'Duplicate delivery cards remain');
    link.click();expect(window.opened[0]===window.expected,'Preview click lost file path');
    await reveal(); await wait(()=>document.querySelector('[role=alert]'));
    expect(document.querySelector('[role=alert]').textContent.includes('fixture access denied'),'Open failure is invisible');
    expect(window.calls[0]===window.expected,'Menu corrupted the Windows path');
    window.failOpen=false; await reveal(); await wait(()=>window.calls.length===2&&!document.querySelector('[role=alert]'));
    expect(window.calls[1]===window.expected,'Retry corrupted the path');
    window.fileExists=false;window.dispatchEvent(new Event('focus'));
    await wait(()=>document.querySelector('.markdown-file-link:disabled'));
    window.fileExists=true;window.dispatchEvent(new Event('focus'));
    await wait(()=>document.querySelector('.markdown-file-link:not(:disabled)'));
    window.changeContent(window.expected.replace(/xlsx$/,'html'));
    await wait(()=>document.querySelector('.markdown-file-link:not(:disabled)')?.textContent.endsWith('.html'));
    expect(document.querySelector('.markdown-body').textContent===window.expected.split('\\\\').pop().replace(/xlsx$/,'html'),'Bare path not shortened');
    document.querySelector('.markdown-file-link').click();
    expect(window.opened.at(-1)===window.expected.replace(/xlsx$/,'html'),'Bare path click changed destination');
    window.changeContent('[打开最终 HTML](<'+window.expected.replace(/xlsx$/,'html')+'>) · [验收记录](<'+window.expected.replace(/xlsx$/,'md')+':12>)');
    await wait(()=>document.querySelectorAll('.markdown-file-link:not(:disabled)').length===2);
    expect(document.querySelectorAll('.markdown-file-link')[0].textContent==='打开最终 HTML','Custom label lost');
    expect(document.querySelectorAll('.markdown-file-link')[1].textContent==='验收记录 (line 12)','Line label lost');
    document.querySelectorAll('.markdown-file-link')[1].click();
    expect(window.opened.at(-1)===window.expected.replace(/xlsx$/,'md'),'Line suffix leaked into filesystem path');
  })()`)
  if (!window.webContents.debugger.isAttached()) window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('DOM.enable')
  await window.webContents.debugger.sendCommand('CSS.enable')
  const { root: dom } = await window.webContents.debugger.sendCommand('DOM.getDocument')
  const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId:dom.nodeId, selector:'.conversation-list-item' })
  await window.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']})
  const geometry=await window.webContents.executeJavaScript(`(()=>{
    const row=document.querySelector('.conversation-list-item'),button=row.querySelector('.conversation-item-actions'),title=row.querySelector('.conversation-title');
    const r=row.getBoundingClientRect(),b=button.getBoundingClientRect(),t=title.getBoundingClientRect();
    if(r.width<100||b.width!==28||b.height!==28)throw Error('Row geometry is not visible');
    if(Math.abs(r.right-b.right)>.5)throw Error('Hover button not flush with row right edge');
    if(t.right>b.left+.5)throw Error('Title overlaps hover actions');
    if(getComputedStyle(button).opacity!=='1')throw Error('Hovered actions invisible');
    return {rightGap:r.right-b.right,titleRight:t.right,actionsLeft:b.left};
  })()`)
  console.log('ROW_GEOMETRY',JSON.stringify(geometry))
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const output=path.join(root,'qa-artifacts/trace-groups');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'reply-attachments.png'),(await window.webContents.capturePage()).toPNG())
  console.log('FILE_LOCATION_UI_PASSED')
  window.destroy(); app.exit(0)
}
run().catch(error => { console.error('FILE_LOCATION_UI_FAILED', error.message); window?.destroy(); app.exit(1) })
process.on('exit', () => { try { fs.rmSync(temporary, { recursive: true, force: true }) } catch {} })