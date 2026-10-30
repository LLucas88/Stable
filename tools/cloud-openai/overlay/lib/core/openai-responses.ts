import { GatewayValidationError } from './gateway.ts';
export const efforts: Record<string,string[]> = {
  'gpt-6.1-sol':['low','medium','high','xhigh','max'],
  'gpt-6.1-terra':['none','low','medium','high','xhigh','max'],
};
function invalid(message:string):never { throw new GatewayValidationError('invalid_responses_request',message); }
export function assertResponsesBody(value:unknown):asserts value is Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) invalid('请求必须是对象。');
  const b=value as Record<string,any>;
  const allowed=['model','input','tools','tool_choice','parallel_tool_calls','reasoning','text','max_output_tokens','stream','store','include'];
  if(Object.keys(b).some(k=>!allowed.includes(k))) invalid('不支持该 Responses 参数。');
  if(!Object.hasOwn(efforts,b.model)) invalid('未开放此 Responses 模型。');
  if(b.store!==false || (b.stream!==undefined && typeof b.stream!=='boolean')) invalid('需要 store:false。');
  if(!Number.isSafeInteger(b.max_output_tokens)||b.max_output_tokens<1||b.max_output_tokens>128000) invalid('最大输出须为 1–128000。');
  if(b.reasoning && (typeof b.reasoning!=='object'||Object.keys(b.reasoning).some(k=>k!=='effort')||!efforts[b.model].includes(b.reasoning.effort))) invalid('模型不支持此思考深度。');
  if(b.include && (!Array.isArray(b.include)||b.include.some((v:unknown)=>v!=='reasoning.encrypted_content'))) invalid('不支持该 include 参数。');
  if(!Array.isArray(b.input)||!b.input.length) invalid('input 必须是非空数组。');
  function forbidBreakpoints(v:any):void {if(v&&typeof v==='object'){if(Object.hasOwn(v,'prompt_cache_breakpoint'))invalid('暂不支持自定义缓存写入期限。');for(const child of Object.values(v))forbidBreakpoints(child);}}
  forbidBreakpoints(b.input);forbidBreakpoints(b.tools);
  for(const item of b.input) {
    if(!item||typeof item!=='object') invalid('输入项无效。');
    if(item.type && !['message','reasoning','function_call','function_call_output'].includes(item.type)) invalid('不支持此输入类型。');
    if((!item.type||item.type==='message')&&!['user','assistant','developer','system'].includes(item.role)) invalid('输入角色无效。');
    const content=(!item.type||item.type==='message')?item.content:item.type==='function_call_output'?item.output:undefined;
    if(content!==undefined&&typeof content!=='string'){
      if(!Array.isArray(content))invalid('消息内容无效。');
      for(const part of content){
        if(!part||!['input_text','output_text','input_image','refusal'].includes(part.type)||Object.hasOwn(part,'file_id'))invalid('不允许引用供应商文件。');
        if(part.type==='input_image'&&(typeof part.image_url!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(part.image_url)))invalid('图片须随本次请求上传。');
      }
    }
  }
  function tool(t:any,depth=0) {
    if(!t||!['function','namespace'].includes(t.type)) invalid('只允许由客户端执行的函数工具。');
    if(t.type==='namespace'){if(depth||!Array.isArray(t.tools))invalid('工具命名空间无效。'); t.tools.forEach((v:any)=>tool(v,1));}
    else if(typeof t.name!=='string'||!t.name)invalid('工具名称无效。');
  }
  if(b.tools){if(!Array.isArray(b.tools))invalid('工具必须是数组。');b.tools.forEach((t:any)=>tool(t));}
}
export function responseReservationBody(body:Record<string,unknown>) {
  // The existing quota reservation covers the full context window, not a guessed tokenizer count.
  return {...body,max_tokens:body.max_output_tokens};
}
