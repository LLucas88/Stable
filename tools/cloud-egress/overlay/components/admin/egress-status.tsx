'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/admin-client';
type Status={status:'healthy'|'degraded'|'unavailable'|'unmanaged';active:string|null;checkedAt:number;nodes:{id:string;healthy:boolean;checkedAt:number}[]};
const names:Record<string,string>={primary:'主线路',backup:'备用线路','backup-2':'备用线路 2'};
const labels={healthy:'主备线路可用',degraded:'部分线路异常，当前仍可使用',unavailable:'暂时无法连接，正在检测恢复',unmanaged:'尚未启用主备线路检查'};
export function EgressStatus(){
 const [state,setState]=useState<Status|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
  const refresh=async()=>{try{const data=await apiRequest<Status>('/api/admin/egress',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])});if(!stopped){setState(data);setFailed(false);}}catch{if(!stopped)setFailed(true);}finally{if(!stopped)timer=setTimeout(refresh,20000);}};
  void refresh();return()=>{stopped=true;controller.abort();clearTimeout(timer);};
 },[]);
 const warning=failed||state?.status==='degraded'||state?.status==='unavailable';
 return <section aria-label="OpenAI 生图连接状态" aria-live="polite" className={`mb-6 rounded-xl border p-5 ${warning?'border-amber-500/40 bg-amber-500/5':'bg-card'}`}>
  <h2 className="font-semibold">OpenAI 生图连接</h2>
  <p className="mt-2 text-sm">{failed?'状态查询失败，请稍后刷新；不能据此判断线路正常。':state?labels[state.status]:'正在检查线路状态…'}</p>
  {!failed&&state&&<><p className="mt-2 text-sm text-muted-foreground">{state.active?`当前使用：${names[state.active]||'已选线路'}`:'当前没有已确认可用的线路'}{state.nodes.length>0&&'；'+state.nodes.map(n=>`${names[n.id]||'线路'}${n.healthy?'正常':'不可用'}`).join('，')}</p><p className="mt-2 text-xs text-muted-foreground">更新时间：{new Date(state.checkedAt).toLocaleString('zh-CN')}。线路检查不生成图片；已提交但结果未知的任务不会自动重发。</p></>}
 </section>;
}
