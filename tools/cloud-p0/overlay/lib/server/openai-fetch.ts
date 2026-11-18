import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { getRuntimeEnv } from './env';
import { AppError } from './http';
let agent: ProxyAgent | undefined;
let agentProxy: string | undefined;
export type OpenAIEgressStatus = { managed: boolean; status: 'healthy'|'degraded'|'unavailable'|'unmanaged'; active: string|null; checkedAt: number; nodes: {id:string;healthy:boolean;checkedAt:number;unstable?:boolean}[] };
export async function getOpenAIEgressStatus(): Promise<OpenAIEgressStatus> {
  if(getRuntimeEnv().OPENAI_HTTPS_PROXY!=='http://127.0.0.1:10819')return {managed:false,status:'unmanaged',active:null,checkedAt:Date.now(),nodes:[]};
  try {
    const response=await undiciFetch('http://127.0.0.1:10819/health',{redirect:'manual',signal:AbortSignal.timeout(1500)});
    const value=await response.json() as any;
    const ids=['primary','backup','backup-2'];
    if(!response.ok||value.version!==1||!['healthy','degraded','unavailable'].includes(value.status)||!Number.isFinite(value.checkedAt)||Math.abs(Date.now()-value.checkedAt)>10000||!Array.isArray(value.nodes)||value.nodes.length<2||value.nodes.length>3)throw Error('Invalid local health');
    const nodes=value.nodes.map((n:any)=>{if(!ids.includes(n.id)||typeof n.healthy!=='boolean'||!Number.isFinite(n.checkedAt))throw Error('Invalid node health');return {id:n.id as string,healthy:n.healthy as boolean,checkedAt:n.checkedAt as number,unstable:n.unstable===true};});
    if(new Set(nodes.map((n:{id:string})=>n.id)).size!==nodes.length||value.active!==null&&!nodes.some((n:{id:string;healthy:boolean})=>n.id===value.active&&n.healthy))throw Error('Invalid route health');
    const usable=nodes.filter((n:{healthy:boolean})=>n.healthy).length;
    const status=usable===nodes.length?'healthy':usable?'degraded':'unavailable';
    if(value.status!==status||!!value.active!==!!usable)throw Error('Inconsistent local health');
    return {managed:true,status,active:value.active,checkedAt:value.checkedAt,nodes};
  } catch {return {managed:true,status:'unavailable',active:null,checkedAt:Date.now(),nodes:[]};}
}
export async function assertOpenAIEgressReady() {
  const state=await getOpenAIEgressStatus();
  if(state.managed&&state.status==='unavailable')throw new AppError(503,'openai_egress_unavailable','云端图片线路暂时不可用，系统正在检测恢复。本次尚未提交生成、未预占额度，请恢复后继续原任务。');
  return state;
}
export async function providerFetch(request: Request): Promise<Response> {
  if(new URL(request.url).origin!=='https://api.openai.com')return fetch(request);
  const proxy=getRuntimeEnv().OPENAI_HTTPS_PROXY;
  if(!proxy)return fetch(request);
  // Server-managed local egress only. Never accept proxy settings from a user request.
  if(typeof proxy!=='string'||!['http://127.0.0.1:10808','http://127.0.0.1:10818','http://127.0.0.1:10819'].includes(proxy))throw Error('OpenAI proxy configuration is not allowed');
  if(!agent||agentProxy!==proxy){const previous=agent;agent=new ProxyAgent(proxy);agentProxy=proxy;void previous?.close().catch(()=>{});}
  const response=await undiciFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:await request.arrayBuffer(),signal:request.signal,redirect:'manual',dispatcher:agent});
  return new Response(response.body as unknown as ReadableStream,{status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers)});
}
