'use strict'
const fs=require('node:fs'),path=require('node:path')
const {resolveWorkspaceEntry}=require('./preview.cjs')
// A selected attachment grants access to that file, never to its entire parent folder.
class AttachmentPreviews {
  constructor(){this.grants=new Map()}
  register(conversationId,files){
    let entries=this.grants.get(conversationId);if(!entries)this.grants.set(conversationId,entries=new Map())
    for(const file of files){if(file.type==='folder'||file.type==='skill')continue;const absolute=path.resolve(file.path),real=fs.realpathSync(absolute);entries.set(absolute.toLowerCase(),real)}
    return files
  }
  roots(conversationId,file,roots){
    const expected=this.grants.get(conversationId)?.get(path.resolve(String(file)).toLowerCase())
    if(!expected)return roots
    if(fs.realpathSync(file)!==expected)throw Error('上传文件的位置已改变，请重新添加。')
    resolveWorkspaceEntry(expected,path.dirname(expected),{fileOnly:true})
    return [...new Set([...roots,path.dirname(expected)])]
  }
  resourceRoots(conversationId,file){return file?this.roots(conversationId,file,[]):[]}
}
module.exports={AttachmentPreviews}
