import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function SidebarActionMenu({anchor,label,onClose,children}:{anchor:HTMLElement;label:string;onClose:()=>void;children:ReactNode}){
  const menu=useRef<HTMLDivElement>(null),closeRef=useRef(onClose)
  closeRef.current=onClose
  const [position,setPosition]=useState<CSSProperties>({visibility:'hidden'})
  useLayoutEffect(()=>{
    const element=menu.current
    if(!element)return
    function place(){
      if(!anchor.isConnected||!anchor.getClientRects().length){closeRef.current();return}
      const bounds=anchor.getBoundingClientRect(),size=element!.getBoundingClientRect()
      const left=Math.min(bounds.right+8,Math.max(8,window.innerWidth-size.width-8))
      const top=Math.max(8,Math.min(bounds.top,window.innerHeight-size.height-8))
      setPosition({left,top,visibility:'visible','--menu-arrow-top':Math.max(12,Math.min(size.height-12,bounds.top+bounds.height/2-top))+'px'} as CSSProperties)
    }
    place();element.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true})
    const observer=new ResizeObserver(place);observer.observe(element)
    const outside=(event:PointerEvent)=>{if(!element.contains(event.target as Node)&&!anchor.contains(event.target as Node))closeRef.current()}
    const scroll=(event:Event)=>{if(!element.contains(event.target as Node))closeRef.current()}
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();anchor.focus({preventScroll:true})}
      else if(event.key==='Tab')closeRef.current()
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const items=Array.from(element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
        const index=items.indexOf(document.activeElement as HTMLButtonElement)
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length
        items[next]?.focus()
      }
    }
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',place)
    return()=>{observer.disconnect();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',place)}
  },[anchor])
  return createPortal(<div ref={menu} className="conversation-action-menu sidebar-action-menu" role="menu" aria-label={label} style={position}>{children}</div>,document.getElementById('root')||document.body)
}
