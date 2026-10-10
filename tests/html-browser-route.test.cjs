'use strict'
const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path')
const {spawn}=require('node:child_process')
test('local HTML reads and screenshots through the real shared browser MCP route without a host Chrome process',{timeout:60000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.STABLE_HTML_PREVIEW_SMOKE_FILE
  const result=await new Promise(resolve=>{
    let output=''
    const child=spawn(require('electron'),[path.join(__dirname,'fixtures/html-browser-route.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']})
    const timer=setTimeout(()=>{child.kill();resolve({code:-1,output:'Timeout '+output})},55000)
    for(const key of ['stdout','stderr'])child[key].on('data',chunk=>{output=(output+chunk).slice(-10000)})
    child.on('error',e=>{clearTimeout(timer);resolve({code:-1,output:e.message})})
    child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output);assert.match(result.output,/HTML_BROWSER_ROUTE_PASSED/)
})
