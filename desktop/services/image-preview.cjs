'use strict'
const fs=require('node:fs'),path=require('node:path')
const {inspectArtifactAsync}=require('./image-artifacts.cjs')
async function readImagePreview(file,nativeImage){
  const extension=path.extname(file).toLowerCase(),format={'.png':'png','.jpg':'jpeg','.jpeg':'jpeg','.webp':'webp','.svg':'svg','.gif':'gif'}[extension]
  if(!format||!fs.statSync(file).isFile()||fs.statSync(file).size>20*1024*1024)throw Error('预览支持 20 MB 以内的 PNG、JPEG、WebP、SVG、GIF。')
  const bytes=fs.readFileSync(file),info=await inspectArtifactAsync(bytes,format,nativeImage)
  return {path:file,name:path.basename(file),...info,previewUrl:`data:${info.mimeType};base64,${bytes.toString('base64')}`}
}
module.exports={readImagePreview}
