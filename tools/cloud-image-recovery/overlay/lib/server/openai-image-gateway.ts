import { providerFetch, assertOpenAIEgressReady } from './openai-fetch';
import { authenticateRequest } from './auth';
import { assertAllowedUpstream, getD1 } from './env';
import { getModelSnapshot, resolveProviderKey } from './model-catalog';
import { AppError, noStoreJson } from './http';
import { canonicalJson, normalizeUsage } from '../core/gateway';
import { sha256 } from './crypto';
import { markInflight, markUncertain, releaseRequest, reserveRequest } from './quota';
import { readImageFailure, knownImageRejection } from '../core/image-failure';
import { replayImage, imageFailedResponse, imageResponse } from './image-recovery';
import { validateOpenAIImageBody, imageReservation, imageActualCost, decodeReference } from '../core/openai-images';

export async function handleOpenAIImage(request: Request, parsed: unknown, editing=false) {
  const auth=await authenticateRequest(request);
  let body; try {body=validateOpenAIImageBody(parsed,editing);}catch{throw new AppError(400,'invalid_image_request','图片模型、质量、尺寸或背景参数无效。');}
  for(const reference of [...(body.references || []),body.markup,body.mask].filter(Boolean) as {id:string;data:string}[]) {
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',decodeReference(reference.data)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==reference.id)throw new AppError(400,'invalid_image_reference','参考图内容与标识不一致。');
  }
  const key=request.headers.get('idempotency-key')||'';
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(key))throw new AppError(400,'invalid_idempotency_key','需要有效的 Idempotency-Key。');
  const db=await getD1(), fingerprint=await sha256(canonicalJson(body));
  const previous=await replayImage(auth.account.id,key,fingerprint);
  if(previous)return previous;
  const model=await getModelSnapshot(body.model);
  const upstream=assertAllowedUpstream(model.upstreamBaseUrl).href.replace(/\/$/,'');
  if(model.provider!=='openai'||!model.upstreamModel)throw new AppError(503,'image_not_configured','GPT Image 尚未配置。');
  const providerKey=resolveProviderKey(model);
  let estimate;try{estimate=imageReservation(body,model);}catch(error){
    const reason=error instanceof Error?error.message:'';
    if(reason==='image_format_not_enabled')throw new AppError(400,'image_format_not_enabled',`${body.output_format?.toUpperCase()} 输出尚未启用，未提交生成请求。请选择其他格式。`);
    if(reason==='svg_price_missing')throw new AppError(400,'image_format_not_configured','SVG 计费尚未配置，未提交生成请求。请选择其他格式。');
    throw new AppError(503,'image_input_not_configured','图片输入费率或预算尚未配置，未提交生成请求。');
  }
  // Keep saved results available during an outage, and fail before reserving a
  // new official request. Approved third-party origins use their own egress.
  if(new URL(upstream).origin==='https://api.openai.com')await assertOpenAIEgressReady();
  let reservation;
  try{reservation=await reserveRequest({auth,model,body,idempotencyKey:key,estimate});}
  catch(error){
    if(error instanceof AppError&&error.code==='idempotent_replay'){
      const replay=await replayImage(auth.account.id,key,fingerprint);if(replay)return replay;
    }
    throw error;
  }
  if(request.signal.aborted){await releaseRequest(reservation,'client_aborted_before_upstream');throw new AppError(499,'client_closed_request','请求已取消。');}
  await markInflight(reservation);
  let response:Response;
  // Finish persisting an accepted result even when the client disconnects. Never resubmit an uncertain request.
  try {
    const {references,markup,mask,...parameters}=body;
    const headers:Record<string,string>={authorization:'Bearer '+providerKey,'content-type':'application/json'};
    let upstreamBody:BodyInit=JSON.stringify({...parameters,model:model.upstreamModel,n:1,output_format:body.output_format||'png',
      ...(editing?{images:references!.map(r=>({image_url:'data:'+r.mimeType+';base64,'+r.data}))}:{}),
      ...Object.fromEntries(Object.entries({markup,mask}).filter(([,r])=>r).map(([name,r])=>[name,{image_url:'data:image/png;base64,'+r!.data}]))});
    const editTransport=(model.pricingPolicy as any)?.imageEditTransport
      ?? (body.model.startsWith('gpt-image-2.5-')?'multipart':'json');
    if(editing&&editTransport==='multipart'){
      const form=new FormData();for(const [name,value]of Object.entries({...parameters,model:model.upstreamModel,n:1,output_format:body.output_format||'png'}))form.set(name,String(value));
      references!.forEach((r,i)=>form.append('image[]',new Blob([decodeReference(r.data)],{type:r.mimeType}),'reference-'+i+(r.mimeType==='image/jpeg'?'.jpg':r.mimeType==='image/webp'?'.webp':'.png')));
      for(const [name,r]of Object.entries({markup,mask}))if(r)form.set(name,new Blob([decodeReference(r.data)],{type:'image/png'}),name+'.png');
      upstreamBody=form;delete headers['content-type'];
    }
    response=await providerFetch(new Request(upstream+'/images/'+(editing?'edits':'generations'),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(480000),headers,body:upstreamBody}));
  }
  catch{await markUncertain(reservation,'image_upstream_network');return imageResponse({error:{code:'image_result_unknown',message:`生图提交结果未知，已阻止重复生成。（网关请求编号 ${reservation.id}）`}},reservation.id,502);}
  if(!response.ok){
    const failure=await readImageFailure(response);
    await db.prepare('INSERT INTO gateway_image_failures(request_id,failure_json,created_at) VALUES (?,?,?)').bind(reservation.id,JSON.stringify(failure),Date.now()).run();
    if(knownImageRejection(response.status)){
      await releaseRequest(reservation,`upstream_${response.status}`);
      return imageFailedResponse(reservation.id,failure);
    }
    await markUncertain(reservation,`upstream_${response.status}`);
    return imageResponse({error:{code:'image_result_unknown',message:`供应商未确认生图结果（HTTP ${response.status}），已阻止重复生成。请联系管理员核对。（网关请求编号 ${reservation.id}）`}},reservation.id,502);
  }
  try{
    if(!response.body)throw Error('missing');
    const reader=response.body.getReader(), chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>28*1024*1024)throw Error('large');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
    const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
    const data=JSON.parse(new TextDecoder().decode(all));
    if(data.data?.length!==1||typeof data.data[0].b64_json!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.data[0].b64_json))throw Error('invalid');
    if(body.output_format==='svg'&&!data.svg_usage)throw Error('svg_usage_missing');
    if(data.output_format&&data.output_format!==(body.output_format||'png'))throw Error('format_mismatch');
    const usage=normalizeUsage(data.usage);
    if(!usage)throw Error('invalid_usage');
    const billed=imageActualCost(data.usage,model,editing,data.svg_usage),actual=billed.actual,now=Date.now();
    if(actual>reservation.reservedMicros)throw Error('reservation_exceeded');
    const result={created:data.created,data:[{b64_json:data.data[0].b64_json}],usage:data.usage,output_format:body.output_format||'png',...(data.svg_usage?{svg_usage:data.svg_usage}:{})};
    await db.batch([
      db.prepare('INSERT INTO gateway_image_results(request_id,response_json,created_at) VALUES (?,?,?)').bind(reservation.id,JSON.stringify(result),now),
      db.prepare(`UPDATE gateway_requests SET state='settled',actual_micros=?,prompt_tokens=?,completion_tokens=?,billing_snapshot_json=?,completed_at=?,updated_at=? WHERE id=? AND state='inflight'`).bind(actual,usage.promptTokens,usage.completionTokens,JSON.stringify({version:2,kind:'openai-image-tokens',priceVersionId:model.priceVersionId,usage,...billed,actualMicros:actual}),now,now,reservation.id),
    ]);
    return imageResponse(result,reservation.id);
  }catch{await markUncertain(reservation,'image_result_persist_failed');return imageResponse({error:{code:'image_result_unknown',message:`图片结果或计费用量未能确认，禁止重复生成，请联系管理员。（网关请求编号 ${reservation.id}）`}},reservation.id,502);}
}
