import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Folder, FolderPlus, Plus, Search, X } from 'lucide-react'
import type { AgentState, ProjectItem } from './types'

export function ProjectSelector({projects,projectId,conversationId,running,onUpdate,onOverlayChange}:{projects:ProjectItem[];projectId?:string|null;conversationId:string;running:boolean;onUpdate:(state:AgentState)=>void;onOverlayChange:(open:boolean)=>void}) {
  const [open,setOpen]=useState(false),[creating,setCreating]=useState(false),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const area=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const selected=projects.find(project=>project.id===projectId)
  useEffect(()=>{onOverlayChange(open||creating);return ()=>onOverlayChange(false)},[open,creating,onOverlayChange])
  useEffect(()=>{setOpen(false);setCreating(false);setError('')},[conversationId])
  useEffect(()=>{
    if(!open)return
    const close=(event:PointerEvent)=>{if(!area.current?.contains(event.target as Node))setOpen(false)}
    document.addEventListener('pointerdown',close)
    return ()=>document.removeEventListener('pointerdown',close)
  },[open])
  async function select(id:string|null){
    if(busy)return
    setBusy(true);setError('')
    try{onUpdate(await window.stable.projects.open(id,conversationId));setOpen(false)}catch(error){setError(error instanceof Error?error.message:'无法选择项目')}finally{setBusy(false)}
  }
  return <div className="project-selector" ref={area} onKeyDown={event=>{if(event.key==='Escape'&&!creating){setOpen(false);trigger.current?.focus()}}}>
    <button ref={trigger} type="button" className="project-trigger" aria-haspopup="dialog" aria-expanded={open} disabled={busy||running} onClick={()=>{setQuery('');setError('');setOpen(v=>!v)}} title={selected?.rootPath}><Folder size={17}/><span>{selected?.name||'选择项目'}</span><ChevronDown size={14}/></button>
    {open&&<div className="project-picker" role="dialog" aria-label="选择项目">
      <label className="project-search"><Search size={16}/><input autoFocus aria-label="搜索项目" placeholder="搜索项目" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="project-options">
        <button type="button" disabled={busy} onClick={()=>void select(null)}><Folder size={17}/><span>不使用项目<small>使用默认工作区</small></span>{!projectId&&<Check size={16}/>}</button>
        {projects.filter(project=>project.name.toLowerCase().includes(query.toLowerCase())||project.rootPath.toLowerCase().includes(query.toLowerCase())).map(project=><button type="button" disabled={busy} key={project.id} onClick={()=>void select(project.id)} title={project.folders?.map(folder=>folder.path).join('\n')||project.rootPath}><Folder size={17}/><span>{project.name}<small>{project.rootPath}</small></span>{project.id===projectId&&<Check size={16}/>}</button>)}
        {query&&!projects.some(project=>(project.name+' '+project.rootPath).toLowerCase().includes(query.toLowerCase()))&&<p className="project-empty">没有匹配的项目</p>}
      </div>
      {error&&<p role="alert" className="project-error">{error}</p>}
      <button className="project-create-action" type="button" disabled={busy} onClick={()=>{setOpen(false);setCreating(true)}}><Plus size={17}/>创建项目</button>
    </div>}
    {creating&&<CreateProjectDialog onClose={()=>{setCreating(false);trigger.current?.focus()}} onSave={async(name,folders)=>{
      const project=await window.stable.projects.create(name,folders)
      onUpdate(await window.stable.projects.open(project.id,conversationId))
    }}/>}
  </div>
}

export function CreateProjectDialog({onSave,onClose}:{onSave:(name:string,folders:string[])=>Promise<void>;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [name,setName]=useState(''),[folders,setFolders]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{dialog.current?.showModal()},[])
  async function addFolders(){
    setBusy(true);setError('')
    try {const values=await window.stable.projects.pickFolders();setFolders(current=>[...new Map([...current,...values].map(folder=>[folder.toLowerCase(),folder])).values()])}
    catch(error){setError(error instanceof Error?error.message:'无法添加文件夹')}finally{setBusy(false)}
  }
  async function save(){
    if(busy||!folders.length)return
    const title=name.trim()||folders[0].split(/[\\/]/).filter(Boolean).pop()||folders[0]
    setBusy(true);setError('')
    try{await onSave(title,folders);onClose()}catch(error){setError(error instanceof Error?error.message:'无法创建项目');setBusy(false)}
  }
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="project-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
    <form onSubmit={event=>{event.preventDefault();void save()}}>
      <button className="project-dialog-close" type="button" aria-label="关闭创建项目" disabled={busy} onClick={onClose}><X size={18}/></button>
      <h2 id="project-dialog-title">创建项目</h2>
      <label className="project-name"><Folder size={20}/><input autoFocus aria-label="项目名称" placeholder="项目名称" maxLength={80} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
      <h3>源文件夹</h3>
      <div className="project-folders">
        {folders.map(folder=><div className="project-folder" key={folder}><Folder size={20}/><span title={folder}>{folder.split(/[\\/]/).filter(Boolean).pop()||folder}<small>{folder}</small></span><button type="button" aria-label={'移除文件夹 '+folder} disabled={busy} onClick={()=>setFolders(current=>current.filter(value=>value!==folder))}><X size={16}/></button></div>)}
        <button className="project-folder-add" data-empty={!folders.length||undefined} type="button" disabled={busy||folders.length>=20} onClick={()=>void addFolders()}><FolderPlus size={21}/><span>{folders.length?'添加文件夹':'添加 Stable 可读取和编辑的文件夹'}</span></button>
      </div>
      {folders.length>1&&<p className="project-folder-hint">第一个文件夹用作工作目录和默认交付位置。</p>}
      {error&&<p className="project-error" role="alert">{error}</p>}
      <footer><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={busy||!folders.length}>{busy?'处理中…':'创建项目'}</button></footer>
    </form>
  </dialog>
}
