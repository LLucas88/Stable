'use strict'
module.exports=patch=>{
patch('lib/core/pricing.ts',[
 ["kind: 'cache' | 'token-tiers' | 'deepseek-time';","kind: 'cache' | 'token-tiers' | 'deepseek-time' | 'openai-cache';"],
 ["['cache', 'token-tiers', 'deepseek-time'].includes(p.kind)","['cache', 'token-tiers', 'deepseek-time', 'openai-cache'].includes(p.kind)"],
 ['Math.max(...applicable.map(t => t.inputMicrosPerMillion))','Math.ceil(Math.max(...applicable.map(t => t.inputMicrosPerMillion)) * (price.pricingPolicy?.kind === \'openai-cache\' ? 2.5 : 1))'],
])
patch('lib/core/gateway.ts',[
 ['  cachedPromptTokens?: number;', '  cachedPromptTokens?: number;\n  cacheWrite30mTokens?: number;\n  cacheWrite12hTokens?: number;'],
 ["  return safeAdd(\n    safeAdd(calculateTokenCostMicros(usage.promptTokens - cached, rates.inputMicrosPerMillion),",`  const write30=usage.cacheWrite30mTokens ?? 0, write12=usage.cacheWrite12hTokens ?? 0;
  if(write30+write12>0 && price.pricingPolicy?.kind!=='openai-cache')throw new GatewayValidationError('unknown_cache_write_price','缺少缓存写入费率。');
  if(cached+write30+write12>usage.promptTokens)throw new GatewayValidationError('invalid_usage','缓存分类用量超过总输入。');
  const ordinary=usage.promptTokens-cached-write30-write12;
  const writeCost=safeAdd(calculateTokenCostMicros(write30,Math.ceil(rates.inputMicrosPerMillion*1.25)),calculateTokenCostMicros(write12,Math.ceil(rates.inputMicrosPerMillion*2.5)),'cache writes');
  return safeAdd(writeCost,safeAdd(
    safeAdd(calculateTokenCostMicros(ordinary, rates.inputMicrosPerMillion),`],
 ["    'actual cost',\n  );","    'actual cost',\n  ), 'actual cost with cache writes');"],
 ['  const totalTokens = readUsageInteger(candidate.total_tokens);',`  const cacheWriteDetails=candidate.input_tokens_details as Record<string,unknown> | undefined;
  const writeRaw=cacheWriteDetails?.cache_write_tokens;
  const writes=writeRaw===undefined?0:readUsageInteger(writeRaw);
  const writeDetails=cacheWriteDetails?.cache_write_tokens_details as Record<string,unknown> | undefined;
  const write30=writeDetails?readUsageInteger(writeDetails.ttl_30m_tokens):writes;
  const write12=writeDetails?readUsageInteger(writeDetails.ttl_12h_tokens):0;
  if(writes===null||write30===null||write12===null||write30+write12!==writes||(cached??0)+writes>promptTokens)return null;
  const totalTokens = readUsageInteger(candidate.total_tokens);`],
 ['    ...(cached === undefined ? {} : { cachedPromptTokens: cached }),','    ...(cached === undefined ? {} : { cachedPromptTokens: cached }),\n    ...(writes ? {cacheWrite30mTokens:write30,cacheWrite12hTokens:write12}:{}),'],
])
patch('lib/server/quota.ts',[
 ['    cachedPromptTokens: usage.cachedPromptTokens ?? null,','    cachedPromptTokens: usage.cachedPromptTokens ?? null,\n      cacheWrite30mTokens: usage.cacheWrite30mTokens ?? 0, cacheWrite12hTokens: usage.cacheWrite12hTokens ?? 0,'],
])
}
