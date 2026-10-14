'use strict'
const fs = require('node:fs'), path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { parse } = require('parse5')
const { resolveWorkspaceEntry } = require('./preview.cjs')
const {safeRichText,validateTarget,withOverrides}=require('./html-editor-overrides.cjs')
const hash = value => createHash('sha256').update(value).digest('hex')
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const properties = new Set(['color','background-color','border-color','border-width','border-style','font-size','font-weight','font-style','text-decoration','text-align','font-family','line-height','opacity','width','height'])
const forbidden = new Set(['html','head','body','script','style','link','meta','base','iframe','object','embed','canvas','svg','template','input','textarea','select','option'])
function parseSource(source) {
  const bom=source.charCodeAt(0)===0xfeff?1:0
  const nodes = [], tree = parse(source.slice(bom), {sourceCodeLocationInfo:true})
  function walk(node, selector='') {
    for (const child of node.childNodes || []) {
      if (!child.tagName) continue
      const siblings = node.childNodes.filter(n=>n.tagName===child.tagName)
      const route = selector ? `${selector} > ${child.tagName}:nth-of-type(${siblings.indexOf(child)+1})` : child.tagName
      const loc = child.sourceCodeLocation && JSON.parse(JSON.stringify(child.sourceCodeLocation), (key,value)=>['startOffset','endOffset'].includes(key)?value+bom:value)
      if (loc?.startTag && !forbidden.has(child.tagName) && child.namespaceURI==='http://www.w3.org/1999/xhtml') {
        nodes.push({id:String(loc.startOffset),tag:child.tagName,selector:route,attrs:Object.fromEntries(child.attrs.map(a=>[a.name,a.value])),location:loc,
          textEditable:!!loc.endTag && (child.childNodes||[]).every(n=>n.nodeName==='#text'||n.tagName==='br')})
      }
      if (!['svg','template'].includes(child.tagName)) walk(child,route)
    }
  }
  walk(tree); return nodes
}
function compile(source, nodes, changes) {
  if (!Array.isArray(changes) || changes.length>10000) throw Error('编辑操作过多。')
  const byId = new Map(nodes.map(n=>[n.id,n])), edits=[], ids=new Set(), deleted=[], live=[], persistent=[]
  for (const change of changes) {
    if(change.target){const target=validateTarget(change.target);if(change.id!=='live:'+target.selector)throw Error('动态元素标识无效。');byId.set(change.id,{tag:target.tag,attrs:{},live:true,textEditable:true})}
    const node=byId.get(change.id)
    if (!node || ids.has(change.id)) throw Error('元素定位失效，请重新打开编辑。')
    ids.add(change.id)
    if (change.deleted===true&&!node.live) deleted.push(node.location)
  }
  for (const change of changes) {
    const node=byId.get(change.id), loc=node.location
    if (!node.live&&deleted.some(d=>d.startOffset<loc.startOffset&&d.endOffset>=loc.endOffset)) continue
    if (change.deleted===true) {if(node.live)live.push({target:validateTarget(change.target),deleted:true});else edits.push({start:loc.startOffset,end:loc.endOffset,value:''});continue}
    const attrs = {...(change.attrs||{})}
    for (const [name,value] of Object.entries(attrs)) {
      if (!['style','href','src'].includes(name) || typeof value!=='string' || value.length>20000) throw Error('无效元素属性。')
      if (name==='href' && !['http:','https:','mailto:','tel:','file:'].includes(new URL(value,'https://stable.local/').protocol)) throw Error('链接地址不受支持。')
      if (name==='src' && (node.tag!=='img'||!/^\.\/[^?#]+\.assets\/images\/[a-z0-9-]+\.(png|jpg|jpeg|webp|gif|svg)$/i.test(value))) throw Error('图片必须使用本地编辑资源。')
      if (name==='style') throw Error('请使用受限样式操作。')
    }
    if (change.styles) {
      // Preserve the original declaration verbatim; append only allowlisted overrides.
      let style=node.attrs.style||''
      for (const [name,value] of Object.entries(change.styles)) {
        if (!properties.has(name)||typeof value!=='string'||value.length>200||/[;{}<>\\]|url\s*\(|expression\s*\(|@/i.test(value)) throw Error('无效样式值。')
        style+=`;${name}:${value} !important`
      }
      attrs.style=style
    }
    if(node.live){
      delete attrs.style
      if(change.text!==undefined&&(typeof change.text!=='string'||change.text.length>100000))throw Error('文字内容无效。')
      live.push({target:validateTarget(change.target),...(change.text!==undefined?{text:change.text}:{}),...(change.html!==undefined?{html:safeRichText(change.html)}:{}),styles:change.styles,attrs});continue
    }
    for (const [name,value] of Object.entries(attrs)) {
      const attr=loc.attrs?.[name]
      edits.push(attr?{start:attr.startOffset,end:attr.endOffset,value:`${name}="${escape(value)}"`}:{start:loc.startTag.endOffset-(source[loc.startTag.endOffset-2]==='/'?2:1),end:loc.startTag.endOffset-(source[loc.startTag.endOffset-2]==='/'?2:1),value:` ${name}="${escape(value)}"`})
      if(name==='src'&&loc.attrs?.srcset)edits.push({start:loc.attrs.srcset.startOffset,end:loc.attrs.srcset.endOffset,value:''})
    }
    if (change.text!==undefined) {
      if (!node.textEditable||typeof change.text!=='string'||change.text.length>100000) throw Error('请选择具体文字元素；动态内容请交给 AI。')
      edits.push({start:loc.startTag.endOffset,end:loc.endTag.startOffset,value:escape(change.text).replace(/\r?\n/g,'<br>')})
    }
    // A saved report may already contain rendered markup which its scripts recreate on load.
    if (/<script\b/i.test(source)) persistent.push({node,change})
  }
  edits.sort((a,b)=>b.start-a.start||b.end-a.end)
  let end=source.length,output=source
  for (const edit of edits) {if(edit.end>end)throw Error('编辑范围重叠。');output=output.slice(0,edit.start)+edit.value+output.slice(edit.end);end=edit.start}
  if(persistent.length){
    const patched=new Map(parseSource(output).map(node=>[node.location.startOffset,node]))
    for(const {node,change} of persistent){
      const offset=node.location.startOffset+edits.filter(e=>e.end<=node.location.startOffset).reduce((sum,e)=>sum+e.value.length-(e.end-e.start),0)
      const target=patched.get(offset);if(!target||target.tag!==node.tag)throw Error('编辑后的元素定位失效。')
      live.push({target:{selector:target.selector,tag:target.tag},...(change.text!==undefined?{html:escape(change.text).replace(/\r?\n/g,'<br>')}:{}),styles:change.styles,attrs:change.attrs})
    }
  }
  return live.length?withOverrides(output,live):output
}
class HtmlDocument {
  constructor(file, roots) {
    this.roots=roots;this.path=resolveWorkspaceEntry(file,roots,{fileOnly:true}).path
    if (!/\.html?$/i.test(this.path)) throw Error('仅支持本地 HTML 文件。')
    const buffer=fs.readFileSync(this.path)
    if (buffer.length>20*1024*1024) throw Error('HTML 文件超过 20 MB。')
    this.source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer)
    if (/<meta[^>]*charset\s*=\s*["']?\s*(?!utf-8\b|utf8\b)[\w-]+/i.test(this.source)) throw Error('请先将 HTML 转换为 UTF-8 编码。')
    this.nodes=parseSource(this.source);this.version=hash(buffer);this.changes=[]
  }
  save(changes) {
    resolveWorkspaceEntry(this.path,this.roots,{fileOnly:true})
    const output=compile(this.source,this.nodes,changes)
    if (hash(fs.readFileSync(this.path))!==this.version) throw Error('文件已被 AI 或其他程序修改。已保留编辑草稿，请另存副本或重新载入。')
    if (hash(output)===this.version) {this.changes=changes;return this.version}
    const temporary=path.join(path.dirname(this.path),`.stable-edit-${randomUUID()}.tmp`)
    try {
      fs.writeFileSync(temporary,output,{flag:'wx',mode:fs.statSync(this.path).mode})
      if(hash(fs.readFileSync(this.path))!==this.version)throw Error('保存期间文件发生变化，请另存副本。')
      fs.renameSync(temporary,this.path)
      this.version=hash(output);this.changes=changes;return this.version
    } finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
  }
}
module.exports={HtmlDocument,parseSource,compile,hash}
