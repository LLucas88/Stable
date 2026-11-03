import { providerFetch } from './openai-fetch';
import { authenticateRequest } from './auth';
import { assertAllowedUpstream, getD1 } from './env';
import { getModelSnapshot, resolveProviderKey } from './model-catalog';
import { AppError, noStoreJson } from './http';
import { canonicalJson, normalizeUsage } from '../core/gateway';
import { sha256 } from './crypto';
import { markInflight, markUncertain, releaseRequest, reserveRequest } from './quota';
import { upstreamError } from '../core/upstream-error';
import { validateOpenAIImageBody, imageReservation, imageActualCost, decodeReference } from '../core/openai-images';

export async function handleOpenAIImage(request: Request, parsed: unknown, editing=false) {
  const auth=await authenticateRequest(request);
  let body; try {body=validateOpenAIImageBody(parsed,editing);}catch{throw new AppError(400,'invalid_image_request','图片模型、质量、尺寸或背景参数无效。');}
  for(const reference of body.references || []) {
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',decodeReference(reference.data)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==reference.id)throw new AppError(400,'invalid_image_reference','参考图内容与标识不一致。');
  }
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
  let estimate;try{estimate=imageReservation(body,model);}catch{throw new AppError(503,'image_input_not_configured','图片输入费率或预算尚未配置，未提交生成请求。');}
  const reservation=await reserveRequest({auth,model,body,idempotencyKey:key,estimate});
  if(request.signal.aborted){await releaseRequest(reservation,'client_aborted_before_upstream');throw new AppError(499,'client_closed_request','请求已取消。');}
  await markInflight(reservation);
  let response:Response;
  // Finish persisting an accepted result even when the client disconnects. Never resubmit an uncertain request.
  try {
    let upstreamBody:BodyInit, headers:Record<string,string>={authorization: 'Bearer '+providerKey};
    if(editing){
      const form=new FormData();
      for(const name of ['model','prompt','size','quality','background'] as const)form.set(name,body[name]);
      form.set('n','1');form.set('output_format','png');
      for(const [index,reference] of body.references!.entries()) form.append('image[]',new Blob([decodeReference(reference.data)],{type:reference.mimeType}), 'reference-'+(index+1)+(reference.mimeType==='image/png'?'.png':reference.mimeType==='image/jpeg'?'.jpg':'.webp'));
      upstreamBody=form;
    } else {headers['content-type']='application/json';upstreamBody=JSON.stringify({...body,n:1,output_format:'png'});}
    response=await providerFetch(new Request('https://api.openai.com/v1/images/'+(editing?'edits':'generations'),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(480000),headers,body:upstreamBody}));
  }
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
    if(!usage)throw Error('invalid_usage');
    const billed=imageActualCost(data.usage,model,editing),actual=billed.actual,now=Date.now();
    if(actual>reservation.reservedMicros)throw Error('reservation_exceeded');
    const result={created:data.created,data:[{b64_json:data.data[0].b64_json}],usage:data.usage};
    await db.batch([
      db.prepare('INSERT INTO gateway_image_results(request_id,response_json,created_at) VALUES (?,?,?)').bind(reservation.id,JSON.stringify(result),now),
      db.prepare(`UPDATE gateway_requests SET state='settled',actual_micros=?,prompt_tokens=?,completion_tokens=?,billing_snapshot_json=?,completed_at=?,updated_at=? WHERE id=? AND state='inflight'`).bind(actual,usage.promptTokens,usage.completionTokens,JSON.stringify({version:2,kind:'openai-image-tokens',priceVersionId:model.priceVersionId,usage,...billed,actualMicros:actual}),now,now,reservation.id),
    ]);
    return noStoreJson(result);
  }catch{await markUncertain(reservation,'image_result_persist_failed');throw new AppError(502,'image_result_unknown','图片结果或计费用量未能确认，禁止重复生成，请联系管理员。');}
}
