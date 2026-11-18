'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {StableStore}=require('../desktop/services/store.cjs');
const {TemplateLibrary,SKILL_ID}=require('../desktop/services/template-library.cjs');
const {markdownPages,markdownPageDocument}=require('../desktop/services/markdown-pages.cjs');
const {resolveMarkdownFile}=require('../desktop/services/preview.cjs');

test('frontend slides migration preserves existing imports, favorites and disabled skill; all resources copy on use',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-slides-')),store=new StableStore(root);
 try {
  const existing={id:'custom-existing',name:'我的模板',favorite:true,skillId:SKILL_ID};store.setSetting('template-library-v1',[existing]);
  const lib=new TemplateLibrary(store,root),items=lib.list();assert.equal(items.length,47);assert.deepEqual(items[0],existing);
  assert.equal(new TemplateLibrary(store,root).list().length,47);
  const slide=items.find(x=>x.id==='frontend-slides-8-bit-orbit');assert.match(lib.detail(slide.id).html,/8-BIT ORBIT/);assert.equal(lib.detail(slide.id).previewImages.length,3);assert.equal(lib.detail(slide.id,{thumbnail:true}).previewImages.length,1);
  const used=lib.use(slide.id,root);assert.deepEqual(store.getSetting('conversation-skills:'+used.conversationId),['frontend-slides']);assert.match(used.prompt,/8-bit-orbit\/design.md/);
  const skill=store.listSkills().find(x=>x.id==='frontend-slides');assert.ok(fs.existsSync(path.join(skill.path,'bold-template-pack/templates/8-bit-orbit/design.md')));assert.ok(fs.existsSync(path.join(skill.path,'LICENSE')));
  store.setSkillEnabled('frontend-slides',false);lib.list();assert.throws(()=>lib.use(slide.id,root),/Skill 不可用/);
 } finally {store.close();fs.rmSync(root,{recursive:true,force:true})}
});
test('templates persist imports, settings and favorites; use binds skill with no submitted message',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-templates-')),store=new StableStore(root);
 try{const lib=new TemplateLibrary(store,root);assert.equal(lib.list().length,47);const original='<html><h1>测试</h1></html>',file=path.join(root,'import.html');fs.writeFileSync(file,original);const imported=lib.import(file).find(x=>x.name==='import');
 lib.save(imported.id,{category:'数据分析',favorite:true,prompt:'请复用模板'});assert.equal(new TemplateLibrary(store,root).item(imported.id).favorite,true);
 const result=lib.use(imported.id,root);assert.deepEqual(store.getSetting('conversation-skills:'+result.conversationId),[SKILL_ID]);assert.equal(store.listMessages(result.conversationId).length,0);assert.match(result.prompt,/请复用模板/);assert.equal(fs.readFileSync(file,'utf8'),original);assert.ok(store.listSkills().find(x=>x.id===SKILL_ID).enabled);
 lib.save(imported.id,{skillId:'missing'});assert.throws(()=>lib.use(imported.id,root),/Skill 不可用/);assert.throws(()=>lib.detail('../secrets'),/不存在/);
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true})}
});
test('gallery migration retires only obsolete builtins, keeps settings and places classic presets last',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-gallery-migration-')),store=new StableStore(root);
 try {
  const directory=path.join(root,'template-library');fs.mkdirSync(directory);
  const old=[
   {id:'member',name:'会员经营报告',builtin:true,skillId:SKILL_ID,favorite:true},
   {id:'old-project',name:'项目启动方案',builtin:true,skillId:SKILL_ID},
   {id:'old-brand',name:'品牌故事长页',builtin:true,skillId:SKILL_ID},
   {id:'user-import',name:'项目启动方案',skillId:SKILL_ID},
   {id:'frontend-slides-preset-bold-signal',name:'Bold Signal',builtin:true,skillId:'frontend-slides'},
   {id:'frontend-slides-8-bit-orbit',name:'8-Bit Orbit',builtin:true,skillId:'frontend-slides',favorite:true,prompt:'用户提示词',category:'数据分析'},
  ];
  for(const item of old)fs.writeFileSync(path.join(directory,item.id+'.html'),'<html>原有内容</html>');
  store.setSetting('template-library-v1',old);
  const lib=new TemplateLibrary(store,root),items=lib.list(),slides=items.filter(x=>x.skillId==='frontend-slides');
  assert.equal(items.length,48);assert.equal(slides.length,46);
  assert.ok(items.every(x=>!['old-project','old-brand'].includes(x.id)));
  assert.ok(items.some(x=>x.id==='user-import'));assert.equal(lib.detail('member').html,'<html>原有内容</html>');
  assert.equal(store.getSetting('template-library-retired-v2').length,2);
  assert.ok(items.slice(-12).every(x=>x.hasOriginalPreview===false));assert.equal(items.filter(x=>x.hasOriginalPreview).length,34);
  assert.ok(slides.every(x=>/[\u4e00-\u9fff]/.test(x.name)));
  const selected=items.find(x=>x.id==='frontend-slides-8-bit-orbit');assert.equal(selected.favorite,true);assert.equal(selected.prompt,'用户提示词');assert.equal(selected.category,'数据分析');
  const use=lib.use(selected.id,root),file=use.prompt.match(/参考模板：([^\n]+)/)[1];
  assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync(path.join(__dirname,'../desktop/assets/frontend-slides/originals/8-bit-orbit.html'),'utf8'));
  for(const support of ['deck-stage.js','LICENSE'])assert.ok(fs.existsSync(path.join(path.dirname(file),support)));
  lib.save(selected.id,{name:'用户中文名'});assert.equal(lib.item(selected.id).name,'用户中文名');
  const imported=path.join(root,'最后导入.html');fs.writeFileSync(imported,'<h1>导入</h1>');
  const next=lib.import(imported);assert.ok(next.slice(-12).every(x=>x.hasOriginalPreview===false));assert.ok(next.slice(0,-12).some(x=>x.name==='最后导入'));
 } finally {store.close();fs.rmSync(root,{recursive:true,force:true})}
});

test('all original samples and templates match recorded upstream Git blobs',()=>{
 const assets=path.join(__dirname,'../desktop/assets/frontend-slides/originals'),provenance=require('../desktop/assets/frontend-slides/originals/PROVENANCE.json');
 const {createHash}=require('node:crypto');assert.equal(provenance.files.length,137);
 for(const entry of provenance.files){const bytes=fs.readFileSync(path.join(assets,entry.file));assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),entry.blob,entry.file)}
});

test('large Markdown remains complete across pages with repeated table headers and escaped content',()=>{
 const text='# 完整清单\n\n| 门店 | 动作 |\n| --- | --- |\n'+Array.from({length:6000},(_,i)=>`| STORE_${i}_END | ${'整改要求'.repeat(35)} |`).join('\n');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-markdown-pages-'));
 try{const file=path.join(root,'large.md');fs.writeFileSync(file,text);assert.ok(fs.statSync(file).size>2*1024*1024);const input=resolveMarkdownFile(file,root);assert.equal(input.content,text);const pages=markdownPages(text);assert.ok(pages.length>2);const all=pages.map((x,i)=>markdownPageDocument(pages,i,'测试','light')).join('');for(let i=0;i<6000;i++)assert.equal(all.split(`STORE_${i}_END`).length-1,1);assert.ok(pages.slice(1).every(x=>x.startsWith('| 门店 | 动作 |')));assert.match(all,/stable-markdown-page:1/);assert.doesNotMatch(markdownPageDocument(['<script>alert(1)</script>'],0,'测试','light'),/<script>/);assert.throws(()=>markdownPageDocument(pages,-1,'x'),/页码/)}finally{fs.rmSync(root,{recursive:true,force:true})}
});
