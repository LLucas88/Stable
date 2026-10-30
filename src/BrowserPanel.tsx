import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Plus, RotateCw, X, Download, History, Hand, Globe2, FileText, Maximize2, Minimize2, PanelRightClose, List, Pencil, Scan } from 'lucide-react'
import type { PreviewState } from './types'

type Tab = { sourcePath?:string; id:string; title:string; url:string; state:string; error?:string; blockedURL?:string; diagnostics:boolean;blockedSites?:string[];loading?:boolean;canGoBack?:boolean;canGoForward?:boolean }
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
export function BrowserPanel({ conversationId, initialURL, initialTarget, onClose, onImport, onEditRequest, obscured }: { conversationId:string; initialURL?:string; initialTarget?:Target; obscured?:boolean; onClose:()=>void; onImport:(value:any)=>void; onEditRequest?:(value:{prompt:string;send:boolean;attachments:any[]})=>Promise<void>|void }) {
  const [state,setState]=useState<{tabs:Tab[];activeTabId?:string;downloads:any[]}>({tabs:[],downloads:[]})
  const [panel,setPanel]=useState<PanelSession>(()=>panels.get(conversationId)||{files:[],order:[],width:0,expanded:false})
  const panelRef=useRef(panel)
  function changePanel(update:(value:PanelSession)=>PanelSession) {const next=update(panelRef.current);panelRef.current=next;panels.set(conversationId,next);setPanel(next)}
  const [url,setURL]=useState(''),[error,setError]=useState(''),[section,setSection]=useState('page'),[history,setHistory]=useState<any>({history:[]}),[settings,setSettings]=useState<any>({})
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState('')
  const [editor,setEditor]=useState<any>(null),[editorBusy,setEditorBusy]=useState(false)
  const pendingEditor=useRef<string>(),editorRef=useRef<any>(null)
  function adoptEditor(value:any){editorRef.current=value;setEditor(value)}
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
    adoptEditor(null)
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
      if(file){const value=await api('editorState',{filePath:file.value});if(!cancelled)adoptEditor(value?.sessionId?value:null)}else if(!cancelled)adoptEditor(null)
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
  useEffect(()=>{
    if(!editor?.sessionId)return
    let cancelled=false,timer=0
    const poll=async()=>{try{const value=await api('editorPoll',{sessionId:editor.sessionId});if(cancelled)return;adoptEditor(value);for(const request of value.deliveries||[]){if(onEditRequest)await onEditRequest(request);else for(const attachment of request.attachments)onImport(attachment);await api('editorAck',{sessionId:editor.sessionId,deliveryId:request.id});if(cancelled)return;changePanel(p=>({...p,expanded:false}));setNotice('选区已加入聊天草稿。')}}catch(e){if(!cancelled)setError(String(e))}finally{if(!cancelled)timer=window.setTimeout(()=>void poll(),300)}}
    void poll();return()=>{cancelled=true;window.clearTimeout(timer)}
  },[editor?.sessionId,conversationId])
  useEffect(()=>{if(pendingEditor.current===file?.value&&!fileState.loading&&fileState.url){pendingEditor.current=undefined;void toggleEditor()}},[file?.value,fileState.loading,fileState.url])
  async function toggleEditor(){
    if(editorBusy)return
    if(!file&&tab?.sourcePath){pendingEditor.current=tab.sourcePath;openFile(tab.sourcePath,tab.sourcePath.split(/[\\/]/).pop()||tab.title);return}
    setEditorBusy(true);setError('')
    try{if(editorRef.current?.sessionId){await api('editorStop',{sessionId:editorRef.current.sessionId});adoptEditor(null)}else if(file)adoptEditor(await api('editorStart',{filePath:file.value}))}catch(e){setError(String(e))}finally{setEditorBusy(false)}
  }
  async function editorAction(action:string){setError('');try{const result=await api(action,{sessionId:editorRef.current?.sessionId});if(action==='editorReload'&&result){adoptEditor(null);setReload(v=>v+1)}else if(result?.sessionId)adoptEditor(result);if(result?.path)setNotice('已保存到：'+result.path)}catch(e){setError(String(e))}}
  async function saveCurrent(){
    if(editorRef.current?.sessionId){await editorAction('editorExport');return}
    setSaving(true);setNotice('');setError('')
    try{const result=await api('saveCurrent',file?{filePath:file.value}:{tabId:tab?.id});if(result?.path){setNotice('已保存到：'+result.path);await refresh()}}catch(e){setError(String(e))}finally{setSaving(false)}
  }
  function select(id:string){changePanel(p=>({...p,selected:id}));setSection('page')}
  function openFile(value:string,title:string){changePanel(p=>{const existing=p.files.find(t=>t.value.toLowerCase()===value.toLowerCase());const id=existing?.id||'file:'+crypto.randomUUID();return{...p,selected:id,files:existing?p.files:[...p.files,{id,value,title}],order:existing?p.order:[...p.order,id]}});setSection('page')}
  async function closeTab(id:string){
    const closing=panel.files.find(t=>t.id===id)
    if(closing){try{const session=await api('editorState',{filePath:closing.value});if(session?.sessionId)await api('editorStop',{sessionId:session.sessionId})}catch(e){setError(String(e));return}}
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
  async function viewSection(next:string){setSection(next);if(next==='history')setHistory(await perform('history')||{history:[]});if(next==='downloads')setSettings(await perform('settings')||{})}
  const current=file?fileState:tab
  const ordered=panel.order.map(id=>({id,file:panel.files.find(t=>t.id===id),web:state.tabs.find(t=>t.id===id)})).filter(t=>t.file||t.web)
  return <aside ref={pane} className="shared-browser" data-expanded={panel.expanded||undefined} style={{'--browser-width':panel.width?`${panel.width}px`:'50%'} as CSSProperties} aria-label="共享浏览器">
    <div className="browser-resizer" role="separator" aria-label="调整浏览器面板宽度" aria-orientation="vertical" aria-valuenow={panel.width||Math.round((pane.current?.parentElement?.clientWidth||800)/2)} tabIndex={0} onPointerDown={startResize} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resizeBy(-e.movementX)}} onPointerUp={e=>{e.currentTarget.releasePointerCapture(e.pointerId);setResizing(false)}} onLostPointerCapture={()=>setResizing(false)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resizeBy(e.key==='ArrowLeft'?32:-32)}}}/>
    <header className="browser-tabbar">
      <div className="browser-tabs" role="tablist" aria-label="浏览器标签页">{ordered.map(t=><div key={t.id} data-active={t.id===panel.selected}><button role="tab" aria-selected={t.id===panel.selected} title={t.file?.value||t.web?.url} onClick={()=>select(t.id)}>{t.file?<FileText size={15}/>:<Globe2 size={15}/>}<span>{t.file?.title||t.web?.title||'新标签页'}</span></button><button aria-label={`关闭标签页 ${t.file?.title||t.web?.title||'新标签页'}`} onClick={()=>void closeTab(t.id)}><X size={13}/></button></div>)}</div>
      <button onClick={()=>{setSection('page');void perform('create')}} aria-label="新标签页" title="新标签页"><Plus size={17}/></button><span className="browser-toolbar-spacer"/><button onClick={()=>changePanel(p=>({...p,expanded:!p.expanded}))} aria-label={panel.expanded?'恢复分栏':'展开浏览器'} title={panel.expanded?'恢复分栏':'展开浏览器'}>{panel.expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button onClick={onClose} aria-label="收起浏览器" title="收起浏览器"><PanelRightClose size={17}/></button>
    </header>
    <form className="browser-address" onSubmit={e=>{e.preventDefault();navigate()}}>
      <button type="button" disabled={!current?.canGoBack} aria-label="后退" onClick={()=>void (file?window.stable.preview.navigate('back'):perform('navigate',{tabId:tab?.id,navigation:'back'}))}><ArrowLeft size={16}/></button><button type="button" disabled={!current?.canGoForward} aria-label="前进" onClick={()=>void (file?window.stable.preview.navigate('forward'):perform('navigate',{tabId:tab?.id,navigation:'forward'}))}><ArrowRight size={16}/></button><button type="button" disabled={!file&&!tab} aria-label="重新加载" onClick={()=>editorRef.current?.sessionId?void editorAction('editorReload'):file?setReload(v=>v+1):void perform('navigate',{tabId:tab?.id,navigation:'reload'})}><RotateCw className={current?.loading?'spin':undefined} size={16}/></button><input aria-label="网页地址" value={url} onChange={e=>setURL(e.target.value)} placeholder="输入网址或本地文件路径" onFocus={e=>e.target.select()}/>
      {editor&&section==='page'&&<button type="button" aria-label="区域 AI 编辑" title="区域 AI 编辑：框选后描述新增内容" onClick={()=>void editorAction('editorRegion')}><Scan size={16}/></button>}
      {(file&&/\.html?$/i.test(file.value)||tab?.sourcePath)&&<button type="button" disabled={editorBusy||section!=='page'||Boolean(current?.loading)} aria-label="可视化编辑" aria-pressed={Boolean(editor)} title={editor?'退出编辑':'编辑本地 HTML'} onClick={()=>void toggleEditor()}><Pencil size={16}/></button>}
      <button type="button" disabled={saving||(!file&&!tab)} aria-label="保存当前文件" title="保存当前文件" onClick={()=>void saveCurrent()}><Download size={16}/></button>
      <button type="button" aria-label="下载记录" aria-pressed={section==='downloads'} title="下载记录" onClick={()=>void viewSection(section==='downloads'?'page':'downloads')}><List size={16}/></button><button type="button" aria-label="浏览历史" aria-pressed={section==='history'} title="浏览历史" onClick={()=>void viewSection(section==='history'?'page':'history')}><History size={16}/></button>
    </form>
    {section!=='page'&&<div className="browser-section-heading"><strong>{section==='downloads'?'下载记录':'浏览历史'}</strong><button onClick={()=>setSection('page')}>返回页面</button></div>}
    {error&&<p role="alert">{error}</p>}
    {notice&&<p className="browser-feedback" role="status">{notice}</p>}
    {tab?.state==='user_controlled'&&<p className="browser-notice">你正在控制页面。<button onClick={()=>void perform('control',{tabId:tab.id,user:false})}>交还模型</button></p>}
    {tab&&tab.state!=='user_controlled'&&tab.state==='agent_controlled'&&<p className="browser-notice">模型正在操作页面。<button onClick={()=>void perform('control',{tabId:tab.id,user:true})}><Hand size={14}/>接管页面</button></p>}
    {section==='page'&&<>{!file&&!!tab?.blockedSites?.length&&<details className="browser-permissions" key={tab.id}><summary>已拦截 {tab.blockedSites.length} 个额外站点请求 · 查看</summary><div className="browser-permissions-list"><p>以下请求需要额外授权。仅允许你信任的站点，允许后请重新加载页面。</p>{tab.blockedSites.map(origin=><div className="browser-permission-item" key={origin}><span>{origin}</span><button type="button" onClick={()=>void perform('permitSite',{origin})}>允许此站点</button></div>)}</div></details>}{(tab?.error||fileState.error)&&<p role="alert">{tab?.error||fileState.error}{tab?.blockedURL&&<button onClick={()=>void perform('navigate',{tabId:tab.id,navigation:'open',url:tab.blockedURL})}>允许访问此网站</button>}</p>}<div className="browser-viewport" ref={viewport} role="tabpanel" aria-label={file?.title||tab?.title||'新标签页'}>{!file&&(!tab||tab.url==='about:blank')&&<div className="browser-empty"><Globe2 size={30}/><strong>在此打开网页或文件</strong><span>在地址栏输入网址，或点击对话中的文件。</span></div>}{fileState.loading&&<p role="status">正在加载文档…</p>}</div></>}
    {section==='downloads'&&<div className="browser-records"><p>下载目录：{settings.directory||settings.defaultDirectory}<button onClick={()=>void perform('settings',{chooseDirectory:true}).then(s=>s&&setSettings(s))}>更改</button></p><label><input type="checkbox" checked={Boolean(settings.askEach)} onChange={e=>void perform('settings',{askEach:e.target.checked}).then(s=>s&&setSettings(s))}/>每次询问保存位置</label>{state.downloads.map(d=><article key={d.id}><strong>{d.name}</strong><p>{({completed:'已完成',downloading:'下载中',cancelled:'已取消',failed:'失败',interrupted:'中断',awaiting_permission:'等待下载许可',awaiting_location:'等待保存位置'} as Record<string,string>)[d.state]||d.state} · {d.receivedBytes} / {d.totalBytes||'未知'} 字节</p>{d.totalBytes>0&&<progress value={d.receivedBytes} max={d.totalBytes}/>}<p>{d.error}</p>{d.state==='completed'?<><button onClick={()=>void perform('revealDownload',{downloadId:d.id})}>文件位置</button><button onClick={()=>void perform('importDownload',{downloadId:d.id}).then(a=>a&&onImport(a))}>作为任务附件</button></>:<><button onClick={()=>void perform('cancelDownload',{downloadId:d.id})}>取消下载</button>{d.state==='awaiting_permission'&&<button onClick={()=>void perform('allowDownload',{downloadId:d.id})}>允许此次下载</button>}</>}</article>)}</div>}
    {section==='history'&&<div className="browser-records"><label><input type="checkbox" checked={Boolean(history.allowHistory)} onChange={e=>{const enabled=e.target.checked;void perform('allowHistory',{enabled});setHistory((h:any)=>({...h,allowHistory:enabled}))}}/>允许模型读取此对话的浏览历史</label><button onClick={()=>void perform('clearHistory').then(()=>viewSection('history'))}>清空此对话历史</button><button onClick={()=>void perform('revokeSites')}>撤销网站许可</button>{tab&&<><label><input type="checkbox" checked={tab.diagnostics} onChange={e=>void perform('diagnostics',{tabId:tab.id,enabled:e.target.checked})}/>允许此标签页的控制台诊断</label></>}{history.history.map((h:any)=><article key={h.id}><button onClick={()=>{void perform('create',{url:h.url});setSection('page')}}>{h.title}</button><p>{h.url} · {h.time}</p></article>)}</div>}
  </aside>
}
