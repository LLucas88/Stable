'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(path.join(target,'lib/server/gateway.ts')))throw Error('Provide gateway source directory');
const changes=new Map();
function patch(rel,pairs){let text=fs.readFileSync(path.join(target,rel),'utf8').replace(/\r\n/g,'\n');for(const [before,after]of pairs){if(text.includes(after))continue;if(!text.includes(before))throw Error('Source changed: '+rel);text=text.replace(before,after)}changes.set(rel,text)}
patch('lib/core/gateway.ts',[
 ['  modelMaxOutputTokens,\n  price,\n}: {','  modelMaxOutputTokens,\n  price,\n  measuredInputTokens,\n}: {'],
 ['  price: PriceSnapshot;\n}): ReservationEstimate {','  price: PriceSnapshot;\n  measuredInputTokens?: number;\n}): ReservationEstimate {'],
 ['  const inputUpperBoundTokens = contextWindow - maxOutputTokens;','  const inputCapacity = contextWindow - maxOutputTokens;\n  // Only a server-obtained count may replace the full-context fallback.\n  if (measuredInputTokens !== undefined && (!Number.isSafeInteger(measuredInputTokens) || measuredInputTokens < 0)) throw new GatewayValidationError(\'invalid_input_count\', \'输入 Token 核算结果无效。\');\n  const inputUpperBoundTokens = measuredInputTokens ?? inputCapacity;'],
 ['  if (inputUpperBoundTokens <= 0) {','  if (inputCapacity <= 0 || inputUpperBoundTokens > inputCapacity) {'],
 ["'最大输出长度未给输入内容留出上下文空间。'","'输入内容与最大输出预算超过模型上下文容量。'"],
 ]);
patch('lib/server/gateway.ts',[
 ["import { assertResponsesBody, responseReservationBody } from '../core/openai-responses';","import { assertResponsesBody, responseReservationBody } from '../core/openai-responses';\nimport { countOpenAIInputTokens, InputTokenCountError } from '../core/openai-input-tokens';"],
 ["  const idempotencyKey = request.headers.get('idempotency-key') ?? '';","  const idempotencyKey = request.headers.get('idempotency-key') ?? '';\n  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new AppError(400, 'invalid_idempotency_key', '需要有效的 Idempotency-Key。');"],
 ['  let estimate;\n  try {\n    estimate = estimateReservationMicros({','  let estimate;\n  try {\n    const measuredInputTokens = responses ? await countOpenAIInputTokens({ body, providerKey, signal: request.signal, fetchImpl: providerFetch }) : undefined;\n    estimate = estimateReservationMicros({'],
 ['      price: model,\n    });','      price: model,\n      measuredInputTokens,\n    });'],
 ["  } catch (error) {\n    if (error instanceof GatewayValidationError) {\n      throw new AppError(\n        400,\n        error.code,\n        error.message,\n        'invalid_request_error',\n      );\n    }\n    throw error;\n  }\n  const upstreamBody", "  } catch (error) {\n    if (error instanceof InputTokenCountError) throw new AppError(503, error.code, error.message);\n    if (error instanceof GatewayValidationError) {\n      throw new AppError(400, error.code, error.message, 'invalid_request_error');\n    }\n    throw error;\n  }\n  const upstreamBody"],
 ]);
function collect(dir,rel=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=path.join(rel,entry.name);if(entry.isDirectory())collect(path.join(dir,entry.name),name);else changes.set(name,fs.readFileSync(path.join(dir,entry.name)))}}
collect(path.join(__dirname,'overlay'));
const backup=path.join(target,'.quota-source-backup-'+Date.now());
for(const [rel,data]of changes){const file=path.join(target,rel),old=fs.existsSync(file)?fs.readFileSync(file):null;if(old?.equals(Buffer.from(data)))continue;if(old){fs.mkdirSync(path.dirname(path.join(backup,rel)),{recursive:true});fs.writeFileSync(path.join(backup,rel),old)}fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
console.log(JSON.stringify({prepared:true,target,backup,deployed:false}));
