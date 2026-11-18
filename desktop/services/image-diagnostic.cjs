'use strict'
const phases = new Set(['prepare_request','dns','connect','tls','awaiting_response','read_response','validate_response','persist_result'])
const networkCodes = new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','TimeoutError','AbortError'])
function safeImageDiagnostic(value) {
  if(value?.version!==1||!phases.has(value.phase)||!Number.isSafeInteger(value.at)||value.at<0)return null
  return {version:1,phase:value.phase,networkCode:networkCodes.has(value.networkCode)?value.networkCode:null,observedNode:['primary','backup','backup-2'].includes(value.observedNode)?value.observedNode:null,at:value.at,upstreamRequestId:/^req_[A-Za-z0-9_-]{8,100}$/.test(String(value.upstreamRequestId||''))?value.upstreamRequestId:null}
}
module.exports={safeImageDiagnostic}
