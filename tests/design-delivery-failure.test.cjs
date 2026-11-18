'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {designDeliveryFailure}=require('../desktop/services/design-delivery.cjs')
test('zero deliverables do not instruct users to preview nonexistent images or change dimensions',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-failure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 for(const files of [[],[path.join(dir,'missing.png')]]){
  const message=designDeliveryFailure({files,errors:['需要 1 张成品，实际提供 0 张。']},'供应商拒绝请求')
  assert.match(message,/没有可交付或预览/);assert.match(message,/供应商拒绝/);assert.doesNotMatch(message,/选择尺寸|文件仅供预览|\]\(/)
 }
 const file=path.join(dir,'preview.png');fs.writeFileSync(file,'fixture')
 assert.match(designDeliveryFailure({files:[file],errors:['尺寸不符']},'保留原图'),/\[preview.png\]/)
})
