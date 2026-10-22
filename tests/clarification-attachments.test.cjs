const { readSource } = require('./helpers/read-source.cjs')
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const main = readSource(path.join(__dirname, '../desktop/main.cjs'), 'utf8')
const source = main.slice(main.indexOf('async function prepareAgentMessage('), main.indexOf('function commitAgentMessage('))
const file = name => ({name, path:path.resolve(name), type:'image', size:10})
function setup() {
  const context = {path,Buffer,conversationPaths:()=>({workspace:'mock'}),store:{listLibrary:()=>[],listData:()=>[],listSkills:()=>[{id:'skill',name:'skill',content:'text'}],listKnowledge:()=>[]},
    CatchService:class {isCatchPath(_id,p){return p.endsWith('catch.md')} prepare(_id,p){return {...file('catch.md'),path:p,type:'catch'}}},
    inspectAgentAttachments:paths=>paths.map(p=>({...file(path.basename(p)),path:p})),
    extractAgentAttachments:async items=>({items:items.map(i=>({...i,path:path.resolve('copied',i.name)})),installedSkills:[]}),
    htmlEditors:{contextForAttachment:()=>undefined},skillReferences:()=>[],selectedSkillContext:()=>[]}
  vm.createContext(context);vm.runInContext(source,context);return context.prepareAgentMessage
}
test('real preparation retains inherited resources for execution but displays only newly submitted resources',async()=>{
  const prepare=setup(),old=file('old.png'),fresh=file('new.png'),catchFile=file('catch.md'),reference={kind:'skill',id:'skill'}
  const execution={attachments:[old,fresh,catchFile],references:[reference]}
  const result=await prepare(execution,'c',{}, {attachments:[fresh,catchFile]})
  assert.equal(result.attachments.length,3);assert.equal(result.selectedReferences.length,1)
  assert.deepEqual(Array.from(result.messageAttachments,i=>i.name),['new.png','catch.md'])
  assert.match(result.messageAttachments[0].path,/copied/)
  const answer=await prepare(execution,'c',{}, {prompt:'回答问题'})
  assert.equal(answer.messageAttachments.length,0);assert.equal(answer.attachments.length,3)
  const reupload=await prepare(execution,'c',{}, {attachments:[old],references:[reference]})
  assert.deepEqual(Array.from(reupload.messageAttachments,i=>i.name),['skill','old.png'])
  const ordinary=await prepare(execution,'c',{})
  assert.equal(ordinary.messageAttachments.length,4)
})
