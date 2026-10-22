'use strict'
// Serialized into an isolated world; no Node, file or IPC capability enters the document.
function installHtmlEditor(config) {
  globalThis.__stableHtmlEditor?.dispose()
  const reference=new DOMParser().parseFromString(config.source.replace(/^\ufeff/,''),'text/html'),items=new Map(),reverse=new WeakMap()
  const signature=el=>JSON.stringify([el.tagName,[...el.attributes].map(a=>[a.name,a.value]).sort()])
  const inline=new Set(['SPAN','B','STRONG','I','EM','U','S','DEL','SMALL','SUB','SUP','MARK','CODE','BR','A'])
  const textCapable=el=>!['IMG','SVG','CANVAS','IFRAME','INPUT','TEXTAREA','SELECT','VIDEO','AUDIO'].includes(el.tagName)&&[...el.querySelectorAll('*')].every(n=>inline.has(n.tagName))
  function selector(el){const parts=[];for(let n=el;n&&n!==document.documentElement;n=n.parentElement){if(!n.parentElement)return '';parts.unshift(n.localName+':nth-of-type('+([...n.parentElement.children].filter(x=>x.localName===n.localName).indexOf(n)+1)+')')}return 'html > '+parts.join(' > ')}
  function remember(node,el){const item={...node,el,parent:el.parentNode,next:el.nextSibling,style:el.getAttribute('style'),html:el.innerHTML,href:el.getAttribute('href'),src:el.getAttribute('src'),srcset:el.getAttribute('srcset')};items.set(node.id,item);reverse.set(el,node.id);return item}
  for(const node of config.nodes){
    const el=document.querySelector(node.selector),ref=reference.querySelector(node.selector)
    if(!el||!ref||signature(el)!==signature(ref)||el.innerHTML!==ref.innerHTML)continue
    remember(node,el)
  }
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
  const root=host.attachShadow({mode:'closed'});document.documentElement.append(host)
  document.documentElement.setAttribute('data-stable-editing','')
  root.innerHTML=config.toolbar
  let selected=[],changes=[],history=[[]],index=0,revision=0,events=[],disposed=false,textEdit=null,drag=null,requestId=0,cropState=null,region=null,regionMode=false
  const touched=new Set(),contentTouched=new Set(),pending=new Map(),bar=root.querySelector('.bar'),marks=root.querySelector('.marks'),hover=root.querySelector('.hover'),marquee=root.querySelector('.marquee'),status=root.querySelector('.status'),error=root.querySelector('.error')
  const copy=value=>JSON.parse(JSON.stringify(value)),box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}
  const draw=(el,r)=>Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'})
  function message(value){error.textContent=value||'';root.querySelector('.notice').hidden=!value}
  function patch(id){touched.add(id);let p=changes.find(p=>p.id===id);if(!p){const item=items.get(id);p={id,...(item?.target?{target:item.target}:{})};changes.push(p)}return p}
  function attr(el,name,value){if(value===null)el.removeAttribute(name);else el.setAttribute(name,value)}
  function ensureItem(el,force=false){
    if(!el||el===host||!document.body.contains(el)||el.closest('script,style,iframe,object,embed,template,input,textarea,select'))return null
    let item=items.get(reverse.get(el))
    if(!force&&item&&(!textCapable(el)||item.textEditable)&&!changes.some(p=>p.html!==undefined&&items.get(p.id)?.el!==el&&items.get(p.id)?.el.contains(el)))return item
    const route=selector(el),id='live:'+route
    if(items.has(id)){item=items.get(id);item.el=el;reverse.set(el,id);return item}
    return remember({id,tag:el.localName,selector:route,target:{selector:route,tag:el.localName},textEditable:textCapable(el)},el)
  }
  function setText(item,value,rich=false){
    contentTouched.add(item.id)
    for(const p of [...changes])if(p.id!==item.id&&item.el.contains(items.get(p.id)?.el))changes.splice(changes.indexOf(p),1)
    const p=patch(item.id);delete p.text;delete p.html;p[rich?'html':'text']=value
  }
  function renderChanges(){
    for(const item of items.values()){
      if(!touched.has(item.id))continue
      if(!item.el.isConnected&&item.parent.isConnected)item.parent.insertBefore(item.el,item.next?.parentNode===item.parent?item.next:null)
      attr(item.el,'style',item.style);attr(item.el,'href',item.href);attr(item.el,'src',item.src);attr(item.el,'srcset',item.srcset)
      if(contentTouched.has(item.id)&&item.textEditable&&item.el.innerHTML!==item.html)item.el.innerHTML=item.html
    }
    for(const p of changes){const item=items.get(p.id);if(!item)continue;const current=document.querySelector(item.selector);if(current&&current!==item.el){selected=selected.map(el=>el===item.el?current:el);item.el=current;reverse.set(current,item.id)}const el=item.el
      if(p.deleted){if(item.target)el.style.setProperty('display','none','important');else el.remove();continue}if(p.html!==undefined&&el.innerHTML!==p.html)el.innerHTML=p.html;else if(p.text!==undefined)el.replaceChildren(...p.text.split('\n').flatMap((line,i)=>i?[document.createElement('br'),document.createTextNode(line)]:[document.createTextNode(line)]))
      for(const [name,value]of Object.entries(p.styles||{}))el.style.setProperty(name,value,'important')
      for(const [name,value]of Object.entries(p.attrs||{})){el.setAttribute(name,value);if(name==='src')el.removeAttribute('srcset')}
    }
    paint()
  }
  function commit(){history=history.slice(0,index+1);history.push(copy(changes));if(history.length>101)history.shift();index=history.length-1;revision++;status.textContent='有修改，等待保存…';renderChanges()}
  function mutate(fn){finishText();message('');const before=copy(changes);try{fn();commit()}catch(e){changes=before;renderChanges();message(e.message)}}
  function mapped(){const result=selected.map(el=>ensureItem(el));if(!result.length||result.some(i=>!i))throw Error('此元素不支持直接编辑。');return result}
  function rangeStyle(name,value){
    const selection=getSelection();if(!selection?.rangeCount||selection.isCollapsed||selected.length!==1)return false
    const el=selected[0],range=selection.getRangeAt(0);if(!el.contains(range.commonAncestorContainer)||selection.toString()===el.textContent||!textCapable(el))return false
    const clone=el.cloneNode(true),route=node=>{const steps=[];while(node!==el){steps.unshift([...node.parentNode.childNodes].indexOf(node));node=node.parentNode}return steps},find=steps=>steps.reduce((n,i)=>n.childNodes[i],clone),r=document.createRange()
    r.setStart(find(route(range.startContainer)),range.startOffset);r.setEnd(find(route(range.endContainer)),range.endOffset)
    const span=document.createElement('span');span.style.setProperty(name,value,'important');span.append(r.extractContents());r.insertNode(span)
    const item=ensureItem(el,true);mutate(()=>setText(item,clone.innerHTML,true));return true
  }
  function style(name,value){if(!CSS.supports(name,value)||/[;{}<>\\]|url\s*\(|expression\s*\(|@/i.test(value)){message('样式值无效。');return}if(rangeStyle(name,value))return;mutate(()=>{for(const item of mapped()){const p=patch(item.id);p.styles={...p.styles,[name]:value};if(name==='border-color')p.styles={...p.styles,'border-style':'solid','border-width':getComputedStyle(item.el).borderTopWidth==='0px'?'1px':getComputedStyle(item.el).borderTopWidth}}})}
  function choose(el,add=false){region=null;regionMode=false;root.querySelector('.region-surface').hidden=true;if(!el||el===host||['HTML','BODY','SCRIPT','STYLE','HEAD'].includes(el.tagName))return;finishText();closeMenus();ensureItem(el);selected=add?(selected.includes(el)?selected.filter(e=>e!==el):[...selected,el]):[el];paint();syncFields()}
  function syncFields(){const el=selected[0];if(!el)return;const s=getComputedStyle(el);for(const input of root.querySelectorAll('[data-style]')){const name=input.dataset.style;let value=s.getPropertyValue(name);if(name==='text-align'&&['start','end'].includes(value))value=value==='start'?'left':'right';if(input.type==='number')value=String(parseFloat(value)|| (name==='line-height'?1.5:16));if(input.type==='color'){const rgb=value.match(/\d+/g);value=rgb?'#'+rgb.slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join(''):'#000000'}input.value=value}for(const button of root.querySelectorAll('[data-property]')){const name=button.dataset.property;let value=s.getPropertyValue(name);if(name==='text-align'&&['start','end'].includes(value))value=value==='start'?'left':'right';button.setAttribute('aria-pressed',String(value===button.dataset.value))}root.querySelector('.linkText').value=el.textContent||'';root.querySelector('.linkURL').value=el.getAttribute('href')||'';for(const [action,on]of [['bold',Number(s.fontWeight)>=600],['italic',s.fontStyle==='italic'],['underline',s.textDecorationLine.includes('underline')],['strike',s.textDecorationLine.includes('line-through')]])root.querySelector(`[data-action=${action}]`).setAttribute('aria-pressed',String(on))}
  function paint(){
    selected=selected.filter(el=>el.isConnected);marks.replaceChildren();root.querySelector('.selection').textContent=selected.length?`已选 ${selected.length} 个元素`:'点击选择元素 · 拖动框选'
    positionBar();marquee.hidden=capturing||(!region&&!drag?.moved);if(region)draw(marquee,regionBox());
    for(const el of selected){const mark=document.createElement('div');mark.className='mark';draw(mark,box(el));marks.append(mark);if(el.tagName==='IMG'&&reverse.has(el)){const handle=document.createElement('i');handle.className='handle';handle.setAttribute('aria-label','等比例缩放图片');handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const r=box(el);drag={resize:el,startX:e.clientX,startY:e.clientY,rect:r};handle.setPointerCapture(e.pointerId)};mark.append(handle)}}
    root.querySelector('[data-action=undo]').disabled=index===0;root.querySelector('[data-action=redo]').disabled=index===history.length-1
    for(const action of ['replace','crop'])root.querySelector(`[data-action=${action}]`).disabled=selected.length!==1||selected[0]?.tagName!=='IMG'||!reverse.has(selected[0])
  }
  function startText(el,x,y){
    const item=ensureItem(el);if(!item?.textEditable){message('请双击文字区域进行编辑。');return}
    finishText();textEdit={item,before:el.innerHTML,changes:copy(changes),editable:el.getAttribute('contenteditable')}
    el.setAttribute('contenteditable',item.target?'true':'plaintext-only');el.focus({preventScroll:true})
    const range=document.createRange(),point=document.caretPositionFromPoint?.(x,y),legacy=!point&&document.caretRangeFromPoint?.(x,y)
    const node=point?.offsetNode||legacy?.startContainer,offset=point?.offset??legacy?.startOffset
    if(node&&el.contains(node))range.setStart(node,offset);else range.selectNodeContents(el)
    range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);message('')
  }
  function finishText(cancel=false){if(!textEdit)return;const {item,before,editable,changes:beforeChanges}=textEdit;textEdit=null;const value=item.target?item.el.innerHTML:item.el.innerText;attr(item.el,'contenteditable',editable);if(cancel){changes=beforeChanges;revision++;renderChanges();return}if(item.el.innerHTML!==before){setText(item,value,!!item.target);commit()}}
  function input(e){if(textEdit&&textEdit.item.el.contains(e.target)){const item=textEdit.item;setText(item,item.target?item.el.innerHTML:item.el.innerText,!!item.target);revision++;status.textContent='有修改，等待保存…'}}
  function paste(e){if(!textEdit||!textEdit.item.el.contains(e.target))return;e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))}
  function request(type,data,callback){const id=++requestId;pending.set(id,callback);events.push({id,type,...data});status.textContent='正在处理…'}
  function targetInfo(el){const item=items.get(reverse.get(el));const parts=[];for(let n=el;n&&n!==document.documentElement;n=n.parentElement){parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+([...n.parentElement.children].filter(x=>x.tagName===n.tagName).indexOf(n)+1)+')')}return{id:item?.id,selector:item?.selector||parts.join(' > '),tag:el.tagName.toLowerCase(),text:(el.innerText||el.alt||'').slice(0,6000),rect:box(el)}}
  const regionBox=()=>region&&({x:region.x-scrollX,y:region.y-scrollY,width:region.width,height:region.height})
  function regionInfo(){
    const r=regionBox(),contains=b=>b.x<=r.x&&b.y<=r.y&&b.x+b.width>=r.x+r.width&&b.y+b.height>=r.y+r.height
    const center=document.elementsFromPoint(Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)))
    const container=center.find(el=>el!==host&&contains(box(el)))||document.body,b=box(container)
    const describe=el=>({selector:selector(el),tag:el.localName,text:(el.innerText||el.textContent||'').slice(0,500),rect:{...box(el),x:box(el).x+scrollX,y:box(el).y+scrollY}})
    const neighbors=[...container.children].filter(el=>!['SCRIPT','STYLE','LINK','META'].includes(el.tagName)).map(el=>({el,b:box(el)})).filter(v=>v.b.width&&v.b.height).sort((a,b)=>Math.hypot(a.b.x+a.b.width/2-r.x-r.width/2,a.b.y+a.b.height/2-r.y-r.height/2)-Math.hypot(b.b.x+b.b.width/2-r.x-r.width/2,b.b.y+b.b.height/2-r.y-r.height/2)).slice(0,8).map(v=>describe(v.el))
    return {kind:'region',rect:{...region},container:{...describe(container),layout:{display:getComputedStyle(container).display,gridTemplateColumns:getComputedStyle(container).gridTemplateColumns}},offset:{x:r.x-b.x,y:r.y-b.y},neighbors}
  }
  function ai(){if(pending.size)return;finishText();const prompt=root.querySelector('.ai').value.trim();if(!prompt||(!selected.length&&!region)){message('请选择元素并填写修改要求。');return}request('ai',{prompt,send:false,targets:region?[]:selected.map(targetInfo),...(region?{region:regionInfo()}:{})},()=>{root.querySelector('.ai').value='';closeMenus();region=null;paint();status.textContent='已加入聊天草稿';error.textContent='';root.querySelector('.notice').hidden=false});root.querySelector('[data-action=draft]').disabled=true}
  function cropDialog(info){
    const modal=root.querySelector('.crop');modal.hidden=false;modal.innerHTML='<div class="dialog" role="dialog" aria-modal="true" aria-label="裁剪图片"><strong>裁剪图片 · 拖动选择区域</strong><div class="stage"><img alt="原始图片"><div class="cropbox"></div></div><div class="row"></div><p class="hint">裁剪在本地生成 PNG，保留原图。GIF / SVG 将转为静态图片。</p><button class="confirm">确认裁剪</button> <button class="cancel">取消</button></div>'
    cropState={...info,x:0,y:0,w:info.width,h:info.height};const img=modal.querySelector('img');img.src='data:image/png;base64,'+info.base64
    const update=()=>{const r=img.getBoundingClientRect();Object.assign(modal.querySelector('.cropbox').style,{left:cropState.x/info.width*r.width+'px',top:cropState.y/info.height*r.height+'px',width:cropState.w/info.width*r.width+'px',height:cropState.h/info.height*r.height+'px'});for(const input of modal.querySelectorAll('input'))input.value=cropState[input.name]}
    for(const [name,label]of [['x','X'],['y','Y'],['w','宽'],['h','高']]){const row=document.createElement('label');row.textContent=label;const input=document.createElement('input');input.type='number';input.min=name==='x'||name==='y'?'0':'1';input.name=name;input.setAttribute('aria-label','裁剪'+label);input.onchange=()=>{cropState[name]=Math.round(Number(input.value));update()};row.append(input);modal.querySelector('.row').append(row)}
    img.onload=update;let origin
    const point=e=>{const r=img.getBoundingClientRect();return{x:Math.round(Math.max(0,Math.min(1,(e.clientX-r.x)/r.width))*info.width),y:Math.round(Math.max(0,Math.min(1,(e.clientY-r.y)/r.height))*info.height)}}
    const stage=modal.querySelector('.stage');stage.onpointerdown=e=>{origin=point(e);stage.setPointerCapture(e.pointerId)};stage.onpointermove=e=>{if(!origin)return;const p=point(e);Object.assign(cropState,{x:Math.min(p.x,origin.x),y:Math.min(p.y,origin.y),w:Math.abs(p.x-origin.x),h:Math.abs(p.y-origin.y)});update()};stage.onpointerup=()=>{origin=null}
    modal.querySelector('.cancel').onclick=()=>{modal.hidden=true;cropState=null}
    modal.querySelector('.confirm').onclick=()=>{const r={x:cropState.x,y:cropState.y,width:cropState.w,height:cropState.h};if(r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>info.width||r.y+r.height>info.height){message('裁剪范围无效。');return}request('crop',{targetId:info.targetId,src:info.src,rect:r},src=>{mutate(()=>{const p=patch(info.targetId),width=items.get(info.targetId).el.getBoundingClientRect().width;p.attrs={...(p.attrs||{}),src};p.styles={...(p.styles||{}),width:width+'px',height:width*r.height/r.width+'px'}});modal.hidden=true;cropState=null})}
    modal.querySelector('.cancel').focus()
  }
  function run(action,value){
    if(action==='region'){finishText();closeMenus();regionMode=!regionMode;region=null;selected=[];drag=null;root.querySelector('.region-surface').hidden=!regionMode;hover.hidden=true;status.textContent=regionMode?'拖动框选要新增内容的区域 · Esc 取消':'';error.textContent='';root.querySelector('.notice').hidden=!regionMode;paint();return}
    if(action==='undo'||action==='redo'){finishText();const next=index+(action==='undo'?-1:1);if(next>=0&&next<history.length){index=next;changes=copy(history[index]);revision++;renderChanges();status.textContent='有修改，等待保存…'}return}
    if(action==='save'||action==='retry'){finishText();events.push({type:'save'});return}
    if(action==='delete'&&region){region=null;closeMenus();paint();return}
    if(action==='delete')return mutate(()=>{for(const item of mapped())patch(item.id).deleted=true})
    if(action==='style')return style(value.name,value.value)
    if(action==='text'){const item=ensureItem(selected[0]);if(!item?.textEditable)throw Error('文字不可编辑');return mutate(()=>setText(item,String(value)))}
    if(action==='aiPanel'){toggleMenu('ai');return}
    if(action==='resize'){message('拖动图片右下角控制点，等比例调整大小。');return}
    if(action==='bold')return style('font-weight',getComputedStyle(selected[0]||document.body).fontWeight==='700'?'400':'700')
    if(action==='italic')return style('font-style',getComputedStyle(selected[0]||document.body).fontStyle==='italic'?'normal':'italic')
    if(action==='underline'||action==='strike'){const bit=action==='underline'?'underline':'line-through',tokens=getComputedStyle(selected[0]||document.body).textDecorationLine.split(' ').filter(v=>v!=='none');return style('text-decoration',(tokens.includes(bit)?tokens.filter(v=>v!==bit):[...tokens,bit]).join(' ')||'none')}
    if(action==='smaller'||action==='larger')return style('font-size',Math.max(10,Math.min(96,(parseFloat(getComputedStyle(selected[0]||document.body).fontSize)||16)+(action==='larger'?1:-1)))+'px')
    if(action==='clearBackground')return style('background-color','transparent')
    if(action==='clearBorder')return style('border-style','none')
    if(action==='link')return mutate(()=>{const href=root.querySelector('.linkURL').value;if(!['http:','https:','mailto:','tel:','file:'].includes(new URL(href,location.href).protocol))throw Error('链接地址不受支持。');for(let item of mapped()){if(item.tag==='a'){patch(item.id).attrs={href};if(item.textEditable)setText(item,root.querySelector('.linkText').value)}else{item=ensureItem(item.el,true);if(!item.textEditable)throw Error('请选择文字添加链接。');const anchor=document.createElement('a');anchor.href=href;anchor.textContent=root.querySelector('.linkText').value||item.el.textContent;setText(item,anchor.outerHTML,true)}}closeMenus()})
    if(action==='replace'||action==='crop'){try{const [item]=mapped();if(selected.length!==1||item.tag!=='img')throw Error('请选择一张图片。');if(item.el.closest('picture'))throw Error('响应式 picture 图片请使用 AI 修改。');request(action==='replace'?'replace':'original',{targetId:item.id,src:item.el.getAttribute('src')},result=>{if(action==='replace'){if(result)mutate(()=>{patch(item.id).attrs={src:result}})}else cropDialog({...result,targetId:item.id,src:item.el.getAttribute('src')})})}catch(e){message(e.message)}return}
    if(action==='draft')return ai()
  }
  for(const button of root.querySelectorAll('[data-action]'))button.onclick=()=>{run(button.dataset.action);syncFields()}
  root.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault()})
  for(const input of root.querySelectorAll('[data-style]')){input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}};input.onchange=()=>{if(input.type==='number'&&!input.checkValidity()){message('属性值超出范围。');return}style(input.dataset.style,input.value+(input.dataset.style==='font-size'?'px':''));syncFields()}}
  let menuName='',capturing=false
  function closeMenus(){menuName='';for(const p of root.querySelectorAll('[data-panel]'))p.hidden=true;for(const b of root.querySelectorAll('[data-menu]'))b.setAttribute('aria-expanded','false')}
  function positionBar(){
    bar.hidden=capturing||(!selected.length&&!region)||!!cropState
    if(bar.hidden)return
    const el=selected[0],text=!region&&selected.length===1&&textCapable(el),image=!region&&selected.length===1&&el.tagName==='IMG'
    root.querySelector('.text-tools').hidden=!text;root.querySelector('.image-tools').hidden=!image;root.querySelector('.block-tools').hidden=!!region||text||image||selected.length>1
    root.querySelector('.ai').placeholder=region?'说说你想在这里添加什么':'说说你想怎么修改';root.querySelector('[data-action=delete]').title=region?'取消区域':'删除';
    const r=region?regionBox():box(el),w=bar.offsetWidth,h=bar.offsetHeight
    const x=Math.max(4,Math.min(innerWidth-w-4,r.x+(r.width-w)/2)),y=r.y>=h+12?r.y-h-8:Math.min(innerHeight-h-4,r.y+r.height+8)
    Object.assign(bar.style,{left:x+'px',top:Math.max(4,y)+'px'})
    for(const pop of root.querySelectorAll('[data-panel]'))if(!pop.hidden){const b=bar.getBoundingClientRect(),anchor=root.querySelector(`[data-menu="${pop.dataset.panel}"]`)?.getBoundingClientRect()||b;Object.assign(pop.style,{left:Math.max(8,Math.min(innerWidth-pop.offsetWidth-8,anchor.x))+'px',top:Math.max(8,b.bottom+6+pop.offsetHeight<innerHeight?b.bottom+6:b.top-pop.offsetHeight-6)+'px'})}
  }
  function toggleMenu(name){const open=name!==menuName;closeMenus();if(!open)return;menuName=name;root.querySelector(`[data-panel="${name}"]`).hidden=false;root.querySelector(`[data-menu="${name}"]`)?.setAttribute('aria-expanded','true');positionBar();if(name==='ai')root.querySelector('.ai').focus()}
  for(const b of root.querySelectorAll('[data-menu]'))b.onclick=()=>toggleMenu(b.dataset.menu)
  for(const b of root.querySelectorAll('[data-property]'))b.onclick=()=>{style(b.dataset.property,b.dataset.value);syncFields();closeMenus()}
  root.querySelector('.ai').oninput=()=>{root.querySelector('[data-action=draft]').disabled=pending.size>0||!root.querySelector('.ai').value.trim()}
  root.querySelector('.ai').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();ai()}}
  function own(e){return e.composedPath().includes(host)}
  function click(e){if(own(e)||textEdit?.item.el.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();if(drag?.moved)return;choose(e.target,e.shiftKey)}
  function double(e){if(own(e))return;e.preventDefault();e.stopImmediatePropagation();choose(e.target);startText(e.target,e.clientX,e.clientY)}
  function down(e,fromRegion=false){if((own(e)&&!fromRegion)||textEdit?.item.el.contains(e.target)||e.button!==0)return;if(fromRegion){e.preventDefault();e.stopPropagation();e.target.setPointerCapture(e.pointerId)}drag={region:fromRegion,startX:e.clientX,startY:e.clientY,scrollX,scrollY,add:e.shiftKey,original:[...selected]}}
  function move(e){
    if(drag?.resize){const el=drag.resize,w=Math.max(10,drag.rect.width+e.clientX-drag.startX);el.style.setProperty('width',w+'px','important');el.style.setProperty('height',w*drag.rect.height/drag.rect.width+'px','important');paint();return}
    if(drag?.region){e.preventDefault();const x=e.clientX+scrollX,y=e.clientY+scrollY,sx=drag.startX+drag.scrollX,sy=drag.startY+drag.scrollY;if(Math.abs(x-sx)+Math.abs(y-sy)>5){drag.moved=true;region={x:Math.min(x,sx),y:Math.min(y,sy),width:Math.abs(x-sx),height:Math.abs(y-sy)};marquee.hidden=false;draw(marquee,regionBox())}return}
    if(drag){const y=e.clientY+scrollY-drag.scrollY;if(Math.abs(e.clientX-drag.startX)+Math.abs(y-drag.startY)>5){drag.moved=true;const r={x:Math.min(drag.startX,e.clientX),y:Math.min(drag.startY+drag.scrollY-scrollY,e.clientY),width:Math.abs(e.clientX-drag.startX),height:Math.abs(y-drag.startY)};marquee.hidden=false;draw(marquee,r);const found=[...document.body.querySelectorAll('*')].filter(el=>!['SCRIPT','STYLE','LINK','META'].includes(el.tagName)).filter(el=>{const b=box(el);return b.width&&b.height&&b.x>=r.x&&b.y>=r.y&&b.x+b.width<=r.x+r.width&&b.y+b.height<=r.y+r.height});selected=[...new Set([...(drag.add?drag.original:[]),...found.filter(el=>!found.some(p=>p!==el&&p.contains(el)))])];paint();if(e.clientY>innerHeight-40)scrollBy(0,18);if(e.clientY<40)scrollBy(0,-18)}return}
    if(!own(e)&&e.target instanceof Element){draw(hover,box(e.target));hover.hidden=false}
  }
  function up(){if(drag?.region){const valid=drag.moved&&region?.width>=8&&region?.height>=8;drag=null;if(valid){regionMode=false;root.querySelector('.region-surface').hidden=true;paint();toggleMenu('ai');status.textContent='输入要在区域内新增的内容';root.querySelector('.notice').hidden=false}else{region=null;paint()}return}if(drag?.resize){const el=drag.resize,w=el.style.width,h=el.style.height;mutate(()=>{patch(reverse.get(el)).styles={...(patch(reverse.get(el)).styles||{}),width:w,height:h}})}const old=drag;marquee.hidden=true;setTimeout(()=>{if(drag===old)drag=null},0)}
  function key(e){
    if(own(e)&&!['Escape'].includes(e.key))return
    if(e.key==='Escape'){if(regionMode||region){regionMode=false;region=null;drag=null;root.querySelector('.region-surface').hidden=true;closeMenus();status.textContent='';root.querySelector('.notice').hidden=true;paint()}else if(cropState){root.querySelector('.crop').hidden=true;cropState=null}else if(menuName){closeMenus()}else if(textEdit)finishText(true);else{selected=[];paint()}e.preventDefault();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();run('save');return}
    if(textEdit&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.execCommand('insertLineBreak');return}
    if(textEdit||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();run(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');return}
    if(['Delete','Backspace'].includes(e.key)){e.preventDefault();run('delete');return}
    const el=selected[0];if(!el)return
    const target={ArrowUp:el.parentElement,ArrowDown:el.firstElementChild,ArrowLeft:el.previousElementSibling,ArrowRight:el.nextElementSibling}[e.key];if(target){e.preventDefault();choose(target)}
  }
  const surface=root.querySelector('.region-surface');surface.onpointerdown=e=>down(e,true);surface.onpointercancel=()=>{region=null;drag=null;paint()};surface.onclick=e=>{e.preventDefault();e.stopPropagation()};surface.ondblclick=surface.onclick
  const listeners=[['click',click],['dblclick',double],['input',input],['paste',paste],['pointerdown',down],['pointermove',move],['pointerup',up],['keydown',key]]
  for(const [name,fn]of listeners)document.addEventListener(name,fn,true)
  const onScroll=()=>{paint();hover.hidden=true};window.addEventListener('scroll',onScroll,true);window.addEventListener('resize',onScroll)
  globalThis.__stableHtmlEditor={
    read(){return{revision,changes:copy(changes),events:events.splice(0),editingText:!!textEdit,busy:!!textEdit||!!cropState||pending.size>0||!!drag||regionMode||!!region}},
    finish(){finishText();return this.read()},
    status(value,problem=''){status.textContent=value;error.textContent=problem;root.querySelector('.notice').hidden=!value&&!problem},
    async capture(hidden,targets=[],area=null){if(hidden)window.scrollTo({left:scrollX,top:scrollY,behavior:'instant'});capturing=hidden;bar.hidden=hidden;marquee.hidden=hidden||!region;marks.hidden=hidden;root.querySelector('.notice').hidden=true;for(const p of root.querySelectorAll('[data-panel]'))p.hidden=true;hover.hidden=true;if(!hidden){positionBar();root.querySelector('.notice').hidden=!status.textContent&&!error.textContent}else await new Promise(resolve=>{const timer=setTimeout(resolve,250);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve()}))});return {width:innerWidth,height:innerHeight,regionRect:area?{x:area.rect.x-scrollX,y:area.rect.y-scrollY,width:area.rect.width,height:area.rect.height}:null,rects:targets.map(t=>{const el=document.querySelector(t.selector);return el&&el.localName===t.tag?box(el):null})}},
    restore(value){changes=copy(value);for(const p of changes){touched.add(p.id);if(p.text!==undefined||p.html!==undefined)contentTouched.add(p.id)}history=[[],copy(changes)];index=1;revision++;renderChanges()},
    resolve(id,value,problem){const callback=pending.get(id);pending.delete(id);root.querySelector('[data-action=draft]').disabled=!root.querySelector('.ai').value.trim();if(problem){message(problem);status.textContent='操作失败，可重试'}else callback?.(value)},
    choose(selector){choose(document.querySelector(selector))},run,
    dispose(){if(disposed)return;disposed=true;finishText();for(const [name,fn]of listeners)document.removeEventListener(name,fn,true);window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll);document.documentElement.removeAttribute('data-stable-editing');host.remove()},
  }
  paint();return {mapped:items.size,total:config.nodes.length}
}
module.exports={installHtmlEditor}
