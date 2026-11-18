'use strict'
function sendIpc(target,message){
  return new Promise(resolve=>{
    if(!target?.connected||typeof target.send!=='function')return resolve(false)
    const timer=setTimeout(()=>resolve(false),3000);timer.unref?.()
    try{target.send(message,error=>{clearTimeout(timer);resolve(!error)})}catch{clearTimeout(timer);resolve(false)}
  })
}
function confirmRestart(target,id,timeoutMs=3000){
  return new Promise(resolve=>{
    const finish=value=>{clearTimeout(timer);target.removeListener('message',message);target.removeListener('disconnect',disconnect);resolve(value)}
    const message=m=>{if(m?.type==='stable:dev:restart-confirmed'&&m.id===id)finish(true)}
    const disconnect=()=>finish(false)
    const timer=setTimeout(()=>finish(false),timeoutMs)
    target.on('message',message);target.once('disconnect',disconnect)
    void sendIpc(target,{type:'stable:dev:restart-request',id}).then(ok=>{if(!ok)finish(false)})
  })
}
module.exports={sendIpc,confirmRestart}
