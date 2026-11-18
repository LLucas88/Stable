'use strict'
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
app.setPath('userData', process.argv[2]); app.disableHardwareAcceleration()
let win

async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  win = new BrowserWindow({ show: false, width: 1100, height: 850, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error('renderer:', event.message) })
  const studio = `<html><script>addEventListener('message',event=>{if(event.data.type==='fixture-dirty')parent.postMessage({type:'stable-report-dirty'},'*');if(event.data.type==='stable-report-snapshot')parent.postMessage({type:'stable-report-snapshot-result',requestId:event.data.requestId,project:{sections:[{id:'section',name:'Saved section'}],blocks:[],currentSectionId:'section'},html:'<p>Studio saved</p>'},'*')});parent.postMessage({type:'stable-report-ready'},'*')</script></html>`
  const bundle = (await build({ stdin: { contents: `
    import {useState} from 'react';import {createRoot} from 'react-dom/client';
    import {ReportPage} from './src/ReportPage';import {WorkflowStudio} from './src/WorkflowStudio';
    window.errors=[];window.reportSaves=0;window.workflowSaves=0;window.failReport=false;window.failWorkflow=false;
    let reports=[{id:'source',name:'Saved report',mode:'source',components:[],html:'<p>Saved</p>',updatedAt:'2026-11-06T00:00:00Z',path:'fixture.html'}];
    let workflows=[{id:'workflow',name:'Saved workflow',description:'Saved description',nodes:[{id:'ai',type:'ai',title:'Analysis',instruction:'Saved instruction',position:{x:0,y:0}}],edges:[],updatedAt:'2026-11-06T00:00:00Z'}];
    window.stable={
      reports:{render:async draft=>draft.html,save:async draft=>{window.reportSaves++;if(window.failReport)throw Error('REPORT_SAVE_FAILED');if(window.deferReport)await new Promise(resolve=>window.finishReport=resolve);const item={...structuredClone(draft),id:draft.id||'created',updatedAt:new Date().toISOString(),path:'fixture.html'};reports=[item,...reports.filter(old=>old.id!==item.id)];return{item,items:reports}},export:async()=>{}},
      workflows:{onEvent:()=>()=>{},save:async draft=>{window.workflowSaves++;if(window.failWorkflow)throw Error('WORKFLOW_SAVE_FAILED');const saved={...structuredClone(draft),id:draft.id||'created-workflow',updatedAt:new Date().toISOString()};workflows=[saved,...workflows.filter(old=>old.id!==saved.id)];return workflows},enhanceInstruction:()=>new Promise(resolve=>window.finishEnhancement=resolve)},
    };
    function Test(){const[mode,setMode]=useState('reports'),[reportItems,setReports]=useState(reports),[workflowItems,setWorkflows]=useState(workflows);window.selectPage=setMode;window.touchWorkflow=()=>setWorkflows(items=>items.map(item=>({...item,updatedAt:'2027-01-01T00:00:00Z',lastStatus:'completed'})));const action=async(_label,run)=>{try{await run()}catch(error){window.errors.push(error.message)}};return mode==='reports'?<ReportPage items={reportItems} update={setReports} action={action}/>:<WorkflowStudio state={{workflows:mode==='empty'?[]:workflowItems,data:[],knowledge:[],skills:[],library:[],models:{items:[]}}} update={setWorkflows} action={action} busy=""/>}
    createRoot(document.getElementById('root')).render(<Test/>);
    window.input=(selector,value)=>{const node=document.querySelector(selector);if(!node)throw Error('Missing input '+selector);Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}))};
    window.clickText=(selector,text)=>{const button=[...document.querySelectorAll(selector)].find(node=>node.textContent.trim()===text);if(!button)throw Error('Missing button '+text);button.click()};
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'isolated-report-studio', setup(build) { build.onResolve({ filter: /stable-report-studio\.txt\?raw$/ }, args => ({ path: args.path, namespace: 'report-fixture' })); build.onLoad({ filter: /.*/, namespace: 'report-fixture' }, () => ({ contents: 'export default ' + JSON.stringify(studio), loader: 'js' })) } }] })).outputFiles[0].text
  const page = path.join(app.getPath('userData'), 'fixture.html')
  fs.writeFileSync(page, '<html><body><div id="root"></div></body></html>')
  await win.loadFile(page)
  await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'node_modules/@xyflow/react/dist/style.css'), 'utf8') + '\n.workflow-canvas{position:relative;height:500px;width:100%}.workflow-module{width:260px;min-height:150px}.report-studio-frame iframe{width:100%;height:350px}')
  await win.webContents.executeJavaScript(bundle)
  const run = code => win.webContents.executeJavaScript(code).catch(error => { throw Error(code + '\n' + error.message) }), settle = () => new Promise(resolve => setTimeout(resolve, 120))
  const dirty = () => run('Boolean(document.querySelector(\'[data-update-unsaved="true"]\'))')
  const step = async code => { await run(code); await settle() }
  await settle(); assert.equal(await dirty(), false)
  await step('document.querySelector(".report-index-open").click()'); assert.equal(await dirty(), false)
  await step('window.input("#report-name","Unsaved report")'); assert.equal(await dirty(), true)
  await step('window.input("#report-name","Saved report")'); assert.equal(await dirty(), false)
  await step('window.input("#report-source","<p>Edited</p>");window.failReport=true;window.clickText("button","保存 HTML")'); assert.equal(await dirty(), true)
  assert((await run('window.errors')).includes('REPORT_SAVE_FAILED'))
  await step('window.failReport=false;window.clickText("button","保存 HTML")'); assert.equal(await dirty(), false)
  await step('window.clickText("button","报告库")'); await step('window.clickText("button","新建报告")'); assert.equal(await dirty(), true, 'a new report has no saved baseline')
  await step('window.clickText("button","保存 HTML")'); assert.equal(await dirty(), false)
  await step('document.querySelector(".report-studio-frame iframe").contentWindow.postMessage({type:"fixture-dirty"},"*")'); assert.equal(await dirty(), true)
  await step('window.failReport=true;window.clickText("button","保存 HTML")'); assert.equal(await dirty(), true)
  await step('window.failReport=false;window.clickText("button","保存 HTML")'); assert.equal(await dirty(), false)
  await step('document.querySelector(".report-studio-frame iframe").contentWindow.postMessage({type:"fixture-dirty"},"*");window.deferReport=true')
  await step('window.clickText("button","保存 HTML")'); assert.equal(await run('typeof window.finishReport'), 'function')
  await step('document.querySelector(".report-studio-frame iframe").contentWindow.postMessage({type:"fixture-dirty"},"*")')
  await step('window.finishReport();window.deferReport=false'); assert.equal(await dirty(), true, 'edits after a studio snapshot remain unsaved')
  await step('window.clickText("button","保存 HTML")'); assert.equal(await dirty(), false)

  await step('window.selectPage("workflows")'); assert.equal(await dirty(), false)
  await step('window.input(\'[aria-label="工作流名称"]\',"Unsaved workflow");window.failWorkflow=true;window.clickText("button","保存")'); assert.equal(await dirty(), true)
  assert((await run('window.errors')).includes('WORKFLOW_SAVE_FAILED'))
  await step('window.failWorkflow=false;window.clickText("button","保存")'); assert.equal(await dirty(), false)
  await step('window.touchWorkflow()'); assert.equal(await dirty(), false, 'runtime metadata is not an editor change')
  await step('window.input(\'[aria-label="模块名称"]\',"New module title")'); assert.equal(await dirty(), true)
  await step('window.clickText("button","保存")'); assert.equal(await dirty(), false)
  await step('document.querySelector(\'[aria-label="AI 生成工作流"]\').click()'); await step('window.input(".workflow-ai-popover textarea","Unsaved generation goal")'); assert.equal(await dirty(), true)
  await step('document.querySelector(\'[aria-label="AI 生成工作流"]\').click()'); assert.equal(await dirty(), true, 'closing the goal popover does not persist its text')
  await step('document.querySelector(\'[aria-label="AI 生成工作流"]\').click()'); await step('window.input(".workflow-ai-popover textarea","")'); assert.equal(await dirty(), false)
  await step('document.querySelector(\'.react-flow__node[data-id="ai"]\').dispatchEvent(new MouseEvent("click",{bubbles:true}))')
  await step('window.input(\'[aria-label="模块 AI 输入"]\',"Unsaved editing prompt")'); assert.equal(await dirty(), true)
  await step('window.clickText("button","保存")'); assert.equal(await dirty(), true, 'saving nodes does not save the separate editing prompt')
  await step('window.input(\'[aria-label="模块 AI 输入"]\',"")'); assert.equal(await dirty(), false)
  await step('window.input(\'[aria-label="模块 AI 输入"]\',"Enhance this node")'); await step('document.querySelector(\'[aria-label="提交给 AI"]\').click()'); assert.equal(await dirty(), true, 'an in-flight enhancement is not a saved empty prompt')
  await step('window.finishEnhancement("New generated instruction")'); assert.equal(await dirty(), true)
  await step('window.clickText("button","保存")'); assert.equal(await dirty(), false)
  console.log('DEV_UPDATE_EDITORS_UI_PASSED'); win.destroy(); app.quit()
}
main().catch(error => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1) })
