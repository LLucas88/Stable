'use strict'

// Success means each editor was saved, already clean, or explicitly retained
// in a verified recovery file. A rejected write never grants permission to quit.
async function prepareEditorQuit({editors,dialog,getWindow}) {
  const show = options => {
    const window=getWindow?.()
    return window&&!window.isDestroyed()?dialog.showMessageBox(window,options):dialog.showMessageBox(options)
  }
  try{await editors.flushAll({closing:true});return true}
  catch(error){
    const choice=await show({type:'warning',message:'部分编辑无法写入原文件',
      detail:error.message+'\n\n可以取消退出继续处理，或保留恢复草稿后退出。后者不会覆盖有冲突的原文件；已关闭页面只能保留此前采集到的编辑内容。',
      buttons:['取消退出','保留草稿并退出'],defaultId:0,cancelId:0,noLink:true})
    if(choice.response!==1)return false
    try{await editors.flushAll({closing:true,preserveDrafts:true});return true}
    catch(failure){await show({type:'error',message:'草稿未能安全保存，已取消退出',detail:failure.message});return false}
  }
}
module.exports={prepareEditorQuit}
