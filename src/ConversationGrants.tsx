import {useState} from 'react'
export function ConversationGrants({id}:{id:string}){
 const [items,setItems]=useState<{key:string;label:string;expiresAt:string}[]>([]),[error,setError]=useState('')
 async function load(){try{setItems(await window.stable.agent.grants(id));setError('')}catch(e){setError(String(e))}}
 return <details className="conversation-grants" onToggle={e=>{if(e.currentTarget.open)void load()}}><summary>管理已记住的授权</summary>{error&&<p role="alert">{error}</p>}{!items.length&&<p>暂无有效授权</p>}{items.map(item=><div key={item.key}><strong>{item.label}</strong><small>有效期至 {new Date(item.expiresAt).toLocaleString()}</small><button type="button" onClick={()=>void window.stable.agent.revokeGrants(id,item.key).then(load).catch(e=>setError(String(e)))}>撤销</button></div>)}</details>
}
