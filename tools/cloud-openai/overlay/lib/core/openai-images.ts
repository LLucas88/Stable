import { calculateActualCostMicros, type PriceSnapshot } from './gateway.ts';
export function validateOpenAIImageBody(value:unknown){
  const b=value as Record<string,any>;
  if(!b||typeof b!=='object'||Object.keys(b).some(k=>!['model','prompt','size','quality','background'].includes(k)))throw Error('body');
  if(!['gpt-image-2.5-sunburst','gpt-image-2.5-flare'].includes(b.model)||typeof b.prompt!=='string'||!b.prompt.trim()||[...b.prompt].length>1000)throw Error('model');
  if(!['low','medium','high','xhigh','max','auto'].includes(b.quality)||!['opaque','transparent','auto'].includes(b.background))throw Error('options');
  const m=typeof b.size==='string'&&/^(\d{3,4})x(\d{3,4})$/.exec(b.size);if(!m)throw Error('size');
  const w=Number(m[1]),h=Number(m[2]);if(w%16||h%16||w>3840||h>3840||w*h<655360||w*h>8294400||w/h>3||h/w>3)throw Error('size');
  return {model:b.model as string,prompt:b.prompt.trim() as string,size:b.size as string,quality:b.quality as string,background:b.background as string};
}
export function imageReservation(body:{prompt:string},model:PriceSnapshot & {maxOutputTokens:number}){
  // Admission ceiling is explicitly configured by the administrator, never a flat per-image charge.
  // Actual settlement always uses provider usage, including output image tokens.
  const inputUpperBoundTokens=new TextEncoder().encode(body.prompt).length+256;
  const maxOutputTokens=model.maxOutputTokens;
  if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1)throw Error('image_reservation_missing');
  return {inputUpperBoundTokens,maxOutputTokens,reservedMicros:calculateActualCostMicros({promptTokens:inputUpperBoundTokens,completionTokens:maxOutputTokens,totalTokens:inputUpperBoundTokens+maxOutputTokens},model)};
}
