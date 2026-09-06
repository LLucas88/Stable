 'use strict'
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
const {directoryIdentity}=require('./conversation-state.cjs')
function safeName(value){return String(value||'download').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').replace(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i,'_$1$2').slice(0,180)||'download'}
class BrowserDownloads {
  constructor({store,electron,onChange,tabForContents,allowed}) { Object.assign(this,{store,electron,onChange,tabForContents,allowed});this.live=new Map();this.items=store.getSetting('browser-downloads-v2')||[];for(const item of this.items)if(!['completed','cancelled','failed','interrupted'].includes(item.state)){item.state='interrupted';item.error='应用关闭时下载尚未完成。'}this.persist() }
  persist(){this.store.setSetting('browser-downloads-v2',this.items);this.onChange?.()}
  list(id){return this.items.filter(item=>!id||item.conversationId===id).map(({temporary,...item})=>item)}
  async begin(event,item,contents){
    const tab=this.tabForContents(contents)
    if(!tab){event.preventDefault();return}
    const id=randomUUID(), settings=this.store.getSetting('browser-download-settings')||{},directory=settings.directory||this.electron.app.getPath('downloads')
    let identity,temporary
    try{identity=directoryIdentity(directory);temporary=path.join(identity.path,`.stable-download-${id}.part`);if(fs.existsSync(temporary))throw Error('下载临时文件冲突');item.setSavePath(temporary);item.pause()}catch(error){event.preventDefault();return}
    const record={id,conversationId:tab.conversationId,sourceTabId:tab.id,runId:tab.runId||null,profileId:'stable-browser-v2',name:safeName(item.getFilename()),source:item.getURLChain().map(url=>{try{const u=new URL(url);return u.origin+u.pathname}catch{return ''}}),directory:identity.path,identity:identity.identity,temporary,askEach:Boolean(settings.askEach),state:'awaiting_location',receivedBytes:0,totalBytes:item.getTotalBytes(),createdAt:new Date().toISOString()}
    this.items.unshift(record);this.live.set(id,item);this.persist()
    item.on('updated',(_event,state)=>{record.receivedBytes=item.getReceivedBytes();record.totalBytes=item.getTotalBytes();if(state==='interrupted')record.state='interrupted';else if(!item.isPaused())record.state='downloading';this.persist()})
    item.once('done',(_event,state)=>{
      this.live.delete(id);record.state=state==='completed'?'completed':state==='cancelled'?'cancelled':'interrupted'
      try {
        if(directoryIdentity(record.directory).identity!==record.identity)throw Error('下载目录身份变化，未发布文件。')
        if(state==='completed'){
          const stat=fs.lstatSync(temporary);if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==item.getReceivedBytes())throw Error('下载文件落盘大小核验失败。')
          const destination=record.destination||path.join(record.directory,record.name)
          const parent=directoryIdentity(path.dirname(destination));if(record.destinationIdentity && parent.identity!==record.destinationIdentity)throw Error('所选目录身份变化。')
          let target=destination;const ext=path.extname(destination),base=destination.slice(0,destination.length-ext.length)
          for(let n=1;;n++){try{fs.copyFileSync(temporary,target,fs.constants.COPYFILE_EXCL);break}catch(error){if(error.code!=='EEXIST')throw error;target=`${base} (${n})${ext}`}}
          record.path=target;record.bytes=stat.size;const published=fs.statSync(target);record.fileIdentity={ino:published.ino,size:published.size,mtimeMs:published.mtimeMs}
        }
        if(fs.existsSync(temporary))fs.unlinkSync(temporary)
      }catch(error){record.state='failed';record.error=error.message}
      record.completedAt=new Date().toISOString();this.persist()
    })
    const denied=item.getURLChain().find(url=>!this.allowed(tab,url))
    if(denied){record.state='awaiting_permission';record.error='下载来源尚未获本站点许可。';this.persist();return}
    await this.resume(record,item)
  }
  async resume(record,item){
    if(record.askEach&&!record.destination){const result=await this.electron.dialog.showSaveDialog({title:'选择下载位置',defaultPath:path.join(record.directory,record.name)});if(result.canceled||!result.filePath){item.cancel();return}record.destination=result.filePath;record.destinationIdentity=directoryIdentity(path.dirname(result.filePath)).identity}
    if(this.live.has(record.id)){record.state='downloading';record.error='';item.resume();this.persist()}
  }

  cancel(id){const item=this.live.get(id);if(item)item.cancel()}
  async allow(id){const item=this.live.get(id),record=this.items.find(r=>r.id===id);if(!item||record?.state!=='awaiting_permission')throw Error('下载已结束或不在等待许可。');await this.resume(record,item)}
  import(id,workspace){const record=this.items.find(r=>r.id===id&&r.state==='completed');if(!record?.path)throw Error('文件尚未下载完成。');const stat=fs.lstatSync(record.path);if(stat.isSymbolicLink()||!stat.isFile()||record.fileIdentity&&(stat.ino!==record.fileIdentity.ino||stat.size!==record.fileIdentity.size||stat.mtimeMs!==record.fileIdentity.mtimeMs))throw Error('下载文件已变化，请重新选择文件上传。');const {materializeAttachment}=require('./attachments.cjs');return materializeAttachment(record.path,path.join(workspace,'.stable','downloads'),workspace)}
}
module.exports={BrowserDownloads,safeName}
