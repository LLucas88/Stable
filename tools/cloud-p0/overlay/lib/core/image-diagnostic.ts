// Diagnostics contain enums only. Exception messages, URLs, prompts and headers
// are deliberately excluded; an error stage never proves non-submission.
const phases = new Set(['prepare_request','dns','connect','tls','awaiting_response','read_response','validate_response','persist_result']);
const nodes = new Set(['primary','backup','backup-2']);
const codes = new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','TimeoutError','AbortError']);
export type ImageDiagnostic = { version:1; phase:string; networkCode:string|null; observedNode:string|null; at:number; upstreamRequestId:string|null };
export function safeImageDiagnostic(value:any): ImageDiagnostic|null {
  if(value?.version!==1||!phases.has(value.phase)||!Number.isSafeInteger(value.at)||value.at<0)return null;
  return {version:1,phase:value.phase,networkCode:codes.has(value.networkCode)?value.networkCode:null,observedNode:nodes.has(value.observedNode)?value.observedNode:null,at:value.at,upstreamRequestId:typeof value.upstreamRequestId==='string'&&/^req_[A-Za-z0-9_-]{8,100}$/.test(value.upstreamRequestId)?value.upstreamRequestId:null};
}
export function imageDiagnostic(error:unknown,phase:string,node:unknown=null,requestId:unknown=null):ImageDiagnostic {
  let code:string|null=null,current:any=error;
  for(let i=0;i<5&&current;i++,current=current.cause){if(codes.has(current.code)){code=current.code;break;}if(codes.has(current.name)){code=current.name;break;}}
  // Refine transport phase only while waiting for response headers. A body read
  // failure must not be described as a failed initial connection.
  if(phase==='awaiting_response'){
    if(code==='ENOTFOUND'||code==='EAI_AGAIN')phase='dns';
    else if(code==='ECONNREFUSED'||code==='UND_ERR_CONNECT_TIMEOUT')phase='connect';
    else if(code&&/CERT|TLS|SELF_SIGNED|LEAF_SIGNATURE/.test(code))phase='tls';
  }
  return safeImageDiagnostic({version:1,phase,networkCode:code,observedNode:node,at:Date.now(),upstreamRequestId:requestId})!;
}
