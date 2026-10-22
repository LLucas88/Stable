import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Folder, FolderPlus, Plus, Search, X } from 'lucide-react'
import type { AgentState, ProjectItem } from './types'
import './styles/project-selector.css'

export function ProjectSelector({projects,projectId,conversationId,running,onUpdate,onOverlayChange}:{projects:ProjectItem[];projectId?:string|null;conversationId:string;running:boolean;onUpdate:(state:AgentState)=>void;onOverlayChange:(open:boolean)=>void}) {
  const [open,setOpen]=useState(false),[creating,setCreating]=useState(false),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const area=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),picker=useRef<HTMLDivElement>(null)
  const pickerId=useId()
  const selected=projects.find(project=>project.id===projectId)
  const search=query.trim().toLowerCase()
  const filtered=projects.filter(project=>(project.name+' '+project.rootPath).toLowerCase().includes(search))
  useEffect(()=>{onOverlayChange(open||creating);return ()=>onOverlayChange(false)},[open,creating,onOverlayChange])
  useEffect(()=>{setOpen(false);setCreating(false);setError('')},[conversationId])
  useEffect(()=>{
    if(!open)return
    const close=(event:PointerEvent)=>{if(!area.current?.contains(event.target as Node)&&!picker.current?.contains(event.target as Node))setOpen(false)}
    document.addEventListener('pointerdown',close)
    return ()=>document.removeEventListener('pointerdown',close)
  },[open])
  useLayoutEffect(()=>{
    if(!open)return
    const position=()=>{
      const menu=picker.current,button=trigger.current
      if(!menu||!button)return
      const anchor=button.getBoundingClientRect(),margin=12,gap=6
      const above=Math.max(0,anchor.top-gap-margin),below=Math.max(0,innerHeight-anchor.bottom-gap-margin)
      const placeAbove=above>=300||above>=below
      menu.style.width=Math.min(270,innerWidth-margin*2)+'px'
      menu.style.maxHeight=Math.min(300,placeAbove?above:below)+'px'
      menu.style.left=Math.max(margin,Math.min(anchor.left,innerWidth-menu.offsetWidth-margin))+'px'
      menu.style.top=Math.max(margin,placeAbove?anchor.top-gap-menu.offsetHeight:anchor.bottom+gap)+'px'
    }
    position()
    window.addEventListener('resize',position)
    window.addEventListener('scroll',position,true)
    const observer=new ResizeObserver(position)
    if(trigger.current)observer.observe(trigger.current)
    if(picker.current)observer.observe(picker.current)
    return ()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);observer.disconnect()}
  },[open,query,projects,error])
  async function select(id:string|null){
    if(busy)return
    setBusy(true);setError('')
    try{onUpdate(await window.stable.projects.open(id,conversationId));setOpen(false);trigger.current?.focus()}catch(error){setError(error instanceof Error?error.message:'无法选择项目')}finally{setBusy(false)}
  }
  return <div className="project-selector" ref={area} onKeyDown={event=>{if(event.key==='Escape'&&!creating){setOpen(false);trigger.current?.focus()}}}>
    <button ref={trigger} type="button" className="project-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?pickerId:undefined} disabled={busy||running} onClick={()=>{setQuery('');setError('');setOpen(v=>!v)}} title={selected?.rootPath}><Folder size={17}/><span>{selected?.name||'选择项目'}</span><ChevronDown size={14}/></button>
    {open&&createPortal(<div ref={picker} id={pickerId} className="project-picker" role="dialog" aria-label="选择项目">
      <label className="project-search"><Search size={16}/><input autoFocus aria-label="搜索项目" placeholder="搜索项目" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="project-options">
        {filtered.map(project=><button type="button" disabled={busy} key={project.id} aria-pressed={project.id===projectId} onClick={()=>void select(project.id)} title={project.folders?.map(folder=>folder.path).join('\n')||project.rootPath}><Folder size={16}/><span>{project.name}</span>{project.id===projectId&&<Check size={16}/>}</button>)}
        {!filtered.length&&<p className="project-empty">{search?'没有匹配的项目':'还没有项目'}</p>}
      </div>
      {error&&<p role="alert" className="project-error">{error}</p>}
      <div className="project-picker-footer">
        <button className="project-create-action" type="button" disabled={busy} onClick={()=>{setOpen(false);setCreating(true)}}><Plus size={16}/>新建项目</button>
        <button className="project-none-action" type="button" disabled={busy} aria-pressed={!projectId} onClick={()=>void select(null)}><X size={16}/><span>不在项目中工作</span>{!projectId&&<Check size={16}/>}</button>
      </div>
    </div>,document.body)}
    {creating&&<CreateProjectDialog onClose={()=>{setCreating(false);trigger.current?.focus()}} onSave={async(name,folders)=>{
      const project=await window.stable.projects.create(name,folders)
      onUpdate(await window.stable.projects.open(project.id,conversationId))
    }}/>}
  </div>
}

export function CreateProjectDialog({onSave,onClose}:{onSave:(name:string,folders:string[])=>Promise<void>;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),nameInput=useRef<HTMLInputElement>(null)
  const [name,setName]=useState(''),[folders,setFolders]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{dialog.current?.showModal();nameInput.current?.focus()},[])
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
      <label className="project-name"><span className="project-name-icon"><Folder size={16}/></span><input ref={nameInput} autoFocus aria-label="项目名称" placeholder="项目名称" maxLength={80} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
      <h3>源文件夹</h3>
      <div className="project-folders" data-empty={!folders.length||undefined}>
        {folders.map(folder=><div className="project-folder" key={folder}><Folder size={20}/><span title={folder}>{folder.split(/[\\/]/).filter(Boolean).pop()||folder}<small>{folder}</small></span><button type="button" aria-label={'移除文件夹 '+folder} disabled={busy} onClick={()=>setFolders(current=>current.filter(value=>value!==folder))}><X size={16}/></button></div>)}
        {!folders.length&&<p className="project-folder-prompt">在此电脑上添加文件夹</p>}
        <button className="project-folder-add" type="button" disabled={busy||folders.length>=20} onClick={()=>void addFolders()}><FolderPlus size={16}/><span>{folders.length?'添加文件夹':'添加'}</span></button>
      </div>
      {folders.length>1&&<p className="project-folder-hint">第一个文件夹用作工作目录和默认交付位置。</p>}
      {error&&<p className="project-error" role="alert">{error}</p>}
      <footer><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={busy||!folders.length}>{busy?'处理中…':'创建项目'}</button></footer>
    </form>
  </dialog>
}
