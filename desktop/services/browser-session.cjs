 'use strict'
const {randomUUID}=require('node:crypto')
const {normalizeWebUrl}=require('./preview.cjs')
const {pageAction}=require('./browser-tool.cjs')
const {BrowserDownloads}=require('./browser-downloads.cjs')
const {redact}=require('./approval-ledger.cjs')
function durableURL(value){try{const u=new URL(value);if(/code|token|ticket|session|oauth|auth|state|password/i.test(u.search))return u.origin+u.pathname;u.hash='';return u.href}catch{return 'about:blank'}}
function extraAction(action,ref,value){
  const element=ref?globalThis.__stableElements?.get(ref):null
  if(ref&&(!element?.isConnected||!element.getClientRects().length))throw Error('元素已失效，请重新读取页面。')
  if(action==='scroll'){(element||window).scrollBy({top:Math.max(-3000,Math.min(3000,Number(value)||600)),behavior:'instant'});return {scrolled:true}}
  if(action==='locate'){return [...(globalThis.__stableElements||new Map()).entries()].filter(([,e])=>(e.innerText||e.getAttribute('aria-label')||'').includes(value)).map(([ref])=>ref).slice(0,30)}
  if(action==='wait')return {matched:document.body?.innerText.includes(value)}
  if(action==='focus'||action==='hover'||action==='drag'){if(element&&/password|file|hidden|token|secret|one-time-code|验证码|密码/i.test([element.type,element.name,element.id,element.autocomplete].join(' ')))throw Error('敏感控件请交由用户。');if(!element)throw Error('请提供目标ref');element.scrollIntoView({block:'center'});element.focus();const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,viewportWidth:innerWidth,viewportHeight:innerHeight}}
  throw Error('不支持的页面动作。')
}
class BrowserSessionService {
  constructor({electron,store,getWindow,onChange}) {
    Object.assign(this,{electron,store,getWindow,onChange});this.tabs=new Map();this.active=new Map();this.shown=null
    this.profile=electron.session.fromPartition('persist:stable-browser-v2')
    this.profile.setPermissionRequestHandler((_c,_p,cb)=>cb(false));this.profile.setPermissionCheckHandler(()=>false)
    this.downloads=new BrowserDownloads({electron,store,onChange:()=>this.emit(),tabForContents:c=>[...this.tabs.values()].find(t=>t.view.webContents===c),allowed:(tab,url)=>this.allowed(tab,url)})
    this.downloadListener=(event,item,contents)=>{void this.downloads.begin(event,item,contents).catch(error=>{item.cancel();this.emit()})};this.profile.on('will-download',this.downloadListener)
    this.profile.webRequest.onBeforeRequest((details,cb)=>{
      const tab=[...this.tabs.values()].find(t=>t.view.webContents.id===details.webContentsId)
      const staticResource=['image','font','stylesheet','script','media'].includes(details.resourceType)
      let allow=details.url==='about:blank'||staticResource&&/^data:/.test(details.url)
      if(tab&&!allow)allow=this.allowed(tab,details.url)
      if(tab&&!allow){try{const origin=new URL(details.url).origin;if(origin!=='null'&&!tab.blockedSites.has(origin)){tab.blockedSites.add(origin);this.emit()}}catch{}}
      cb({cancel:!allow})
    })
    this.saved=store.getSetting('browser-tabs-v2')||[]
  }
  sites(id){return this.store.getSetting(`browser-sites:${id}`)||[]}
  allowed(tab,url){try{if(url==='about:blank')return true;if(url.startsWith('blob:'))url=url.slice(5);const u=new URL(url.replace(/^ws/, 'http'));return ['http:','https:'].includes(u.protocol)&&this.sites(tab.conversationId).includes(u.origin)}catch{return false}}
  permit(id,url){const u=new URL(normalizeWebUrl(url));this.store.setSetting(`browser-sites:${id}`,[...new Set([...this.sites(id),u.origin])])}
  persist(){const existing=this.saved.filter(s=>!this.tabs.has(s.id));this.saved=[...existing,...[...this.tabs.values()].map(t=>({id:t.id,conversationId:t.conversationId,url:durableURL(t.state==='suspended'?t.url:(t.view.webContents.getURL()||t.url)),title:t.title,epoch:t.epoch}))];this.store.setSetting('browser-tabs-v2',this.saved)}
  emit(){this.onChange?.()}
  async create(conversationId,url='about:blank',user=false,id=randomUUID(),inheritedOptions={}) {
    if(url!=='about:blank'){url=normalizeWebUrl(url);if(user)this.permit(conversationId,url)}
    const view=new this.electron.WebContentsView({...inheritedOptions,webPreferences:{...inheritedOptions.webPreferences,session:this.profile,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,backgroundThrottling:false}})
    const tab={id,conversationId,url,title:'新标签页',epoch:0,state:'idle',view,blockedSites:new Set(),chain:Promise.resolve(),error:'',blockedURL:'',diagnostics:false,logs:[]}
    this.tabs.set(id,tab);this.active.set(conversationId,id)
    view.setBounds({x:0,y:0,width:1280,height:900})
    const wc=view.webContents
    const manualInput=()=>{if(!tab.injecting&&tab.state!=='user_controlled'){tab.state='user_controlled';tab.epoch++;this.emit()}}
    wc.on('before-input-event',manualInput);wc.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown')manualInput()})
    const guard=(event,target)=>{if(!this.allowed(tab,target)){event.preventDefault();tab.blockedURL=target;tab.error=`需要允许访问 ${new URL(target).origin}`;this.emit()}}
    wc.on('will-navigate',guard);wc.on('will-redirect',guard)
    wc.on('did-start-navigation',(_e,_u,_same,main)=>{if(main){tab.epoch++;this.emit()}})
    wc.on('did-navigate-in-page',()=>{tab.epoch++;this.emit()})
    wc.on('did-stop-loading',()=>{tab.url=wc.getURL();tab.title=wc.getTitle()||tab.url;this.persist();this.recordHistory(tab);this.emit()})
    wc.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3){tab.error=description;this.emit()}})
    wc.on('render-process-gone',()=>{tab.state='suspended';tab.error='页面进程已退出，请重新加载。';this.emit()})
    wc.on('console-message',event=>{if(tab.diagnostics&&tab.state!=='user_controlled'){tab.logs.push({level:event.level,message:redact(event.message).slice(0,2000)});tab.logs=tab.logs.slice(-100)}})
    wc.setWindowOpenHandler(({url})=>{
      try{if(url!=='about:blank')normalizeWebUrl(url)}catch{return {action:'deny'}}
      return {action:'allow',createWindow:options=>{
        const popupId=randomUUID();void this.create(conversationId,'about:blank',false,popupId,options)
        const popup=this.tabs.get(popupId);popup.url=url;popup.state=tab.state==='user_controlled'?'user_controlled':'idle'
        if(!this.allowed(tab,url)){popup.blockedURL=url;popup.error='登录或新窗口需要确认访问站点。'}
        this.emit();return popup.view.webContents
      }}
    })
    wc.once('destroyed',()=>{if(!this.disposing&&this.tabs.has(tab.id)){if(this.shown===tab)this.shown=null;this.tabs.delete(tab.id);this.saved=this.saved.filter(t=>t.id!==tab.id);this.active.set(conversationId,[...this.tabs.values()].find(t=>t.conversationId===conversationId)?.id);this.persist();this.emit()}})
    wc.on('will-attach-webview',event=>event.preventDefault())
    this.persist();this.emit()
    if(url!=='about:blank'){if(!this.allowed(tab,url)){tab.blockedURL=url;tab.error='此网站尚未获许可。';this.emit()}else await wc.loadURL(url).catch(error=>{tab.error=error.message;this.emit()})}
    return tab
  }
  async restore(id){for(const saved of this.saved.filter(t=>t.conversationId===id&&!this.tabs.has(t.id))){const tab=await this.create(id,'about:blank',false,saved.id);tab.url=saved.url;tab.title=saved.title;tab.state='suspended';tab.error='恢复的标签页，点击重新加载后继续。'}return this.snapshot(id)}
  get(id,tabId){const tab=this.tabs.get(tabId||this.active.get(id));if(!tab||tab.conversationId!==id||tab.state==='closed')throw Error('标签页不属于此对话或已经关闭。');return tab}
  snapshot(id){return {tabs:[...this.tabs.values()].filter(t=>t.conversationId===id).map(t=>({id:t.id,conversationId:id,url:t.state==='suspended'?t.url:(t.view.webContents.getURL()||t.url),title:t.title,epoch:t.epoch,state:t.state,error:t.error,blockedURL:t.blockedURL,loading:t.view.webContents.isLoading(),canGoBack:t.view.webContents.navigationHistory.canGoBack(),canGoForward:t.view.webContents.navigationHistory.canGoForward(),diagnostics:t.diagnostics,blockedSites:[...t.blockedSites].filter(origin=>!this.sites(id).includes(origin))})),activeTabId:this.active.get(id),downloads:this.downloads.list(id)}}
  hide(){if(this.shown){try{this.getWindow()?.contentView.removeChildView(this.shown.view)}catch{};this.shown.view.setVisible(false);this.shown=null}}
  show(id,tabId,bounds){const tab=this.get(id,tabId);this.hide();const win=this.getWindow();if(!win)return;this.active.set(id,tab.id);win.contentView.addChildView(tab.view);tab.view.setBounds(bounds);tab.view.setVisible(true);this.shown=tab;this.emit()}
  close(id,tabId){const tab=this.get(id,tabId);if(this.shown===tab)this.hide();tab.state='closed';tab.view.webContents.close();this.tabs.delete(tab.id);this.saved=this.saved.filter(t=>t.id!==tab.id);this.active.set(id,[...this.tabs.values()].find(t=>t.conversationId===id)?.id);this.persist();this.emit()}
  control(id,tabId,user){const tab=this.get(id,tabId);tab.state=user?'user_controlled':'idle';tab.epoch++;this.emit();return this.snapshot(id)}
  async navigate(id,tabId,action,url){const tab=this.get(id,tabId);if(tab.state==='agent_controlled')throw Error('请先接管页面再导航。');const wc=tab.view.webContents;tab.error='';
    if(action==='open'){this.permit(id,url);tab.blockedURL='';await wc.loadURL(normalizeWebUrl(url))}
    else if(action==='reload'){if(tab.state!=='user_controlled')tab.state='idle';await wc.loadURL(normalizeWebUrl(tab.url||wc.getURL()))}
    else if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack()
    else if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward()
    this.emit();return this.snapshot(id)
  }
  async input(tab,event){
    if(this.shown!==tab||!this.getWindow()?.isVisible())throw Error('请先展开浏览器页面，再执行原生按键、悬停或拖拽。')
    const api=tab.view.webContents.debugger;if(!api.isAttached())api.attach('1.3')
    tab.injecting=true;tab.view.webContents.focus()
    try{
      await api.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true})
      if(event.type.startsWith('key')){const codes={Enter:13,Tab:9,Escape:27,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Backspace:8};await api.sendCommand('Input.dispatchKeyEvent',{type:event.type,key:event.keyCode,code:event.keyCode,windowsVirtualKeyCode:codes[event.keyCode],...(event.type==='keyDown'&&event.keyCode==='Enter'?{text:'\r'}:{})})}
      else {if(event.type==='mouseDown')tab.mouseButtons=1;if(event.type==='mouseUp')tab.mouseButtons=0;await api.sendCommand('Input.dispatchMouseEvent',{type:({mouseMove:'mouseMoved',mouseDown:'mousePressed',mouseUp:'mouseReleased'})[event.type],x:event.x,y:event.y,button:event.button||'none',buttons:tab.mouseButtons||0,clickCount:event.clickCount||0})}
    }finally{await api.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:false}).catch(()=>{});tab.injecting=false}
  }
  async evaluate(tab,args,operation){
    const frameId=args.frameId||'main',prefix=`${tab.id}.${tab.epoch}.${frameId}`
    if(args.ref&&!args.ref.startsWith(prefix+':'))throw Error('ref 所属页面或导航版本已失效，请重新读取。')
    const source=['read','click','fill','select'].includes(operation)?pageAction:extraAction
    const call=`(${source.toString()})(${JSON.stringify(operation)},${JSON.stringify(args.ref||'')},${JSON.stringify(args.value||'')},${JSON.stringify(prefix+':'+randomUUID())})`
    const code=`(()=>{try{return {ok:true,value:${call}}}catch(error){return {ok:false,error:String(error.message||error)}}})()`
    const unwrap=result=>{if(!result?.ok)throw Error(result?.error||'页面没有返回有效结果');return result.value}
    const wc=tab.view.webContents
    if(frameId==='main')return unwrap(await wc.executeJavaScriptInIsolatedWorld(1001,[{code}]))
    if(!wc.debugger.isAttached())wc.debugger.attach('1.3')
    const tree=await wc.debugger.sendCommand('Page.getFrameTree'),frames=[]
    const walk=node=>{frames.push(node.frame);(node.childFrames||[]).forEach(walk)};walk(tree.frameTree)
    const frame=frames.find(f=>f.id===frameId);if(!frame||!this.allowed(tab,frame.url))throw Error('frame 失效或站点未授权。')
    const world=await wc.debugger.sendCommand('Page.createIsolatedWorld',{frameId,worldName:'stable-browser-isolated'})
    const result=await wc.debugger.sendCommand('Runtime.evaluate',{expression:code,contextId:world.executionContextId,returnByValue:true,awaitPromise:true})
    if(result.exceptionDetails)throw Error('frame 操作失败，请重新读取。');return unwrap(result.result.value)
  }
  async inputPoint(tab,args,action){
    const point=await this.evaluate(tab,args,action)
    if(!args.frameId||args.frameId==='main')return point
    const debuggerAPI=tab.view.webContents.debugger
    const owner=await debuggerAPI.sendCommand('DOM.getFrameOwner',{frameId:args.frameId})
    await debuggerAPI.sendCommand('DOM.scrollIntoViewIfNeeded',{backendNodeId:owner.backendNodeId})
    const {model}=await debuggerAPI.sendCommand('DOM.getBoxModel',{backendNodeId:owner.backendNodeId})
    const q=model.content,u=point.x/point.viewportWidth,v=point.y/point.viewportHeight
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||u>1||v>1)throw Error('frame 控件不在可操作范围，请重新读取。')
    return {x:q[0]+u*(q[2]-q[0])+v*(q[6]-q[0]),y:q[1]+u*(q[3]-q[1])+v*(q[7]-q[1])}
  }
  execute(id,args,signal,runId){if(typeof args.value==='string'&&args.value.length>5000)return Promise.reject(Error('单次输入最多5000字符。'));let tab;try{tab=this.get(id,args.tabId)}catch{if(args.tabId||args.action!=='open')return Promise.reject(Error('请先打开此对话的标签页。'))}
    const perform=async()=>{if(!tab){tab=await this.create(id,'about:blank');}const timeout=AbortSignal.timeout(30000), combined=signal?AbortSignal.any([signal,timeout]):timeout;const abort=()=>{if(tab.state==='agent_controlled'){tab.state='suspended';tab.error='操作超时或已取消，请重新加载或交还控制。';tab.view.webContents.stop();this.emit()}};combined.addEventListener('abort',abort,{once:true});try{return await Promise.race([this.run(tab,args,combined,runId),new Promise((_,reject)=>combined.addEventListener('abort',()=>reject(Error('浏览器操作已取消或超时。')),{once:true}))])}finally{combined.removeEventListener('abort',abort)}}
    if(tab){const result=tab.chain.then(perform);tab.chain=result.catch(()=>{});return result}return perform()
  }
  async run(tab,args,signal,runId){signal?.throwIfAborted();if(['user_controlled','suspended','closed'].includes(tab.state))throw Error('页面已由用户接管或暂停；请等待用户交还后重新读取。');tab.state='agent_controlled';tab.runId=runId;this.emit();const epoch=tab.epoch
    const assert=()=>{signal?.throwIfAborted();if(tab.state!=='agent_controlled')throw Error('页面控制权已改变，操作终止。')}
    try{
      if(args.action==='open'){this.permit(tab.conversationId,args.url);await tab.view.webContents.loadURL(normalizeWebUrl(args.url));assert()}
      else if(args.action==='close'){this.close(tab.conversationId,tab.id);return {closed:true}}
      else if(args.action==='screenshot'){assert();const image=await tab.view.webContents.capturePage();assert();return {tabId:tab.id,epoch:tab.epoch,image:image.toDataURL()}}
      else if(args.action==='history'){if(!this.store.getSetting(`browser-history-allow:${tab.conversationId}`))throw Error('浏览历史需要单独授权。');return {history:this.history(tab.conversationId)}}
      else if(args.action==='diagnostics'){if(!tab.diagnostics)throw Error('请由用户启用此标签页的诊断权限。');return {logs:tab.logs.slice(-50)}}
      else if(args.action==='frames'){const wc=tab.view.webContents;if(!wc.debugger.isAttached())wc.debugger.attach('1.3');const result=await wc.debugger.sendCommand('Page.getFrameTree');assert();return result}
      else if(args.action==='wait'){for(let i=0;i<40;i++){assert();const value=await this.evaluate(tab,args,'wait');if(value.matched)break;if(i===39)throw Error('等待条件超时。');await new Promise(r=>setTimeout(r,250))}}
      else if(args.action==='key'){if(!['Enter','Tab','Escape','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Backspace'].includes(args.value))throw Error('不支持的按键。');if(args.ref)await this.evaluate(tab,args,'focus');assert();await this.input(tab,{type:'keyDown',keyCode:args.value});await this.input(tab,{type:'keyUp',keyCode:args.value});await new Promise(r=>setTimeout(r,100))}
      else if(args.action==='hover'||args.action==='drag'){const point=await this.inputPoint(tab,args,args.action);assert();await this.input(tab,{type:'mouseMove',x:Math.round(point.x),y:Math.round(point.y)});if(args.action==='drag'){const target=await this.inputPoint(tab,{...args,ref:args.targetRef},'drag');assert();await this.input(tab,{type:'mouseDown',x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});await this.input(tab,{type:'mouseMove',x:Math.round(target.x),y:Math.round(target.y)});await this.input(tab,{type:'mouseUp',x:Math.round(target.x),y:Math.round(target.y),button:'left',clickCount:1})}}
      else if(['click','fill','select','scroll','locate'].includes(args.action)){const result=await this.evaluate(tab,args,args.action);assert();if(args.action==='locate')return {refs:result};if(['click','select'].includes(args.action)){await new Promise(r=>setTimeout(r,150));while(tab.view.webContents.isLoading()){assert();await new Promise(r=>setTimeout(r,50))}}}
      else if(args.action!=='read')throw Error('不支持的浏览器动作。')
      assert();const value=await this.evaluate(tab,{...args,ref:undefined},'read');assert();return {tabId:tab.id,epoch:tab.epoch,...value}
    }finally{if(tab.state==='agent_controlled')tab.state='idle';this.persist();this.emit()}
  }
  recordHistory(tab){if(tab.state==='user_controlled')return;const url=durableURL(tab.url);if(url==='about:blank')return;const history=this.store.getSetting('browser-history-v2')||[];if(history[0]?.url===url&&history[0]?.tabId===tab.id)return;this.store.setSetting('browser-history-v2',[{id:randomUUID(),tabId:tab.id,conversationId:tab.conversationId,url,title:tab.title,time:new Date().toISOString()},...history].slice(0,2000))}
  history(id){return(this.store.getSetting('browser-history-v2')||[]).filter(item=>!id||item.conversationId===id)}
  clearHistory(id,since){this.store.setSetting('browser-history-v2',this.history().filter(item=>item.conversationId!==id||since&&item.time<since));this.emit()}
  annotate(id,tabId,text,ref){const tab=this.get(id,tabId);if(ref&&!String(ref).startsWith(`${tab.id}.${tab.epoch}.`))throw Error('批注引用已失效。');if(!String(text).trim())throw Error('请填写批注。');const entry={id:randomUUID(),tabId,conversationId:id,url:durableURL(tab.url),epoch:tab.epoch,ref:ref||null,text:String(text).slice(0,5000),time:new Date().toISOString()};const items=this.store.getSetting('browser-annotations-v2')||[];this.store.setSetting('browser-annotations-v2',[...items,entry]);return entry}
  forgetConversation(id){
    for(const tab of [...this.tabs.values()])if(tab.conversationId===id)this.close(id,tab.id)
    this.saved=this.saved.filter(tab=>tab.conversationId!==id);this.persist();this.active.delete(id)
    for(const item of this.downloads.list(id))this.downloads.cancel(item.id)
    this.clearHistory(id);this.store.setSetting('browser-annotations-v2',(this.store.getSetting('browser-annotations-v2')||[]).filter(item=>item.conversationId!==id))
    this.store.setSetting(`browser-sites:${id}`,[]);this.store.setSetting(`browser-history-allow:${id}`,false)
    this.emit()
  }
  dispose(){this.disposing=true;this.persist();this.profile.removeListener('will-download',this.downloadListener);this.hide();for(const t of this.tabs.values())t.view.webContents.close();this.tabs.clear()}
}
module.exports={BrowserSessionService,durableURL,extraAction}
