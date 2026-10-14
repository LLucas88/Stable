'use strict'
const {parseFragment}=require('parse5')
const MARKER='stable-visual-edits'
const inline=new Set(['span','b','strong','i','em','u','s','del','small','sub','sup','mark','code','br','a'])
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function safeRichText(html){
  if(typeof html!=='string'||html.length>100000)throw Error('文字内容过长。')
  function render(node){
    if(node.nodeName==='#text')return escape(node.value)
    if(!inline.has(node.tagName))throw Error('文字中包含不支持的元素。')
    const attrs=(node.attrs||[]).map(a=>{
      if(!['class','style','title','href','id'].includes(a.name)&&!/^data-[a-z0-9-]+$/.test(a.name)&&!/^aria-[a-z-]+$/.test(a.name))throw Error('文字中包含不支持的属性。')
      if(a.name==='href'&&!['http:','https:','mailto:','tel:','file:'].includes(new URL(a.value,'https://stable.local').protocol))throw Error('链接地址不受支持。')
      if(a.name==='style'&&/[<>\\]|url\s*\(|expression\s*\(|@/i.test(a.value))throw Error('文字样式无效。')
      return ` ${a.name}="${escape(a.value)}"`
    }).join('')
    return `<${node.tagName}${attrs}>`+(node.tagName==='br'?'':(node.childNodes||[]).map(render).join('')+`</${node.tagName}>`)
  }
  return parseFragment(html).childNodes.map(render).join('')
}
function validateTarget(target){
  if(!target||typeof target.selector!=='string'||target.selector.length>4000||!/^html(?: > [a-z][a-z0-9-]*:nth-of-type\([1-9]\d*\))+$/.test(target.selector)||/ > (head|script|style|iframe|object|embed|template|link|meta|base|input|textarea|select):/.test(target.selector)||!/[ >]body:nth-of-type\(1\) > /.test(target.selector))throw Error('动态元素定位无效。')
  if(typeof target.tag!=='string'||!target.selector.endsWith(` > ${target.tag}:nth-of-type(${target.selector.match(/\((\d+)\)$/)?.[1]})`))throw Error('动态元素类型无效。')
  return {selector:target.selector,tag:target.tag}
}
// Runs in an ordinary browser after the report's own scripts. It stores only
// explicit edits, so charts are not flattened into duplicated generated markup.
function applyVisualOverrides(changes){
  const key='__stableVisualOverrides';globalThis[key]?.disconnect()
  let scheduled=false
  function apply(){
    scheduled=false;if(document.documentElement.hasAttribute('data-stable-editing'))return
    observer.disconnect()
    for(const p of changes){
      const el=document.querySelector(p.target.selector);if(!el||el.localName!==p.target.tag)continue
      // Hiding a generated node preserves sibling positions across repeat renders.
      if(p.deleted){el.style.setProperty('display','none','important');continue}
      if(p.html!==undefined&&el.innerHTML!==p.html)el.innerHTML=p.html
      else if(p.text!==undefined&&el.textContent!==p.text)el.textContent=p.text
      for(const [name,value]of Object.entries(p.styles||{}))if(el.style.getPropertyValue(name)!==value||el.style.getPropertyPriority(name)!=='important')el.style.setProperty(name,value,'important')
      for(const [name,value]of Object.entries(p.attrs||{})){if(el.getAttribute(name)!==value)el.setAttribute(name,value);if(name==='src')el.removeAttribute('srcset')}
    }
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','src','srcset','href']})
  }
  const observer=new MutationObserver(()=>{if(!scheduled&&!document.documentElement.hasAttribute('data-stable-editing')){scheduled=true;queueMicrotask(apply)}})
  globalThis[key]=observer
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply()
  window.addEventListener('load',apply,{once:true})
}
function readOverrides(source){
  const expression=/<script id="stable-visual-edits" type="application\/json">([\s\S]*?)<\/script>\s*<script data-stable-visual-runtime>[\s\S]*?<\/script>/g
  let changes=[]
  const clean=source.replace(expression,(_all,data)=>{const value=JSON.parse(data);if(!Array.isArray(value))throw Error('可视化编辑记录无效。');changes=value;return ''})
  return {source:clean,changes}
}
function withOverrides(source,changes){
  const prior=readOverrides(source),merged=new Map(prior.changes.map(p=>[p.target.selector,p]))
  for(const p of changes){const old=merged.get(p.target.selector),next={...old,...p,styles:{...old?.styles,...p.styles},attrs:{...old?.attrs,...p.attrs}};if(p.text!==undefined)delete next.html;if(p.html!==undefined)delete next.text;merged.set(p.target.selector,next)}
  if(!merged.size)return prior.source
  const json=JSON.stringify([...merged.values()]).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
  return prior.source+`<script id="${MARKER}" type="application/json">${json}</script><script data-stable-visual-runtime>(${applyVisualOverrides.toString()})(JSON.parse(document.getElementById('${MARKER}').textContent));</script>`
}
module.exports={safeRichText,validateTarget,withOverrides,readOverrides}
