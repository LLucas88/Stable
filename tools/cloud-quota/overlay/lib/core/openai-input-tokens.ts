type Reason = 'timeout' | 'cancelled' | 'network' | 'tls' | 'authentication' | 'rate_limit' | 'upstream_unavailable' | 'invalid_request' | 'redirect' | 'invalid_response' | 'response_too_large' | 'unknown';
type Failure = { reason: Reason; retryable: boolean; status?: number; retryAfterMs?: number };
export type CountDiagnostic = { event: 'input_token_count'; at: string; diagnosticId: string; attempt: number; outcome: 'failed' | 'recovered'; reason?: Reason; upstreamStatus?: number; elapsedMs: number; retrying: boolean };
export class InputTokenCountError extends Error {
  readonly code = 'input_token_count_unavailable';
  readonly diagnosticId: string;
  readonly reason: Reason;
  constructor(reason: Reason = 'unknown', diagnosticId = crypto.randomUUID()) {
    const detail = reason === 'cancelled' ? '客户端已取消本次额度核算' : reason === 'timeout' ? '核算接口超时' : reason === 'rate_limit' ? '核算接口暂时限流' : reason === 'authentication' ? '核算接口鉴权失败，请联系管理员' : reason === 'invalid_request' ? '核算接口拒绝了请求参数' : reason === 'network' || reason === 'tls' ? '核算接口连接异常' : reason === 'upstream_unavailable' ? '核算服务暂时不可用' : '核算接口返回异常';
    super(`暂时无法核算本次请求额度（${detail}），尚未提交模型生成。诊断编号：${diagnosticId}`);
    this.reason = reason; this.diagnosticId = diagnosticId;
  }
}
export function tokenCountBody(body: Record<string, unknown>) {
  return Object.fromEntries(['model', 'input', 'tools', 'tool_choice', 'parallel_tool_calls', 'text', 'reasoning'].filter(key => body[key] !== undefined).map(key => [key, body[key]]));
}
function classify(error: unknown): Failure {
  if (error && typeof error === 'object' && 'countFailure' in error) return (error as { countFailure: Failure }).countFailure;
  const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code ?? (error as { code?: string })?.code;
  if (['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(code ?? '')) return { reason: 'tls', retryable: false };
  if (['ECONNRESET','ETIMEDOUT','ECONNREFUSED','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET'].includes(code ?? '')) return { reason: 'network', retryable: true };
  return { reason: 'unknown', retryable: false };
}
function fail(reason: Reason, retryable = false, status?: number, retryAfterMs?: number): never { throw { countFailure: { reason, retryable, status, retryAfterMs } }; }
function httpFailure(r: Response): never {
  const retry = r.headers.get('retry-after');
  const retryAfterMs = retry === null ? undefined : /^\d+(\.\d+)?$/.test(retry) ? Number(retry)*1000 : Math.max(0, Date.parse(retry)-Date.now());
  if (r.status === 401 || r.status === 403) fail('authentication',false,r.status);
  if (r.status === 429) fail('rate_limit',true,r.status,retryAfterMs);
  if ([408,500,502,503,504].includes(r.status)) fail('upstream_unavailable',true,r.status,retryAfterMs);
  if (r.status >= 300 && r.status < 400) fail('redirect',false,r.status);
  fail('invalid_request',false,r.status);
}
export async function countOpenAIInputTokens({ body, providerKey, signal, fetchImpl, timeoutMs = 15_000, totalTimeoutMs = 20_000, retryDelayMs = 250, onDiagnostic = entry => console.warn(JSON.stringify(entry)) }: {
  body: Record<string, unknown>; providerKey: string; signal: AbortSignal;
  fetchImpl: (request: Request) => Promise<Response>; timeoutMs?: number; totalTimeoutMs?: number; retryDelayMs?: number;
  onDiagnostic?: (entry: CountDiagnostic) => void;
}): Promise<number> {
  const id = crypto.randomUUID(), started = Date.now();
  const budget = Math.max(1,Math.min(20_000,totalTimeoutMs)), perAttempt = Math.max(1,Math.min(15_000,timeoutMs));
  const payload = JSON.stringify(tokenCountBody(body));
  const log = (entry: Omit<CountDiagnostic,'event'|'at'|'diagnosticId'|'elapsedMs'>) => { try { onDiagnostic({event:'input_token_count',at:new Date().toISOString(),diagnosticId:id,elapsedMs:Date.now()-started,...entry}); } catch {} };
  let finalReason: Reason = 'timeout';
  // At most two COUNT calls within 20 seconds. No generation or quota writes.
  for (let attempt=1;attempt<=2;attempt++) {
    const remaining=budget-(Date.now()-started);
    if (signal.aborted || remaining<=0) { finalReason=signal.aborted?'cancelled':'timeout';log({attempt,outcome:'failed',reason:finalReason,retrying:false});break; }
    const timer=AbortSignal.timeout(Math.min(perAttempt,remaining));
    const deadline=AbortSignal.any([signal,timer]);
    let reader: ReadableStreamDefaultReader<Uint8Array>|undefined, status: number|undefined, abort: (()=>void)|undefined;
    const interrupted=new Promise<never>((_,reject)=>{abort=()=>{void reader?.cancel().catch(()=>{});reject({countFailure:{reason:signal.aborted?'cancelled':'timeout',retryable:!signal.aborted}})};deadline.addEventListener('abort',abort,{once:true});});
    const run=async()=>{
      const response=await fetchImpl(new Request('https://api.openai.com/v1/responses/input_tokens',{method:'POST',redirect:'manual',signal:deadline,headers:{authorization:`Bearer ${providerKey}`,'content-type':'application/json'},body:payload}));
      status=response.status;
      if(deadline.aborted){void response.body?.cancel().catch(()=>{});fail(signal.aborted?'cancelled':'timeout',!signal.aborted);}
      if(!response.ok){void response.body?.cancel().catch(()=>{});httpFailure(response);}
      if(!response.body)fail('invalid_response');
      reader=response.body.getReader();const chunks: Uint8Array[]=[];let bytes=0;
      for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>16384)fail('response_too_large');chunks.push(item.value);}
      const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength;}
      let value;try{value=JSON.parse(new TextDecoder().decode(all));}catch{fail('invalid_response');}
      if(!value || value.object!=='response.input_tokens'||!Number.isSafeInteger(value.input_tokens)||value.input_tokens<0)fail('invalid_response');
      return value.input_tokens as number;
    };
    let failure: Failure;
    try { const count=await Promise.race([run(),interrupted]);if(signal.aborted)fail('cancelled');if(attempt>1)log({attempt,outcome:'recovered',upstreamStatus:status,retrying:false});return count; }
    catch(e){failure=signal.aborted?{reason:'cancelled',retryable:false}:classify(e);}
    finally{if(abort)deadline.removeEventListener('abort',abort);void reader?.cancel().catch(()=>{});}
    finalReason=failure.reason;
    const delay=Math.max(Math.min(2000,Math.max(0,retryDelayMs)),Number.isFinite(failure.retryAfterMs)?failure.retryAfterMs!:0);
    const retrying=attempt<2&&failure.retryable&&!signal.aborted&&delay+1<budget-(Date.now()-started);
    log({attempt,outcome:'failed',reason:failure.reason,upstreamStatus:failure.status??status,retrying});
    if(!retrying)break;
    await new Promise<void>(resolve=>{let handle:ReturnType<typeof setTimeout>;const finish=()=>{clearTimeout(handle);signal.removeEventListener('abort',finish);resolve();};handle=setTimeout(finish,delay);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish();});
  }
  throw new InputTokenCountError(finalReason,id);
}
