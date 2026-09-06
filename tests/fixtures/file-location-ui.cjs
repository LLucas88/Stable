'use strict'
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
  window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const card = source.slice(source.indexOf('function ConversationFileCard('), source.indexOf('function useAttachmentImageSource('))
  const artifacts = source.slice(source.indexOf('function localArtifactPaths('), source.indexOf('function formatAutomationSchedule('))
  const workspace = String.raw`C:\Users\25702\AppData\Roaming\stable-desktop\workspace`
  const file = workspace + String.raw`\中文 报告 (一), 100%\虾姐蟹妹_CRM营销效果_近30天_20260806-20260904.xlsx`
  const bundle = buildSync({ stdin: { contents: `
    import React, {useState, useEffect, useRef} from 'react';
    import {createRoot} from 'react-dom/client';
    import {FileText, ChevronRight, FolderOpen, ExternalLink} from 'lucide-react';
    const errorMessage = reason => reason instanceof Error ? reason.message : String(reason);
    ${card}
    ${artifacts}
    window.expected = ${JSON.stringify(file)}; window.calls = []; window.failOpen = true;
    window.stable = { system: { showItemInFolder: async value => {
      window.calls.push(value); if (window.failOpen) throw new Error('无法打开文件所在文件夹：fixture access denied'); return true;
    } } };
    createRoot(document.getElementById('root')).render(<ArtifactLinks content={${JSON.stringify('完整路径：`' + file + '`')}} workspace={${JSON.stringify(workspace)}} onOpen={()=>{}}/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text
  await window.loadURL('data:text/html,<div id="root"></div>')
  await window.webContents.executeJavaScript(bundle)
  await window.webContents.executeJavaScript(`(async () => {
    const wait = async predicate => { for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out'); };
    const expect = (value, message) => {if(!value)throw Error(message);};
    const reveal = async () => {
      document.querySelector('.conversation-file-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100}));
      await wait(()=>document.querySelector('[role=menuitem]'));
      const item = document.querySelector('[role=menuitem]'); expect(item.textContent.includes('打开文件所在位置'),'Wrong menu item'); item.click();
    };
    await wait(()=>document.querySelector('.conversation-file-card'));
    expect(document.querySelector('.conversation-file-card').title===window.expected,'Card corrupted the path');
    await reveal(); await wait(()=>document.querySelector('[role=alert]'));
    expect(document.querySelector('[role=alert]').textContent.includes('fixture access denied'),'Open failure is invisible');
    expect(window.calls[0]===window.expected,'Menu corrupted the Windows path');
    window.failOpen=false; await reveal(); await wait(()=>window.calls.length===2&&!document.querySelector('[role=alert]'));
    expect(window.calls[1]===window.expected,'Retry corrupted the path');
  })()`)
  console.log('FILE_LOCATION_UI_PASSED')
  window.destroy(); app.exit(0)
}
run().catch(error => { console.error('FILE_LOCATION_UI_FAILED', error.message); window?.destroy(); app.exit(1) })
process.on('exit', () => { try { fs.rmSync(temporary, { recursive: true, force: true }) } catch {} })