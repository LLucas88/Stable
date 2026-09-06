import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
export function RemoveDialog({name,kind,onConfirm,onClose}:{name:string;kind:'conversation'|'project';onConfirm:()=>Promise<void>;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const label=kind==='project'?'移除项目':'删除对话'
  useEffect(()=>{dialog.current?.showModal()},[])
  async function confirm(){
    if(busy)return
    setBusy(true);setError('')
    try{await onConfirm();onClose()}catch(error){setError(error instanceof Error?error.message:'操作失败，请重试');setBusy(false)}
  }
  return <dialog ref={dialog} className="remove-dialog" aria-labelledby="remove-dialog-title" aria-describedby="remove-dialog-description" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
    <button type="button" className="remove-dialog-close" aria-label="关闭确认弹窗" disabled={busy} onClick={onClose}><X size={18}/></button>
    <h2 id="remove-dialog-title">{kind==='project'?'移除':'删除'} {name}？</h2>
    <p id="remove-dialog-description">{kind==='project'?'这只会从应用中移除该项目。你电脑上的文件和现有聊天不会被删除。':'这会删除该对话及其消息记录，无法撤销。你电脑上已生成的文件不会被删除。'}</p>
    {error&&<p className="remove-dialog-error" role="alert">{error}</p>}
    <footer><button type="button" autoFocus disabled={busy} onClick={onClose}>取消</button><button type="button" className="remove-dialog-confirm" disabled={busy} onClick={()=>void confirm()}>{busy?'处理中…':label}</button></footer>
  </dialog>
}
