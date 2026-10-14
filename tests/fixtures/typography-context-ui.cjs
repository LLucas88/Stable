'use strict'
const { app, BrowserWindow, session } = require('electron')
const { build } = require('esbuild')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'qa-artifacts/typography-pptx')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(output, 'profile-')))
app.disableHardwareAcceleration()
let win
async function main() {
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest((request, callback) => callback({ cancel: /^https?:/.test(request.url) }))
  win = new BrowserWindow({ show: false, width: 1180, height: 850, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.error(message) })
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8').replace('function MarkdownContent(', 'export function MarkdownContent(')
  const bundle = (await build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {MarkdownContent} from './src/App';import {ContextUsageButton} from './src/ContextUsageButton';
    window.stable={agent:{contextUsage:async()=>({usedTokens:621200,maxTokens:1000000,percentage:62.12,updatedAt:Date.now(),categories:[{name:'messages',tokens:601000},{name:'mcp tools',tokens:773},{name:'memory files',tokens:520},{name:'skills',tokens:2400}],mcpTools:[{name:'hidden-mcp',tokens:773}],memoryFiles:[{name:'hidden-memory',tokens:520}],skills:[{name:'hidden-skill',tokens:2400}],systemTools:[{name:'Read',tokens:1200}]})}};
    createRoot(document.getElementById('root')).render(<main style={{maxWidth:880,margin:'32px auto',padding:24}}>
      <header className="conversation-topbar"><div><strong>经营复盘报告 · 字体检查</strong></div></header>
      <div className="user-bubble" style={{margin:'24px 0'}}><p>根据本月数据生成一份新的复盘报告，保留准确的数据口径。</p></div>
      <section className="trace-text"><div className="trace-text-content">核对 Excel 表头和月份，再确定图表表达方式。当前净收入 120,000 元。</div></section>
      <article className="assistant-answer"><MarkdownContent content={'# 本月经营表现\\n会员净收入增长 12.5%，主要增长来自老客复购。请结合门店和时间维度继续分析。\\n\\n## 指标与口径\\n| 指标 | 本月 | 环比 |\\n| --- | --- | --- |\\n| 会员净收入 | 120,000 | +12.5% |\\n| 活跃会员 | 8,420 | +6.8% |\\n\\n内部校验文件：'+String.fromCharCode(96)+'data/会员指标.json'+String.fromCharCode(96)+'。'}/></article>
      <div className="composer" style={{position:'relative',marginTop:200}}><textarea id="agent-prompt" defaultValue="继续优化图表和阅读层级…"/><div className="composer-actions"><ContextUsageButton conversationId="fixture" modelId="fixture" running={false}/></div></div>
    </main>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.mp4': 'dataurl', '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'export-markdown', setup(build) { build.onLoad({ filter: /[\\/]src[\\/]App\.tsx$/ }, () => ({ contents: source, loader: 'tsx', resolveDir: path.join(root, 'src') })) } }] })).outputFiles[0].text
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN" data-theme="light"><body><div id="root"></div></body></html>'))
  for (const file of ['context-usage.css', 'tokens.css', 'app.css', 'workbench-surfaces.css']) await win.webContents.insertCSS(fs.readFileSync(path.join(root, 'src/styles', file), 'utf8'))
  await win.webContents.executeJavaScript(bundle)
  const run = code => win.webContents.executeJavaScript(code), settle = () => new Promise(resolve => setTimeout(resolve, 200))
  await settle()
  const metrics = await run(`Object.fromEntries(['.markdown-body','.markdown-body h2','.markdown-body h3','.markdown-body td','.markdown-body code','.trace-text','.user-bubble p','#agent-prompt'].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return [selector,{font:s.fontFamily,size:s.fontSize,line:s.lineHeight,spacing:s.letterSpacing,weight:s.fontWeight}]}))`)
  for (const selector of ['.markdown-body','.user-bubble p','#agent-prompt']) { assert.equal(metrics[selector].size,'15px');assert.equal(metrics[selector].spacing,'normal') }
  assert.equal(metrics['.markdown-body td'].size,'14px')
  assert.equal(metrics['.trace-text'].font,metrics['.markdown-body'].font)
  assert.equal(metrics['.markdown-body h2'].size,'18px');assert.equal(metrics['.markdown-body h3'].size,'16px')
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('DOM.enable');await win.webContents.debugger.sendCommand('CSS.enable')
  const doc = await win.webContents.debugger.sendCommand('DOM.getDocument')
  const node = await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.markdown-body code'})
  const { fonts } = await win.webContents.debugger.sendCommand('CSS.getPlatformFontsForNode',{nodeId:node.nodeId})
  assert.ok(!fonts.some(font=>/SimSun/i.test(font.familyName)),JSON.stringify(fonts))
  fs.writeFileSync(path.join(output,'font-metrics.json'),JSON.stringify({metrics,codeFonts:fonts},null,2))
  await run(`document.querySelector('.context-usage-button').click()`);await settle()
  await run(`document.querySelector('.context-usage-heading').click()`);await settle()
  const panel = await run(`({text:document.querySelector('.context-usage-panel').innerText,groups:[...document.querySelectorAll('.context-usage-group summary')].map(x=>x.textContent)})`)
  assert.deepEqual(panel.groups,['系统工具1 项'])
  for(const text of ['MCP 工具','记忆文件','技能','剩余空间','621.2k']) assert.ok(panel.text.includes(text),text)
  assert.doesNotMatch(panel.text,/hidden-mcp|hidden-memory|hidden-skill/)
  fs.writeFileSync(path.join(output,'font-context-light.png'),(await win.webContents.capturePage()).toPNG())
  await run(`document.documentElement.dataset.theme='dark'`);await settle()
  fs.writeFileSync(path.join(output,'font-context-dark.png'),(await win.webContents.capturePage()).toPNG())
  await run(`document.querySelector('.context-usage-panel').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await settle()
  assert.equal(await run(`!!document.querySelector('.context-usage-panel')`),false)
  console.log('TYPOGRAPHY_CONTEXT_UI_PASSED');win.destroy();app.exit(0)
}
main().catch(error=>{console.error(error);win?.destroy();app.exit(1)})
