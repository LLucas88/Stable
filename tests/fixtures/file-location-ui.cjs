'use strict'
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
  window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } })
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const card = source.slice(source.indexOf('function ConversationFileCard('), source.indexOf('function useAttachmentImageSource('))
  const images = source.slice(source.indexOf('function useAttachmentImageSource('), source.indexOf('function ImageLightbox('))
  const isImage = source.slice(source.indexOf('function attachmentIsImage('), source.indexOf('function DropTarget('))
  const artifacts = source.slice(source.indexOf('function localArtifactPaths('), source.indexOf('function formatAutomationSchedule('))
  const workspace = String.raw`C:\Users\25702\AppData\Roaming\stable-desktop\workspace`
  const file = workspace + String.raw`\中文 报告 (一), 100%\虾姐蟹妹_CRM营销效果_近30天_20260806-20260904.xlsx`
  const bundle = buildSync({ stdin: { contents: `
    import React, {useState, useEffect, useRef} from 'react';
    import {createRoot} from 'react-dom/client';
    import {FileText, FileSpreadsheet, ImageIcon, X, ChevronRight, FolderOpen, ExternalLink} from 'lucide-react';
    const errorMessage = reason => reason instanceof Error ? reason.message : String(reason);
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
      return <><header className="conversation-topbar"><div><strong>任务标题</strong></div></header><section className="upload-reference"><ConversationFileCard compact item={{name:window.expected.split('\\\\').pop(),path:window.expected,detail:'XLSX'}} onOpen={()=>{}} onRemove={()=>{}}/></section><ArtifactLinks conversationId="fixture" content={content} workspace={${JSON.stringify(workspace)}} onOpen={item=>window.opened.push(item.path)}/></>}
    createRoot(document.getElementById('root')).render(<Test/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text
  await window.loadURL('data:text/html,<html data-theme="light"><div id="root"></div></html>')
  await window.webContents.insertCSS(readSource(path.join(root,'src/styles/tokens.css'),'utf8')+readSource(path.join(root,'src/styles/app.css'),'utf8'))
  await window.webContents.executeJavaScript(bundle)
  await window.webContents.executeJavaScript(`(async () => {
    const wait = async predicate => { for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out'); };
    const expect = (value, message) => {if(!value)throw Error(message);};
    const reveal = async () => {
      document.querySelector('.artifact-links .conversation-file-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100}));
      await wait(()=>document.querySelector('[role=menuitem]'));
      const item = document.querySelector('[role=menuitem]'); expect(item.textContent.includes('打开文件所在位置'),'Wrong menu item'); item.click();
    };
    await wait(()=>document.querySelector('.artifact-links .conversation-file-card'));
    expect(document.querySelector('.artifact-links .conversation-file-card').title===window.expected,'Card corrupted the path');
    const outputCard=document.querySelector('.artifact-links .conversation-file-card'), uploadCard=document.querySelector('.upload-reference .conversation-file-card');
    for(const property of ['width','minHeight','borderRadius','backgroundColor']) expect(getComputedStyle(outputCard)[property]===getComputedStyle(uploadCard)[property],'Attachment style differs: '+property);
    expect(!document.querySelector('.artifact-links .attachment-card-remove'),'Reply has an upload delete button');
    expect(getComputedStyle(document.querySelector('.conversation-topbar strong')).fontWeight==='400','Header title is bold');
    outputCard.click();expect(window.opened[0]===window.expected,'Preview click lost file path');
    await reveal(); await wait(()=>document.querySelector('[role=alert]'));
    expect(document.querySelector('[role=alert]').textContent.includes('fixture access denied'),'Open failure is invisible');
    expect(window.calls[0]===window.expected,'Menu corrupted the Windows path');
    window.failOpen=false; await reveal(); await wait(()=>window.calls.length===2&&!document.querySelector('[role=alert]'));
    expect(window.calls[1]===window.expected,'Retry corrupted the path');
    window.fileExists=false;window.dispatchEvent(new Event('focus'));
    await wait(()=>!document.querySelector('.artifact-links .conversation-file-card'));
    window.fileExists=true;window.dispatchEvent(new Event('focus'));
    await wait(()=>document.querySelector('.artifact-links .conversation-file-card'));
    expect(!document.querySelector('.artifact-links .conversation-file-card').textContent.includes('生成文件'),'A mentioned path must not claim generated output');
    window.changeContent(window.expected+String.fromCharCode(10)+window.expected.replace(/xlsx$/,'md')+String.fromCharCode(10)+window.expected.replace(/xlsx$/,'png'));
    await wait(()=>document.querySelector('.artifact-links img'));
    expect(document.querySelector('.artifact-links [data-pill]'),'Markdown upload pill style missing');
    expect(document.querySelector('.artifact-links .composer-image-preview'),'Image does not reuse upload thumbnail');
    expect(!document.querySelector('.artifact-links .composer-image-remove'),'Reply image has delete control');
    document.querySelector('.artifact-links .composer-image-preview').click();
    expect(window.opened.at(-1).endsWith('.png'),'Image preview click lost path');
  })()`)
  await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  const output=path.join(root,'qa-artifacts/trace-groups');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'reply-attachments.png'),(await window.webContents.capturePage()).toPNG())
  console.log('FILE_LOCATION_UI_PASSED')
  window.destroy(); app.exit(0)
}
run().catch(error => { console.error('FILE_LOCATION_UI_FAILED', error.message); window?.destroy(); app.exit(1) })
process.on('exit', () => { try { fs.rmSync(temporary, { recursive: true, force: true }) } catch {} })