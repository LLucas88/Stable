import { getD1 } from './env';
import { noStoreJson } from './http';
import { imageFailureMessage, safeImageFailure, knownImageRejection, type ImageFailure } from '../core/image-failure';

export function imageResponse(value: unknown, id: string, status=200) {
  return noStoreJson(value,{status,headers:{'X-Stable-Request-Id':id}});
}
export function imageFailedResponse(id: string, failure: ImageFailure) {
  const status=failure.status===402?402:failure.status===429?429:422;
  // Existing desktop releases recognize this code as a terminal result, even
  // while recovering a previous submission. Keep it stable across categories.
  return imageResponse({error:{code:'image_generation_failed',type:'image_generation_user_error',message:imageFailureMessage(failure)+`（网关请求编号 ${id}）`,param:failure.param,reason:failure.code,upstream_status:failure.status,request_id:id,upstream_request_id:failure.requestId}},id,status);
}
export async function replayImage(accountId: string, key: string, fingerprint: string): Promise<Response|null> {
  const db=await getD1();
  const r=await db.prepare(`SELECT r.id,r.request_fingerprint,r.state,r.failure_code,r.created_at,i.response_json,f.failure_json FROM gateway_requests r LEFT JOIN gateway_image_results i ON i.request_id=r.id LEFT JOIN gateway_image_failures f ON f.request_id=r.id WHERE r.account_id=? AND r.idempotency_key=?`).bind(accountId,key).first<{id:string;request_fingerprint:string;state:string;failure_code:string|null;created_at:number;response_json:string|null;failure_json:string|null}>();
  if(!r)return null;
  if(r.request_fingerprint!==fingerprint)return imageResponse({error:{code:'idempotency_conflict',message:'同一请求标识不能对应不同生图参数。原请求不会重新提交。'}},r.id,409);
  if(r.state==='settled'&&r.response_json)return imageResponse(JSON.parse(r.response_json),r.id);
  if(r.state==='released'&&r.failure_code==='client_aborted_before_upstream')return imageResponse({error:{code:'image_generation_failed',message:`原请求在提交给供应商之前已取消，预占已释放，没有生成图片。（网关请求编号 ${r.id}）`,request_id:r.id}},r.id,422);
  const status=Number(/^upstream_(\d{3})$/.exec(r.failure_code||'')?.[1]);
  // Legacy versions released every 4xx, including 408/409. A released quota
  // alone does not establish that an upstream image was never generated.
  if(r.state==='released'&&knownImageRejection(status)){
    let failure=safeImageFailure(status);
    if(r.failure_json){try{const f=JSON.parse(r.failure_json);failure=safeImageFailure(f.status,{error:{code:f.code,param:f.param,moderation_details:{moderation_stage:f.stage}}},f.requestId);}catch{}}
    return imageFailedResponse(r.id,failure);
  }
  if(['reserved','inflight'].includes(r.state)&&Date.now()-r.created_at<10*60_000)return imageResponse({task_status:'PROCESSING',request_id:r.id},r.id,202);
  return imageResponse({error:{code:'image_result_unknown',message:`原生图结果尚未确认，已阻止重复生成。请联系管理员核对。（网关请求编号 ${r.id}）`,request_id:r.id}},r.id,409);
}
