import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { RotateCw, ChevronRight } from 'lucide-react'
import type { AgentCapability } from './types'

export function EffortSlider({options,value,model,onChange,onModels}:{options:Array<{id:AgentCapability;label:string}>;value:AgentCapability;model:string;onChange:(value:AgentCapability)=>void;onModels:()=>void}) {
  const [draft,setDraft]=useState(value)
  const committed=useRef(value)
  useEffect(()=>{setDraft(value);committed.current=value},[value,model])
  const index=Math.max(0,options.findIndex(item=>item.id===draft)),selected=options[index]
  const commit=()=>{if(selected&&committed.current!==selected.id){committed.current=selected.id;onChange(selected.id)}}
  return <div className="effort-slider-panel">
    <div className="effort-slider-heading"><span className="effort-heading-spacer"/><button type="button" className="effort-model-expand" aria-label="展开模型选择" onClick={onModels}><strong aria-live="polite">{selected?.label || '默认'}</strong><ChevronRight size={14}/></button><button type="button" disabled={!options.length} aria-label="恢复默认思考强度" title="恢复默认" onClick={()=>{setDraft('auto');committed.current='auto';onChange('auto')}}><RotateCw size={16}/></button></div>
    <div className="effort-model-name">{model}</div>
    {!options.length && <p className="composer-menu-empty" role="status">当前接口未提供可选思考强度，使用模型默认值。</p>}
    {options.length > 0 && <div className="effort-slider-track" style={{'--effort-fill':`${index/Math.max(1,options.length-1)*100}%`} as CSSProperties}>
      <div className="effort-slider-ticks" aria-hidden="true">{options.map(item=><i key={item.id}/>)}</div>
      <input type="range" min={0} max={options.length-1} step={1} value={index} aria-label="思考强度" aria-valuetext={selected?.label} onChange={e=>setDraft(options[Number(e.target.value)].id)} onPointerUp={commit} onPointerCancel={()=>setDraft(value)} onKeyUp={commit} onBlur={commit}/>
    </div>}
  </div>
}
