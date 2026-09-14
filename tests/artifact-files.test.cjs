'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {existingArtifactFiles}=require('../desktop/services/artifact-files.cjs')
test('only existing workspace files become cards; deleted paths, directories and escaped links do not',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-artifacts-')),workspace=path.join(root,'work'),outside=path.join(root,'outside')
 fs.mkdirSync(workspace);fs.mkdirSync(outside)
 const file=path.join(workspace,'probe.txt'),other=path.join(outside,'private.txt'),link=path.join(workspace,'link')
 fs.writeFileSync(file,'test');fs.writeFileSync(other,'outside');fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir')
 try {
  assert.deepEqual(existingArtifactFiles([file,file,other,workspace,path.join(link,'private.txt'),null],workspace),[file])
  fs.unlinkSync(file)
  assert.deepEqual(existingArtifactFiles([file],workspace),[])
  assert.deepEqual(existingArtifactFiles('not an array',workspace),[])
 } finally {fs.unlinkSync(link);fs.rmSync(root,{recursive:true,force:true})}
})
