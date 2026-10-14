const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {HtmlDocument,parseSource,compile}=require('../desktop/services/html-source-patch.cjs')
const source='\ufeff<!doctype html>\r\n<html><head><meta charset="utf-8"><script>const data=[1,2];</script></head><body><h1 id="title" style="color:red">中文 &amp; 标题</h1><p><b>nested</b> text</p><img src="old.png" srcset="old@2x.png 2x"><div id="chart"></div></body></html>'
test('source patches preserve scripts, BOM, line endings and unrelated source; undo writes original bytes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stable-editor-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'report.html');fs.writeFileSync(file,source)
 const doc=new HtmlDocument(file,[dir]),heading=doc.nodes.find(n=>n.tag==='h1'),image=doc.nodes.find(n=>n.tag==='img')
 doc.save([{id:heading.id,text:'新 <标题>\n下一行',styles:{'font-size':'24px',color:'#123456'}},{id:image.id,attrs:{src:'./report.assets/images/abc.png'}}])
 const result=fs.readFileSync(file,'utf8');assert.match(result,/新 &lt;标题&gt;<br>下一行/);assert.match(result,/<script>const data=\[1,2\];<\/script>/);assert.ok(result.startsWith('\ufeff<!doctype html>\r\n'));assert.ok(!result.includes('srcset='));assert.match(result,/color:red;color:#123456|color:red;font-size:24px/)
 doc.save([]);assert.equal(fs.readFileSync(file,'utf8'),source)
 fs.writeFileSync(file,'external');assert.throws(()=>doc.save([{id:heading.id,text:'overwrite'}]),/修改/);assert.equal(fs.readFileSync(file,'utf8'),'external')
})
test('rejects generated IDs, overlapping operations, unsafe styles and active links',()=>{
 const nodes=parseSource(source),h=nodes.find(n=>n.tag==='h1'),p=nodes.find(n=>n.tag==='p')
 assert.throws(()=>compile(source,nodes,[{id:'missing',text:'x'}]),/失效/)
 assert.throws(()=>compile(source,nodes,[{id:p.id,text:'destroy children'}]),/具体文字/)
 assert.throws(()=>compile(source,nodes,[{id:h.id,styles:{color:'red;background:url(https://x)'}}]),/样式/)
 assert.throws(()=>compile(source,nodes,[{id:h.id,attrs:{href:'java\nscript:alert(1)'}}]),/链接/)
 assert.throws(()=>compile(source,nodes,[{id:h.id,attrs:{onclick:'x'}}]),/属性/)
 assert.equal(parseSource(source).some(n=>n.tag==='script'),false)
})
test('nested delete is one source change and mixed inline markup is preserved',()=>{
 const nodes=parseSource(source),p=nodes.find(n=>n.tag==='p'),b=nodes.find(n=>n.tag==='b')
 const result=compile(source,nodes,[{id:p.id,deleted:true},{id:b.id,deleted:true}]);assert.ok(!result.includes('nested'));assert.ok(result.includes('const data='))
})
test('file extension, encoding, and write roots are enforced',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stable-editor-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'report.html');fs.writeFileSync(file,'<meta charset="gbk">hello')
 assert.throws(()=>new HtmlDocument(file,[dir]),/UTF-8/);assert.throws(()=>new HtmlDocument(file,[path.join(dir,'other')]),/工作区/)
})
test('rerender guards follow the remaining source node after sibling deletion',()=>{
 const {readOverrides}=require('../desktop/services/html-editor-overrides.cjs')
 const html='<html><body><p>remove</p><p>seed</p><script>/* report renderer */</script></body></html>',nodes=parseSource(html)
 const output=compile(html,nodes,[{id:nodes[0].id,deleted:true},{id:nodes[1].id,text:'changed\nline',styles:{color:'red'}}])
 const guards=readOverrides(output).changes
 assert.equal(guards.length,1);assert.equal(guards[0].target.selector,'html > body:nth-of-type(1) > p:nth-of-type(1)');assert.equal(guards[0].html,'changed<br>line');assert.equal(guards[0].styles.color,'red')
})
