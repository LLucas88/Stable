import { providerFetch } from './openai-fetch';
import { authenticateRequest } from './auth';
import { assertAllowedUpstream, getD1 } from './env';
import { getModelSnapshot, resolveProviderKey } from './model-catalog';
import { AppError, noStoreJson } from './http';
import { canonicalJson, normalizeUsage, calculateActualCostMicros } from '../core/gateway';
import { sha256 } from './crypto';
import { markInflight, markUncertain, releaseRequest, reserveRequest } from './quota';
import { upstreamError } from '../core/upstream-error';
import { validateOpenAIImageBody, imageReservation } from '../core/openai-images';

export async function handleOpenAIImage(request: Request, parsed: unknown) {
  const auth=await authenticateRequest(request);
  let body; try {body=validateOpenAIImageBody(parsed);}catch{throw new AppError(400,'invalid_image_request','图片模型、质量、尺寸或背景参数无效。');}
  const key=request.headers.get('idempotency-key')||'';
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key))throw new AppError(400,'invalid_idempotency_key','需要有效的 Idempotency-Key。');
  const db=await getD1(), fingerprint=await sha256(canonicalJson(body));
  const previous=await db.prepare(`SELECT r.request_fingerprint,r.state,i.response_json FROM gateway_requests r LEFT JOIN gateway_image_results i ON i.request_id=r.id WHERE r.account_id=? AND r.idempotency_key=?`).bind(auth.account.id,key).first<{request_fingerprint:string,state:string,response_json:string|null}>();
  if(previous){
    if(previous.request_fingerprint!==fingerprint)throw new AppError(409,'idempotency_conflict','同一标识不能使用不同生图参数。');
    if(previous.state==='settled'&&previous.response_json)return noStoreJson(JSON.parse(previous.response_json));
    throw new AppError(409,'image_result_unknown','原生图请求已记录，禁止重复提交；请联系管理员核对结果。');
  }
  const model=await getModelSnapshot(body.model);
  if(model.provider!=='openai'||model.upstreamModel!==body.model||assertAllowedUpstream(model.upstreamBaseUrl).href.replace(/\/$/,'')!=='https://api.openai.com/v1')throw new AppError(503,'image_not_configured','GPT Image 尚未配置。');
  const providerKey=resolveProviderKey(model);
  const reservation=await reserveRequest({auth,model,body,idempotencyKey:key,estimate:imageReservation(body,model)});
  if(request.signal.aborted){await releaseRequest(reservation,'client_aborted_before_upstream');throw new AppError(499,'client_closed_request','请求已取消。');}
  await markInflight(reservation);
  let response:Response;
  // Finish persisting an accepted result even when the client disconnects. Never resubmit an uncertain request.
  try {response=await providerFetch(new Request('https://api.openai.com/v1/images/generations',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(480000),headers:{authorization:`Bearer ${providerKey}`,'content-type':'application/json'},body:JSON.stringify({...body,n:1,output_format:'png'})}));}
  catch{await markUncertain(reservation,'image_upstream_network');throw new AppError(502,'image_result_unknown','生图结果未知，已阻止重复提交。');}
  if(!response.ok){await response.body?.cancel();if(response.status>=400&&response.status<500)await releaseRequest(reservation,`upstream_${response.status}`);else await markUncertain(reservation,`upstream_${response.status}`);const e=upstreamError(response.status);throw new AppError(e.status,e.code,e.message);}
  try{
    if(!response.body)throw Error('missing');
    const reader=response.body.getReader(), chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>28*1024*1024)throw Error('large');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
    const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
    const data=JSON.parse(new TextDecoder().decode(all));
    if(data.data?.length!==1||typeof data.data[0].b64_json!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.data[0].b64_json))throw Error('invalid');
    const usage=normalizeUsage(data.usage);
    if(!usage||Number(data.usage.input_tokens_details?.image_tokens||0)!==0)throw Error('unexpected_image_input');
    const actual=calculateActualCostMicros(usage,model), now=Date.now();
    const result={created:data.created,data:[{b64_json:data.data[0].b64_json}],usage:data.usage};
    await db.batch([
      db.prepare('INSERT INTO gateway_image_results(request_id,response_json,created_at) VALUES (?,?,?)').bind(reservation.id,JSON.stringify(result),now),
      db.prepare(`UPDATE gateway_requests SET state='settled',actual_micros=?,prompt_tokens=?,completion_tokens=?,billing_snapshot_json=?,completed_at=?,updated_at=? WHERE id=? AND state='inflight'`).bind(actual,usage.promptTokens,usage.completionTokens,JSON.stringify({version:1,kind:'openai-image-tokens',priceVersionId:model.priceVersionId,usage,actualMicros:actual}),now,now,reservation.id),
    ]);
    return noStoreJson(result);
  }catch{await markUncertain(reservation,'image_result_persist_failed');throw new AppError(502,'image_result_unknown','图片结果或计费用量未能确认，禁止重复生成，请联系管理员。');}
}
