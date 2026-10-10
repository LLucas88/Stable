const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const ts=require('typescript')
const source=fs.readFileSync(require.resolve('../src/App.tsx'),'utf8')
const code=source.slice(source.indexOf('function localArtifactPaths('),source.indexOf('function ArtifactLinks('))
const extract=vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';localArtifactPaths')
test('delivery paths accept line references without passing them to filesystem checks',()=>{
 for(const text of ['D:\\testtest\\pelican-bicycle.html:1','D:\\testtest\\pelican-bicycle.html:12:3','[动画](D:/testtest/pelican-bicycle.html:1)','`D:\\testtest\\pelican-bicycle.html`']){
  const result=extract(text,'D:\\testtest');assert.equal(result.length,1);assert.equal(result[0].path,'D:\\testtest\\pelican-bicycle.html')
 }
 assert.equal(extract('D:\\other\\pelican.html:1','D:\\testtest').length,0)
 assert.equal(extract('D:\\testtest\\pelican.html:secret','D:\\testtest').length,0)
 assert.equal(extract('D:\\testtest\\pelican.html:1\nD:\\testtest\\pelican.html:2','D:\\testtest').length,1)
})
