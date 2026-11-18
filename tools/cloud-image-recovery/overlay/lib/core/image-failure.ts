// Only public enum values survive this boundary. Never retain provider messages,
// prompt text, arbitrary fields, headers, or credential-like values.
const codes = new Set(['moderation_blocked','content_policy_violation','invalid_value','invalid_parameter','invalid_request','invalid_request_error','unsupported_parameter','unknown_parameter','missing_required_parameter','image_generation_user_error','invalid_image','image_too_large','rate_limit_exceeded','insufficient_quota','billing_hard_limit_reached','model_not_found']);
const params = new Set(['model','prompt','size','quality','background','output_format','n','image','image[]','mask','moderation']);
const stages = new Set(['input','output','unknown']);
export type ImageFailure = { version: 1; status: number; code: string | null; param: string | null; stage: string | null; requestId: string | null };
export function safeImageFailure(status: number, body?: any, requestId?: string | null): ImageFailure {
  const error=body?.error;
  return {version:1,status,code:codes.has(error?.code)?error.code:null,param:params.has(error?.param)?error.param:null,stage:stages.has(error?.moderation_details?.moderation_stage)?error.moderation_details.moderation_stage:null,requestId:typeof requestId==='string'&&/^req_[a-zA-Z0-9_-]{8,100}$/.test(requestId)?requestId:null};
}
export function knownImageRejection(status: number) { return [400,401,402,403,404,413,415,422,429].includes(status); }
export function imageFailureMessage(f: ImageFailure) {
  if(f.code==='moderation_blocked'||f.code==='content_policy_violation')return f.stage==='output'?'生成结果未通过供应商安全审核，未返回可交付图片。请调整内容后明确发起新尝试；不会自动重试。':'本次图片请求未通过供应商安全审核。请检查描述或参考图，调整后明确发起新尝试；不会自动重试。';
  if([401,403,404].includes(f.status))return '图片供应商的凭据、模型或权限配置异常，请联系管理员；原请求不会重复提交。';
  if(f.status===402||['insufficient_quota','billing_hard_limit_reached'].includes(f.code||''))return '图片供应商余额或用量上限受限，请联系管理员核对；原请求不会重复提交。';
  if(f.status===429)return '图片供应商暂时限流，请稍后明确发起新尝试；本次不会自动重复生成。';
  if(f.param)return `图片供应商拒绝参数 ${f.param}，请检查该参数后明确发起新尝试；原请求不会重复提交。`;
  return '上次生图请求已被供应商拒绝，预占已释放，没有可恢复的成品。未取得更具体的拒绝原因；请检查请求内容后明确发起新尝试，不要反复继续原请求。';
}
export async function readImageFailure(response: Response, timeoutMs=2000): Promise<ImageFailure> {
  const fallback=()=>safeImageFailure(response.status,undefined,response.headers.get('x-request-id'));
  if(!response.body)return fallback();
  const reader=response.body.getReader(); let timer:ReturnType<typeof setTimeout>|undefined;
  const interrupted=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(Error('deadline'));},timeoutMs);});
  const parse=async()=>{
    const parts:Uint8Array[]=[];let size=0;
    for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>16_384)throw Error('size');parts.push(item.value);}
    const all=new Uint8Array(size);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}
    return safeImageFailure(response.status,JSON.parse(new TextDecoder().decode(all)),response.headers.get('x-request-id'));
  };
  try{return await Promise.race([parse(),interrupted]);}catch{return fallback();}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
