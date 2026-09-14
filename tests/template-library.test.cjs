'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {StableStore}=require('../desktop/services/store.cjs');
const {TemplateLibrary,SKILL_ID}=require('../desktop/services/template-library.cjs');
const {markdownPages,markdownPageDocument}=require('../desktop/services/markdown-pages.cjs');
const {resolveMarkdownFile}=require('../desktop/services/preview.cjs');
test('templates persist imports, settings and favorites; use binds skill with no submitted message',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-templates-')),store=new StableStore(root);
 try{const lib=new TemplateLibrary(store,root);assert.equal(lib.list().length,3);const original='<html><h1>测试</h1></html>',file=path.join(root,'import.html');fs.writeFileSync(file,original);const imported=lib.import(file).at(-1);
 lib.save(imported.id,{category:'数据分析',favorite:true,prompt:'请复用模板'});assert.equal(new TemplateLibrary(store,root).item(imported.id).favorite,true);
 const result=lib.use(imported.id,root);assert.deepEqual(store.getSetting('conversation-skills:'+result.conversationId),[SKILL_ID]);assert.equal(store.listMessages(result.conversationId).length,0);assert.match(result.prompt,/请复用模板/);assert.equal(fs.readFileSync(file,'utf8'),original);assert.ok(store.listSkills().find(x=>x.id===SKILL_ID).enabled);
 lib.save(imported.id,{skillId:'missing'});assert.throws(()=>lib.use(imported.id,root),/Skill 不可用/);assert.throws(()=>lib.detail('../secrets'),/不存在/);
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true})}
});
test('large Markdown remains complete across pages with repeated table headers and escaped content',()=>{
 const text='# 完整清单\n\n| 门店 | 动作 |\n| --- | --- |\n'+Array.from({length:6000},(_,i)=>`| STORE_${i}_END | ${'整改要求'.repeat(35)} |`).join('\n');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-markdown-pages-'));
 try{const file=path.join(root,'large.md');fs.writeFileSync(file,text);assert.ok(fs.statSync(file).size>2*1024*1024);const input=resolveMarkdownFile(file,root);assert.equal(input.content,text);const pages=markdownPages(text);assert.ok(pages.length>2);const all=pages.map((x,i)=>markdownPageDocument(pages,i,'测试','light')).join('');for(let i=0;i<6000;i++)assert.equal(all.split(`STORE_${i}_END`).length-1,1);assert.ok(pages.slice(1).every(x=>x.startsWith('| 门店 | 动作 |')));assert.match(all,/stable-markdown-page:1/);assert.doesNotMatch(markdownPageDocument(['<script>alert(1)</script>'],0,'测试','light'),/<script>/);assert.throws(()=>markdownPageDocument(pages,-1,'x'),/页码/)}finally{fs.rmSync(root,{recursive:true,force:true})}
});
