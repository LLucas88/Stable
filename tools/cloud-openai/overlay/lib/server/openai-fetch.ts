import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { getRuntimeEnv } from './env';
let agent: ProxyAgent | undefined;
export async function providerFetch(request: Request): Promise<Response> {
  if(new URL(request.url).origin!=='https://api.openai.com')return fetch(request);
  const proxy=getRuntimeEnv().OPENAI_HTTPS_PROXY;
  if(!proxy)return fetch(request);
  // Server-managed local egress only. Never accept proxy settings from a user request.
  if(proxy!=='http://127.0.0.1:10808')throw Error('OpenAI proxy configuration is not allowed');
  agent??=new ProxyAgent(proxy);
  const response=await undiciFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:await request.arrayBuffer(),signal:request.signal,redirect:'manual',dispatcher:agent});
  return new Response(response.body as unknown as ReadableStream,{status:response.status,statusText:response.statusText,headers:Object.fromEntries(response.headers)});
}
