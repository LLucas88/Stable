import {useEffect, useRef, useState, type RefObject} from 'react'
import {Braces, Check} from 'lucide-react'
import './SkillQuickPicker.css'

type Skill = {id:string; name:string; description?:string}
export function SkillQuickPicker({input, prompt, scope, skills, selected, onPrompt, onSelect}: {
  input:RefObject<HTMLTextAreaElement|null>; prompt:string; scope:string; skills:Skill[]; selected:string[];
  onPrompt:(text:string)=>void; onSelect:(skill:Skill)=>void
}) {
  const [caret,setCaret]=useState(0), [dismissed,setDismissed]=useState(false), [index,setIndex]=useState(0)
  const panel=useRef<HTMLDivElement>(null)
  const match=prompt.slice(0,caret).match(/(?:^|\s)\/([^\s/]*)$/u)
  const query=match?.[1].toLocaleLowerCase() ?? ''
  const rows=skills.filter(s=>`${s.name} ${s.description||''}`.toLocaleLowerCase().includes(query))
  const open=Boolean(match)&&!dismissed
  const active=Math.min(index,Math.max(0,rows.length-1))
  function choose(skill:Skill) {
    if(!match)return
    const start=caret-query.length-1
    onPrompt(prompt.slice(0,start)+prompt.slice(caret));onSelect(skill);setDismissed(true)
    requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(start,start)})
  }
  useEffect(()=>{setDismissed(true);setIndex(0)},[scope])
  useEffect(()=>{setIndex(0)},[query])
  useEffect(()=>{
    const field=input.current;if(!field)return
    const update=()=>{setCaret(field.selectionStart);setDismissed(false)}
    const move=(event:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))update()}
    const blur=()=>setDismissed(true)
    field.addEventListener('input',update);field.addEventListener('select',update);field.addEventListener('click',update);field.addEventListener('blur',blur);field.addEventListener('keyup',move)
    return()=>{field.removeEventListener('input',update);field.removeEventListener('select',update);field.removeEventListener('click',update);field.removeEventListener('blur',blur);field.removeEventListener('keyup',move)}
  },[input])
  useEffect(()=>{
    const field=input.current;if(!field||!open)return
    field.setAttribute('aria-controls','skill-quick-list');field.setAttribute('aria-expanded','true')
    if(rows.length)field.setAttribute('aria-activedescendant',`skill-quick-${active}`)
    const key=(event:KeyboardEvent)=>{
      if(event.isComposing||event.keyCode===229)return
      if(!['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key))return
      event.preventDefault();event.stopImmediatePropagation()
      if(event.key==='Escape')setDismissed(true)
      else if(event.key==='Enter'){if(rows[active])choose(rows[active])}
      else setIndex((active+(event.key==='ArrowDown'?1:-1)+rows.length)%Math.max(1,rows.length))
    }
    field.addEventListener('keydown',key)
    panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})
    return()=>{field.removeEventListener('keydown',key);field.removeAttribute('aria-controls');field.removeAttribute('aria-expanded');field.removeAttribute('aria-activedescendant')}
  })
  if(!open)return null
  return <div className="skill-quick-picker" ref={panel} onMouseDown={e=>e.preventDefault()}>
    <div className="skill-quick-heading">技能 <span>↑ ↓ 选择 · Enter 添加 · Esc 关闭</span></div>
    <div id="skill-quick-list" role="listbox" aria-label="快捷选择技能">
      {rows.map((skill,i)=><button type="button" id={`skill-quick-${i}`} role="option" aria-selected={i===active} key={skill.id} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(skill)}><Braces size={16}/><strong>{skill.name}</strong><span>{skill.description||'添加到对话'}</span>{selected.includes(skill.id)&&<Check size={15}/>}</button>)}
      {!rows.length&&<p>没有匹配的已启用技能</p>}
    </div>
  </div>
}
