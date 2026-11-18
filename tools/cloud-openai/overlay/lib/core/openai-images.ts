import { calculateTokenCostMicros, type PriceSnapshot } from './gateway.ts';
import { reservationRates, resolvePrice } from './pricing.ts';
type ImageReference={id:string;mimeType:string;data:string};
export function validateOpenAIImageBody(value:unknown, editing=false){
  const b=value && typeof value==='object' ? {size:'auto',quality:'auto',background:'auto',...value} as Record<string,any> : value as Record<string,any>;
  if(!b||typeof b!=='object'||Object.keys(b).some(k=>!['model','prompt','size','quality','background','complexity','output_format','frame_count','frame_duration_ms',...(editing?['references','markup','mask']:[])].includes(k)))throw Error('body');
  if(!['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2.6-sunburst','gpt-image-2.6-flare'].includes(b.model)||typeof b.prompt!=='string'||!b.prompt.trim()||[...b.prompt].length>1000)throw Error('model');
  if(!['low','medium','high','xhigh','max','auto'].includes(b.quality)||!['opaque','transparent','auto'].includes(b.background))throw Error('options');
  if(b.size!=='auto'){
  const m=typeof b.size==='string'&&/^(\d{3,4})x(\d{3,4})$/.exec(b.size);if(!m)throw Error('size');
  const w=Number(m[1]),h=Number(m[2]);if(w%16||h%16||w>3840||h>3840||w*h<655360||w*h>8294400||w/h>3||h/w>3)throw Error('size');
  }
  const format=b.output_format||'png',newModel=b.model.startsWith('gpt-image-2.6-');
  if(!['png','jpeg','webp','svg','gif'].includes(format)||['svg','gif'].includes(format)&&!newModel||editing&&format==='svg')throw Error('format');
  if(b.complexity!==undefined&&(!newModel||!['low','medium','high'].includes(b.complexity)))throw Error('complexity');
  if(b.background==='transparent'&&!['png','webp'].includes(format))throw Error('background_format');
  if(format!=='gif'&&(b.frame_count!==undefined||b.frame_duration_ms!==undefined))throw Error('frames');
  if(format==='gif'){b.frame_count??=9;b.frame_duration_ms??=200;if(!Number.isInteger(b.frame_count)||b.frame_count<2||b.frame_count>16||!Number.isInteger(b.frame_duration_ms)||b.frame_duration_ms<20||b.frame_duration_ms>655350)throw Error('frames');}
  if(b.markup&&b.mask||['svg','gif'].includes(format)&&(b.markup||b.mask))throw Error('edit_layers');
  let total=0;
  if(editing && (!Array.isArray(b.references)||b.references.length<1||b.references.length>4))throw Error('references');
  const references:ImageReference[]|undefined = editing ? b.references.map((r:any)=>{
    if(!r||Object.keys(r).some(k=>!['id','mimeType','data'].includes(k))||!/^[a-f0-9]{64}$/.test(r.id)||!['image/png','image/jpeg','image/webp'].includes(r.mimeType)||typeof r.data!=='string'||r.data.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(r.data))throw Error('reference');
    const bytes=decodeReference(r.data);total+=bytes.length;
    if(!bytes.length||bytes.length>10*1024*1024||total>20*1024*1024)throw Error('reference_size');
    const magic = r.mimeType==='image/png' ? bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71 : r.mimeType==='image/jpeg' ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255 : String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!magic)throw Error('reference_type');
    return {id:r.id as string,mimeType:r.mimeType as string,data:r.data as string};
  }) : undefined;
  const layers:Partial<Record<'markup'|'mask',ImageReference>>={};
  for(const name of ['markup','mask'] as const)if(b[name]){const r=b[name];if(Object.keys(r).some(k=>!['id','mimeType','data'].includes(k))||r.mimeType!=='image/png'||!/^[a-f0-9]{64}$/.test(r.id)||typeof r.data!=='string'||r.data.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(r.data))throw Error('layer');const bytes=decodeReference(r.data);total+=bytes.length;if(bytes.length<24||bytes.length>10*1024*1024||total>20*1024*1024||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)throw Error('layer');layers[name]={id:r.id,mimeType:r.mimeType,data:r.data};}
  return {...layers,...(b.output_format?{output_format:format as string}:{}),...(b.complexity?{complexity:b.complexity as string}:{}),...(format==='gif'?{frame_count:b.frame_count as number,frame_duration_ms:b.frame_duration_ms as number}:{}),...(references?{references}:{}),model:b.model as string,prompt:b.prompt.trim() as string,size:b.size as string,quality:b.quality as string,background:b.background as string};
}
export function decodeReference(data:string){return Uint8Array.from(atob(data),c=>c.charCodeAt(0));}
export function imageInputRates(model:PriceSnapshot){
  const configured=(model.pricingPolicy as any)?.imageInput;
  if(!configured||![configured.inputMicrosPerMillion,configured.cachedInputMicrosPerMillion].every(n=>Number.isSafeInteger(n)&&n>=0)||configured.cachedInputMicrosPerMillion>configured.inputMicrosPerMillion)throw Error('image_input_price_missing');
  return configured as {inputMicrosPerMillion:number;cachedInputMicrosPerMillion:number};
}
export function imageActualCost(raw:any,model:PriceSnapshot,editing:boolean,svgUsage?:any){
  const integer=(n:any)=>Number.isSafeInteger(n)&&n>=0;
  const d=raw?.input_tokens_details, text=d?.text_tokens, images=d?.image_tokens;
  if(![raw?.input_tokens,raw?.output_tokens,text,images].every(integer)||text+images!==raw.input_tokens||(!editing&&images!==0))throw Error('image_usage_invalid');
  const cached=d.cached_tokens||0, ct=d.cached_tokens_details?.text_tokens||0, ci=d.cached_tokens_details?.image_tokens||0;
  if(![cached,ct,ci].every(integer)||ct+ci!==cached||ct>text||ci>images)throw Error('image_cache_usage_invalid');
  const rates=resolvePrice({promptTokens:raw.input_tokens,completionTokens:raw.output_tokens,totalTokens:raw.input_tokens+raw.output_tokens},model);
  const imageRates=images?imageInputRates(model):{inputMicrosPerMillion:0,cachedInputMicrosPerMillion:0};
  const actual=calculateTokenCostMicros(text-ct,rates.inputMicrosPerMillion)+calculateTokenCostMicros(ct,rates.cachedInputMicrosPerMillion)+calculateTokenCostMicros(images-ci,imageRates.inputMicrosPerMillion)+calculateTokenCostMicros(ci,imageRates.cachedInputMicrosPerMillion)+calculateTokenCostMicros(raw.output_tokens,rates.outputMicrosPerMillion);
  if(!Number.isSafeInteger(actual))throw Error('image_cost_overflow');
  let svgCost=0;
  if(svgUsage){const p=svgPricing(model);if(svgUsage.model!==p.model||![svgUsage.input_tokens,svgUsage.output_tokens,svgUsage.total_tokens].every(integer)||svgUsage.total_tokens!==svgUsage.input_tokens+svgUsage.output_tokens)throw Error('svg_usage_invalid');svgCost=calculateTokenCostMicros(svgUsage.input_tokens,p.inputMicrosPerMillion)+calculateTokenCostMicros(svgUsage.output_tokens,p.outputMicrosPerMillion);}
  if(!Number.isSafeInteger(actual+svgCost))throw Error('image_cost_overflow');
  return {actual:actual+svgCost,imageCost:actual,svgCost,...(svgUsage?{svgUsage}:{}),textTokens:text,imageTokens:images,cachedTextTokens:ct,cachedImageTokens:ci};
}
function svgPricing(model:PriceSnapshot){const p=(model.pricingPolicy as any)?.svgAuthor;if(!p||typeof p.model!=='string'||![p.inputMicrosPerMillion,p.outputMicrosPerMillion,p.maxInputTokens,p.maxOutputTokens].every(n=>Number.isSafeInteger(n)&&n>=0)||!p.maxInputTokens||!p.maxOutputTokens)throw Error('svg_price_missing');return p;}
export function imageReservation(body:{prompt:string;references?:unknown[];output_format?:string},model:PriceSnapshot & {maxOutputTokens:number;contextWindow?:number}){
  // Admission ceiling is explicitly configured by the administrator, never a flat per-image charge.
  // Actual settlement always uses provider usage, including output image tokens.
  const format=body.output_format||'png';
  if(['svg','gif'].includes(format)&&!(model.pricingPolicy as any)?.imageOutputFormats?.includes(format))throw Error('image_format_not_enabled');
  const p=format==='svg'?svgPricing(model):undefined,svgReserve=p?calculateTokenCostMicros(p.maxInputTokens,p.inputMicrosPerMillion)+calculateTokenCostMicros(p.maxOutputTokens,p.outputMicrosPerMillion):0;
  const inputUpperBoundTokens=new TextEncoder().encode(body.prompt).length+256;
  const maxOutputTokens=model.maxOutputTokens;
  if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1)throw Error('image_reservation_missing');
  // Input-image tokens can cross a price tier. Admission must cover the highest
  // configured rate; settlement still uses the actual total input to pick a tier.
  const ceiling=reservationRates(model);
  const textAndOutputCost=calculateTokenCostMicros(inputUpperBoundTokens,ceiling.inputMicrosPerMillion)+calculateTokenCostMicros(maxOutputTokens,ceiling.outputMicrosPerMillion);
  if(body.references?.length){
    const rates=imageInputRates(model), budget=Number(model.contextWindow)-maxOutputTokens;
    if(!Number.isSafeInteger(budget)||budget<inputUpperBoundTokens)throw Error('image_input_budget_missing');
    // Reserve the configured entire input context, not an unverified image-token formula.
    const reservedMicros=svgReserve+textAndOutputCost+calculateTokenCostMicros(budget-inputUpperBoundTokens,rates.inputMicrosPerMillion);
    if(!Number.isSafeInteger(reservedMicros))throw Error('image_cost_overflow');
    return {inputUpperBoundTokens:budget,maxOutputTokens,reservedMicros};
  }
  const reservedMicros=svgReserve+textAndOutputCost;
  if(!Number.isSafeInteger(reservedMicros))throw Error('image_cost_overflow');
  return {inputUpperBoundTokens,maxOutputTokens,reservedMicros};
}
