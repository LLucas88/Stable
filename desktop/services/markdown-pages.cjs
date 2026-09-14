'use strict'
const {renderMarkdownDocument}=require('./preview.cjs')
function markdownPages(content,maxChars=60000){
 const pages=[];let buffer=[],length=0,header='',fence='';
 const lines=content.split('\n');
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(length>=maxChars&&buffer.length){pages.push(buffer.join('\n')+(fence?'\n'+fence:''));buffer=fence?[fence]:header?[header]:[];length=buffer.join('\n').length;}
  buffer.push(line);length+=line.length+1;
  if(/^\s*(```|~~~)/.test(line)){const marker=line.trim().slice(0,3);fence=fence?'':marker;header=''}
  if(!fence){if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||''))header=line+'\n'+lines[i+1];else if(!line.trim().startsWith('|')&&!/^\s*\|?\s*:?-{3,}/.test(line))header=''}
 }
 if(buffer.length)pages.push(buffer.join('\n'));return pages;
}
function markdownPageDocument(pages,page,title,theme){
 if(!Number.isInteger(page)||page<0||page>=pages.length)throw Error('预览页码无效。')
 const nav=pages.length>1?`<nav style="position:sticky;top:0;background:inherit;padding:12px;border-bottom:1px solid #999;display:flex;gap:20px;align-items:center">${page?`<a href="stable-markdown-page:${page-1}">上一页</a>`:''}<span>第 ${page+1} / ${pages.length} 页 · 完整内容分页显示</span>${page+1<pages.length?`<a href="stable-markdown-page:${page+1}">下一页</a>`:''}</nav>`:''
 return renderMarkdownDocument(pages[page],title,theme).replace('<main>','<main>'+nav)
}
module.exports={markdownPages,markdownPageDocument}
