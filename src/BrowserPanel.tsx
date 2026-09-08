import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Plus, RotateCw, X, Download, History, Hand, Globe2, FileText, Maximize2, Minimize2, PanelRightClose, MessageSquarePlus, List } from 'lucide-react'
import type { PreviewState } from './types'

type Tab = { id:string; title:string; url:string; state:string; error?:string; blockedURL?:string; diagnostics:boolean;blockedSites?:string[];loading?:boolean;canGoBack?:boolean;canGoForward?:boolean }
type Target = { kind:'web'|'file';value:string;title:string;requestId:number }
type FileTab = { id:string;value:string;title:string }
type PanelSession = { files:FileTab[];selected?:string;order:string[];width:number;expanded:boolean;requestId?:number }
// Keep each conversation's open documents and layout when its panel is collapsed or unmounted.
const panels = new Map<string, PanelSession>()
let nativeOperations = Promise.resolve<unknown>(undefined)
function nativeOperation(operation:()=>Promise<unknown>) {
  nativeOperations = nativeOperations.catch(()=>{}).then(operation)
  return nativeOperations
}
const emptyPreview = ():PreviewState => ({url:'',title:'',loading:false,canGoBack:false,canGoForward:false})
export function BrowserPanel({ conversationId, initialURL, initialTarget, onClose, onImport, obscured }: { conversationId:string; initialURL?:string; initialTarget?:Target; obscured?:boolean; onClose:()=>void; onImport:(value:any)=>void }) {
  const [state,setState]=useState<{tabs:Tab[];activeTabId?:string;downloads:any[]}>({tabs:[],downloads:[]})
  const [panel,setPanel]=useState<PanelSession>(()=>panels.get(conversationId)||{files:[],order:[],width:0,expanded:false})
  const panelRef=useRef(panel)
  function changePanel(update:(value:PanelSession)=>PanelSession) {const next=update(panelRef.current);panelRef.current=next;panels.set(conversationId,next);setPanel(next)}
  const [url,setURL]=useState(''),[error,setError]=useState(''),[section,setSection]=useState('page'),[history,setHistory]=useState<any>({history:[],annotations:[]}),[settings,setSettings]=useState<any>({}),[note,setNote]=useState('')
  const [annotating,setAnnotating]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState('')
  const annotationSession=useRef<string>(),annotationGeneration=useRef(0)
  const pendingAnnotations=useRef<any[]>([]),annotationPoll=useRef<Promise<any>>()
  const [annotationCount,setAnnotationCount]=useState(0),[addingDraft,setAddingDraft]=useState(false)
  const [ready,setReady]=useState(false),[fileState,setFileState]=useState<PreviewState>(emptyPreview),[reload,setReload]=useState(0),[resizing,setResizing]=useState(false)
  const viewport=useRef<HTMLDivElement>(null),pane=useRef<HTMLElement>(null),mounted=useRef(true)
  const file=panel.files.find(t=>t.id===panel.selected)
  const tab=state.tabs.find(t=>t.id===panel.selected)
  const api=(action:string,rest:Record<string,unknown>={})=>window.stable.browser.command({conversationId,action,...rest})
  const adopt=(next:typeof state,select=false)=>{
    if(!mounted.current)return
    setState(next)
    changePanel(p=>{const ids=[...p.files.map(t=>t.id),...next.tabs.map(t=>t.id)];return {...p,order:[...p.order.filter(id=>ids.includes(id)),...ids.filter(id=>!p.order.includes(id))],selected:select?next.activeTabId:ids.includes(p.selected||'')?p.selected:next.activeTabId||p.files[0]?.id}})
  }
  const refresh=async()=>{const next=await api('state');adopt(next)}
  const perform=async(action:string,rest:Record<string,unknown>={})=>{try{setError('');const result=await api(action,rest);if(result?.tabs)adopt(result,action==='create');return result}catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{mounted.current=true;void refresh().then(()=>setReady(true)).catch(e=>{setError(String(e));setReady(true)});const off=window.stable.browser.onChanged(()=>{void refresh().catch(()=>{})});return()=>{mounted.current=false;off()}},[conversationId])
  useEffect(()=>{
    if(!ready)return
    const target=initialTarget||(initialURL?{kind:'web' as const,value:initialURL,title:initialURL,requestId:-1}:undefined)
    if(!target||panelRef.current.requestId===target.requestId)return
    changePanel(p=>({...p,requestId:target.requestId}))
    setSection('page')
    if(target.kind==='file')openFile(target.value,target.title)
    else {const existing=state.tabs.find(t=>t.url===target.value);if(existing)select(existing.id);else void perform('create',{url:target.value})}
  },[ready,initialTarget?.requestId,initialURL])
  useEffect(()=>{setURL(file?.value||(tab?.url==='about:blank'?'':tab?.url||''));setError('')},[panel.selected,file?.value,tab?.url])
  useEffect(()=>{
    let cancelled=false
    const element=viewport.current
    const hide=async()=>{await Promise.all([api('hide'),window.stable.preview?.close()])}
    if(!element||section!=='page'||obscured||resizing||(!file&&!tab)||tab?.url==='about:blank'){void nativeOperation(hide);return}
    const bounds=()=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:Math.max(1,r.width),height:Math.max(1,r.height)}}
    let opened=false
    setFileState(emptyPreview())
    const off=file?window.stable.preview.onEvent(next=>{if(!cancelled)setFileState(next)}):()=>{}
    void nativeOperation(async()=>{
      if(cancelled)return
      await hide();if(cancelled)return
      if(file){setFileState({...emptyPreview(),loading:true});const result=await window.stable.preview.openFile(file.value,bounds());if(!cancelled)setFileState(result)}
      else await api('show',{tabId:tab!.id,bounds:bounds()})
      opened=true
    }).catch(e=>{if(!cancelled){setError(String(e));setFileState(emptyPreview())}})
    // Native child views do not follow DOM layout. Track position as well as size,
    // including layout changes which happened while the document was loading.
    let frame=0,lastBounds='',updating=false
    const sync=()=>{
      if(cancelled)return
      const next=bounds(),key=JSON.stringify(next)
      if(opened&&!updating&&key!==lastBounds){
        updating=true
        void nativeOperation(async()=>{if(cancelled)return;if(file)await window.stable.preview.setBounds(next);else await api('show',{tabId:tab!.id,bounds:next});lastBounds=key})
          .catch(e=>{if(!cancelled)setError(String(e))}).finally(()=>{updating=false})
      }
      frame=window.requestAnimationFrame(sync)
    }
    frame=window.requestAnimationFrame(sync)
    return()=>{cancelled=true;off();window.cancelAnimationFrame(frame);void hide().catch(()=>{})}
  },[panel.selected,section,obscured,resizing,reload,tab?.url==='about:blank'])
  async function stopAnnotation(){annotationGeneration.current++;const id=annotationSession.current;annotationSession.current=undefined;setAnnotating(false);if(id)await api('annotationStop',{sessionId:id}).catch(()=>{})}
  useEffect(()=>{return()=>{void stopAnnotation()}},[panel.selected,section,obscured,resizing])
  async function toggleAnnotation(restart=false){
    if(annotating&&!restart){await stopAnnotation();return}
    const generation=++annotationGeneration.current
    pendingAnnotations.current=[];setAnnotationCount(0);setNotice('');setError('');setAnnotating(true)
    try{
      const result=await api('annotationStart',file?{filePath:file.value}:{tabId:tab?.id})
      if(generation!==annotationGeneration.current){await api('annotationStop',{sessionId:result.sessionId});return}
      annotationSession.current=result.sessionId
      const poll=async()=>{
        if(generation!==annotationGeneration.current)return
        try{
          const operation=api('annotationPoll',{sessionId:result.sessionId}).then(next=>{if(next?.attachment&&annotationSession.current===result.sessionId){pendingAnnotations.current.push(next.attachment);setAnnotationCount(pendingAnnotations.current.length)}return next})
          annotationPoll.current=operation
          const next=await operation
          if(generation!==annotationGeneration.current)return
          if(next?.ended){annotationSession.current=undefined;setAnnotating(false);return}
          window.setTimeout(()=>void poll(),200)
        }catch(e){setError(String(e));await stopAnnotation()}
      }
      void poll()
    }catch(e){setError(String(e));setAnnotating(false)}
  }
  async function addAnnotationDraft(){
    if(addingDraft)return
    setAddingDraft(true);annotationGeneration.current++
    try{
      await annotationPoll.current
      const id=annotationSession.current
      if(id){for(;;){const next=await api('annotationPoll',{sessionId:id});if(!next?.attachment)break;pendingAnnotations.current.push(next.attachment)}}
      await stopAnnotation()
      for(const attachment of pendingAnnotations.current)onImport(attachment)
      pendingAnnotations.current=[];setAnnotationCount(0);changePanel(p=>({...p,expanded:false}));setNotice('注释已加入输入框草稿，发送任务时一起提交。');window.requestAnimationFrame(()=>document.getElementById('agent-prompt')?.focus())
    }catch(e){setError(String(e));await stopAnnotation()}finally{setAddingDraft(false)}
  }
  async function saveCurrent(){
    setSaving(true);setNotice('');setError('');await stopAnnotation()
    try{const result=await api('saveCurrent',file?{filePath:file.value}:{tabId:tab?.id});if(result?.path){setNotice('已保存到：'+result.path);await refresh()}}catch(e){setError(String(e))}finally{setSaving(false)}
  }
  function select(id:string){changePanel(p=>({...p,selected:id}));setSection('page')}
  function openFile(value:string,title:string){changePanel(p=>{const existing=p.files.find(t=>t.value.toLowerCase()===value.toLowerCase());const id=existing?.id||'file:'+crypto.randomUUID();return{...p,selected:id,files:existing?p.files:[...p.files,{id,value,title}],order:existing?p.order:[...p.order,id]}});setSection('page')}
  async function closeTab(id:string){
    if(panel.files.some(t=>t.id===id))changePanel(p=>{const order=p.order.filter(key=>key!==id),index=p.order.indexOf(id);return {...p,files:p.files.filter(t=>t.id!==id),order,selected:p.selected===id?order[Math.min(index,order.length-1)]:p.selected}})
    else await perform('close',{tabId:id})
  }
  function navigate(){
    const value=url.trim();if(!value)return
    if(/^[a-z]:[\\/]/i.test(value)||value.startsWith('\\\\'))openFile(value,value.split(/[\\/]/).pop()||value)
    else {if(/^[a-z][a-z\d+.-]*:/i.test(value)&&!/^https?:/i.test(value)){setError('请输入 HTTP、HTTPS 网址或本地文件路径。');return}const address=/^https?:\/\//i.test(value)?value:'https://'+value;void (tab?perform('navigate',{tabId:tab.id,navigation:'open',url:address}):perform('create',{url:address}));setSection('page')}
  }
  function resizeBy(delta:number){const available=pane.current?.parentElement?.clientWidth||800;changePanel(p=>({...p,expanded:false,width:Math.max(320,Math.min(Math.max(320,available-320),(p.width||available/2)+delta))}))}
  function startResize(event:ReactPointerEvent<HTMLDivElement>){event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);setResizing(true)}
  async function viewSection(next:string){setSection(next);if(next==='history')setHistory(await perform('history')||{history:[],annotations:[]});if(next==='downloads')setSettings(await perform('settings')||{})}
  const current=file?fileState:tab
  const ordered=panel.order.map(id=>({id,file:panel.files.find(t=>t.id===id),web:state.tabs.find(t=>t.id===id)})).filter(t=>t.file||t.web)
  return <aside ref={pane} className="shared-browser" data-expanded={panel.expanded||undefined} style={{'--browser-width':panel.width?`${panel.width}px`:'50%'} as CSSProperties} aria-label="共享浏览器">
    <div className="browser-resizer" role="separator" aria-label="调整浏览器面板宽度" aria-orientation="vertical" aria-valuenow={panel.width||Math.round((pane.current?.parentElement?.clientWidth||800)/2)} tabIndex={0} onPointerDown={startResize} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resizeBy(-e.movementX)}} onPointerUp={e=>{e.currentTarget.releasePointerCapture(e.pointerId);setResizing(false)}} onLostPointerCapture={()=>setResizing(false)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resizeBy(e.key==='ArrowLeft'?32:-32)}}}/>
    <header className="browser-tabbar">
      <div className="browser-tabs" role="tablist" aria-label="浏览器标签页">{ordered.map(t=><div key={t.id} data-active={t.id===panel.selected}><button role="tab" aria-selected={t.id===panel.selected} title={t.file?.value||t.web?.url} onClick={()=>select(t.id)}>{t.file?<FileText size={15}/>:<Globe2 size={15}/>}<span>{t.file?.title||t.web?.title||'新标签页'}</span></button><button aria-label={`关闭标签页 ${t.file?.title||t.web?.title||'新标签页'}`} onClick={()=>void closeTab(t.id)}><X size={13}/></button></div>)}</div>
      <button onClick={()=>{setSection('page');void perform('create')}} aria-label="新标签页" title="新标签页"><Plus size={17}/></button><span className="browser-toolbar-spacer"/><button onClick={()=>changePanel(p=>({...p,expanded:!p.expanded}))} aria-label={panel.expanded?'恢复分栏':'展开浏览器'} title={panel.expanded?'恢复分栏':'展开浏览器'}>{panel.expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button onClick={onClose} aria-label="收起浏览器" title="收起浏览器"><PanelRightClose size={17}/></button>
    </header>
    {annotating?<div className="browser-annotation-toolbar"><button aria-label="退出批注" disabled={addingDraft} onClick={()=>void stopAnnotation()}><X size={16}/></button><button disabled={addingDraft} onClick={()=>void stopAnnotation().then(()=>toggleAnnotation(true))}>清空</button><span title={url}>正在批注 · {file?.title||tab?.title}</span><button className="annotation-add-draft" disabled={!annotationCount||addingDraft} onClick={()=>void addAnnotationDraft()}>{addingDraft?'正在加入…':'加入草稿'} {annotationCount}</button></div>:<form className="browser-address" onSubmit={e=>{e.preventDefault();navigate()}}>
      <button type="button" disabled={!current?.canGoBack} aria-label="后退" onClick={()=>void (file?window.stable.preview.navigate('back'):perform('navigate',{tabId:tab?.id,navigation:'back'}))}><ArrowLeft size={16}/></button><button type="button" disabled={!current?.canGoForward} aria-label="前进" onClick={()=>void (file?window.stable.preview.navigate('forward'):perform('navigate',{tabId:tab?.id,navigation:'forward'}))}><ArrowRight size={16}/></button><button type="button" disabled={!file&&!tab} aria-label="重新加载" onClick={()=>file?setReload(v=>v+1):void perform('navigate',{tabId:tab?.id,navigation:'reload'})}><RotateCw className={current?.loading?'spin':undefined} size={16}/></button><input aria-label="网页地址" value={url} onChange={e=>setURL(e.target.value)} placeholder="输入网址或本地文件路径" onFocus={e=>e.target.select()}/>
      <button type="button" className="browser-annotate" disabled={(!file&&!tab)||section!=='page'||Boolean(current?.loading)} aria-label="添加注释" aria-pressed={annotating} onClick={()=>void toggleAnnotation()}><MessageSquarePlus size={16}/><span>{annotating?'正在注释':'添加注释'}</span></button>
      <button type="button" disabled={saving||(!file&&!tab)} aria-label="保存当前文件" title="保存当前文件" onClick={()=>void saveCurrent()}><Download size={16}/></button>
      <button type="button" aria-label="下载记录" aria-pressed={section==='downloads'} title="下载记录" onClick={()=>void viewSection(section==='downloads'?'page':'downloads')}><List size={16}/></button><button type="button" aria-label="历史与批注" aria-pressed={section==='history'} title="历史与批注" onClick={()=>void viewSection(section==='history'?'page':'history')}><History size={16}/></button>
    </form>}
    {section!=='page'&&<div className="browser-section-heading"><strong>{section==='downloads'?'下载记录':'历史与批注'}</strong><button onClick={()=>setSection('page')}>返回页面</button></div>}
    {error&&<p role="alert">{error}</p>}
    {notice&&<p className="browser-feedback" role="status">{notice}</p>}
    {tab?.state==='user_controlled'&&<p className="browser-notice">你正在控制页面。<button onClick={()=>void perform('control',{tabId:tab.id,user:false})}>交还模型</button></p>}
    {tab&&tab.state!=='user_controlled'&&tab.state==='agent_controlled'&&<p className="browser-notice">模型正在操作页面。<button onClick={()=>void perform('control',{tabId:tab.id,user:true})}><Hand size={14}/>接管页面</button></p>}
    {section==='page'&&<>{tab?.blockedSites?.map(origin=><p key={origin}>页面请求新站点：{origin}<button onClick={()=>void perform('permitSite',{origin})}>允许此站点</button></p>)}{(tab?.error||fileState.error)&&<p role="alert">{tab?.error||fileState.error}{tab?.blockedURL&&<button onClick={()=>void perform('navigate',{tabId:tab.id,navigation:'open',url:tab.blockedURL})}>允许访问此网站</button>}</p>}<div className="browser-viewport" ref={viewport} role="tabpanel" aria-label={file?.title||tab?.title||'新标签页'}>{!file&&(!tab||tab.url==='about:blank')&&<div className="browser-empty"><Globe2 size={30}/><strong>在此打开网页或文件</strong><span>在地址栏输入网址，或点击对话中的文件。</span></div>}{fileState.loading&&<p role="status">正在加载文档…</p>}</div></>}
    {section==='downloads'&&<div className="browser-records"><p>下载目录：{settings.directory||settings.defaultDirectory}<button onClick={()=>void perform('settings',{chooseDirectory:true}).then(s=>s&&setSettings(s))}>更改</button></p><label><input type="checkbox" checked={Boolean(settings.askEach)} onChange={e=>void perform('settings',{askEach:e.target.checked}).then(s=>s&&setSettings(s))}/>每次询问保存位置</label>{state.downloads.map(d=><article key={d.id}><strong>{d.name}</strong><p>{({completed:'已完成',downloading:'下载中',cancelled:'已取消',failed:'失败',interrupted:'中断',awaiting_permission:'等待下载许可',awaiting_location:'等待保存位置'} as Record<string,string>)[d.state]||d.state} · {d.receivedBytes} / {d.totalBytes||'未知'} 字节</p>{d.totalBytes>0&&<progress value={d.receivedBytes} max={d.totalBytes}/>}<p>{d.error}</p>{d.state==='completed'?<><button onClick={()=>void perform('revealDownload',{downloadId:d.id})}>文件位置</button><button onClick={()=>void perform('importDownload',{downloadId:d.id}).then(a=>a&&onImport(a))}>作为任务附件</button></>:<><button onClick={()=>void perform('cancelDownload',{downloadId:d.id})}>取消下载</button>{d.state==='awaiting_permission'&&<button onClick={()=>void perform('allowDownload',{downloadId:d.id})}>允许此次下载</button>}</>}</article>)}</div>}
    {section==='history'&&<div className="browser-records"><label><input type="checkbox" checked={Boolean(history.allowHistory)} onChange={e=>{const enabled=e.target.checked;void perform('allowHistory',{enabled});setHistory((h:any)=>({...h,allowHistory:enabled}))}}/>允许模型读取此对话的浏览历史</label><button onClick={()=>void perform('clearHistory').then(()=>viewSection('history'))}>清空此对话历史</button><button onClick={()=>void perform('revokeSites')}>撤销网站许可</button>{tab&&<><label><input type="checkbox" checked={tab.diagnostics} onChange={e=>void perform('diagnostics',{tabId:tab.id,enabled:e.target.checked})}/>允许此标签页的控制台诊断</label><textarea aria-label="页面批注" value={note} onChange={e=>setNote(e.target.value)} placeholder="为当前页面添加批注"/><button onClick={()=>void perform('annotate',{tabId:tab.id,text:note}).then(()=>{setNote('');void viewSection('history')})}>保存批注</button></>}{history.annotations.map((a:any)=><article key={a.id}><strong>{a.text}</strong><p>{a.url}</p></article>)}{history.history.map((h:any)=><article key={h.id}><button onClick={()=>{void perform('create',{url:h.url});setSection('page')}}>{h.title}</button><p>{h.url} · {h.time}</p></article>)}</div>}
  </aside>
}
