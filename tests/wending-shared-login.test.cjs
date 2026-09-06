'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { WendingCliService } = require('../desktop/services/wending-cli.cjs')
const root = path.resolve(__dirname, '..')
const python = path.join(root, 'vendor/wending-cli/python/python.exe')
const encode = value => Buffer.from(value).toString('base64')

test('shared login persists across conversations and restarts without repeating authorization', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync(python, ['-B', '-X', 'utf8', path.join(__dirname, 'fixtures/wending-shared-login.py')], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /Ran 7 tests/)
})
test('legacy login migration adopts the latest session without sharing task brands', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stable-shared-migration-'))
  const service=new WendingCliService({appPath:root,userData:directory,workspace:directory,packaged:false})
  try {
    const a=service.forConversation('a'),b=service.forConversation('b')
    for(const [cli,brand] of [[a,'100'],[b,'200']]) fs.writeFileSync(path.join(cli.options.configDirectory,'config.json'),JSON.stringify({wnToken:encode('fixture-'+brand),third_login_channel:encode('1'),stable_brand_id:encode(brand)}))
    fs.utimesSync(path.join(a.options.configDirectory,'config.json'),new Date(1000),new Date(1000))
    const env=b.environment()
    const shared=JSON.parse(fs.readFileSync(path.join(env.WENDING_SHARED_AUTH_DIR,'config.json'),'utf8'))
    assert.equal(shared.wnToken,encode('fixture-200'))
    assert.equal(shared.stable_brand_id,undefined)
    assert.equal(a.environment().WENDING_SHARED_AUTH_DIR,env.WENDING_SHARED_AUTH_DIR)
    service.removeConversation('b')
    assert.ok(fs.existsSync(path.join(env.WENDING_SHARED_AUTH_DIR,'config.json')))
  } finally {service.dispose();fs.rmSync(directory,{recursive:true,force:true})}
})
test('concurrent CLI processes restore their own brands using one shared server session', {skip:process.platform!=='win32',timeout:15000}, async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stable-shared-concurrent-'))
  const service=new WendingCliService({appPath:root,userData:directory,workspace:directory,packaged:false})
  try {
    fs.mkdirSync(service.options.sharedAuthDirectory,{recursive:true})
    fs.writeFileSync(path.join(service.options.sharedAuthDirectory,'config.json'),JSON.stringify({wnToken:encode('shared-fixture-session'),third_login_channel:encode('0')}))
    fs.writeFileSync(path.join(service.options.sharedAuthDirectory,'mock-server-brand'),'999')
    const run=(id,brand)=>{
      const cli=service.forConversation(id)
      fs.writeFileSync(path.join(cli.options.configDirectory,'config.json'),JSON.stringify({stable_brand_id:encode(brand),stable_brand_channel:encode('0')}))
      return new Promise((resolve,reject)=>{
        const child=spawn(python,['-B','-X','utf8',path.join(__dirname,'fixtures/wending-shared-requests.py')],{cwd:directory,env:cli.environment(),windowsHide:true,stdio:['ignore','pipe','pipe']})
        let stdout='',stderr=''
        child.stdout.on('data',c=>{stdout+=c});child.stderr.on('data',c=>{stderr+=c})
        child.on('error',reject);child.on('close',code=>{try{assert.equal(code,0,stderr);resolve(JSON.parse(stdout))}catch(e){reject(e)}})
      })
    }
    assert.deepEqual(await Promise.all([run('a','100'),run('b','200')]),[{brand:'100',queries:8},{brand:'200',queries:8}])
  } finally {service.dispose();fs.rmSync(directory,{recursive:true,force:true})}
})

test('Use opens shared login directly at brand selection and keeps brands per conversation', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [path.join(__dirname, 'fixtures/wending-shared-ui.cjs')], { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    let output=''
    const timer=setTimeout(()=>{child.kill();reject(new Error('Shared UI timeout'))},15000)
    child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk})
    child.on('error',error=>{clearTimeout(timer);reject(error)});child.on('close',code=>{clearTimeout(timer);resolve({code,output})})
  })
  assert.equal(result.code,0,result.output)
  assert.match(result.output,/WENDING_SHARED_UI_PASSED/)
})
