'use strict'
function closeStoreOnQuit(app,getStore){
  app.once('will-quit',()=>{const store=getStore();store?.recoverInterruptedRuns();store?.close()})
}
module.exports={closeStoreOnQuit}
