'use strict'
const fs=require('node:fs'),path=require('node:path')
const target=path.resolve(process.argv[2]||'')
if(!process.argv[2]||!fs.existsSync(path.join(target,'lib/server/gateway.ts')))throw Error('Provide gateway source directory')
const backup=path.join(target,'.openai-source-backup-'+Date.now())
function write(rel,data){const file=path.join(target,rel);if(fs.existsSync(file)){const old=fs.readFileSync(file);if(old.equals(Buffer.from(data)))return;fs.mkdirSync(path.dirname(path.join(backup,rel)),{recursive:true});fs.writeFileSync(path.join(backup,rel),old)}fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
function copy(dir,rel=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const r=path.join(rel,e.name);if(e.isDirectory())copy(path.join(dir,e.name),r);else write(r,fs.readFileSync(path.join(dir,e.name)))}}
function patch(rel,pairs){let s=fs.readFileSync(path.join(target,rel),'utf8').replace(/\r\n/g,'\n');for(const [a,b]of pairs){if(s.includes(b))continue;if(!s.includes(a))throw Error('Source anchor changed: '+rel+' '+a.slice(0,60));s=s.replace(a,b)}write(rel,s)}
copy(path.join(__dirname,'overlay'))
patch('lib/server/gateway.ts',[
 ['export async function handleChatCompletion(request: Request) {',"import { assertResponsesBody, responseReservationBody } from '../core/openai-responses';\n\nexport async function handleChatCompletion(request: Request, responses = false) {"],
 ['    assertChatCompletionBody(parsed);','    if (responses) assertResponsesBody(parsed); else assertChatCompletionBody(parsed);'],
 ["  const body = parsed;", "  const body = parsed as Record<string, unknown>;"],
 ["  const model = await getModelSnapshot(String(body.model));","  const model = await getModelSnapshot(String(body.model));\n  if (responses && (model.provider !== 'openai' || model.upstreamBaseUrl.replace(/\\/$/, '') !== 'https://api.openai.com/v1' || model.upstreamModel !== body.model)) throw new AppError(400, 'invalid_responses_model', 'Responses 模型配置无效。');"],
 ["}/chat/completions`,","}/${responses ? 'responses' : 'chat/completions'}`,"],
 ['      body,\n      contextWindow:', '      body: responses ? responseReservationBody(body) : body,\n      contextWindow:'],
 ['  const upstreamBody = prepareUpstreamBody({','  const upstreamBody = responses ? { ...body, model: model.upstreamModel, max_output_tokens: estimate.maxOutputTokens, store: false } : prepareUpstreamBody({'],
 ["if (model.upstreamModel === 'glm-image')", "if (model.upstreamModel === 'glm-image' || model.upstreamModel.startsWith('gpt-image-'))"],
 ])
patch('lib/core/sse.ts',[
 ['        if (payload.usage != null) this.observedUsage = normalizeUsage(payload.usage);',`        if (payload.usage != null) this.observedUsage = normalizeUsage(payload.usage);
        if (['response.completed','response.incomplete','response.failed'].includes(String(payload.type)) && payload.response && typeof payload.response === 'object') {
          const r = payload.response as Record<string, unknown>;
          if (typeof r.id === 'string') this.observedRequestId = r.id;
          if (r.usage != null) this.observedUsage = normalizeUsage(r.usage);
        }`],
 ])
patch('lib/server/model-catalog.ts',[
 ["AND m.upstream_model <> 'glm-image'","AND m.upstream_model <> 'glm-image' AND m.upstream_model NOT LIKE 'gpt-image-%'"],
 ['    max_output_tokens: row.max_output_tokens,',"    max_output_tokens: row.max_output_tokens,\n    responses_supported: row.provider === 'openai' && ['gpt-6.1-sol','gpt-6.1-terra'].includes(String(row.id)),"],
 ])
patch('lib/server/image-gateway.ts',[
 ["import { authenticateRequest }", "import { handleOpenAIImage } from './openai-image-gateway';\nimport { authenticateRequest }"],
 ["export async function handleImageGeneration(request: Request) {", "export async function handleImageGeneration(request: Request) {\n  const candidate = await readJson(request.clone() as Request,32768) as Record<string,unknown>;\n  if(typeof candidate?.model === 'string' && candidate.model.startsWith('gpt-image-'))return handleOpenAIImage(request,candidate);"],
])
patch('lib/server/gateway.ts',[
 ["import { authenticateRequest }", "import { providerFetch } from './openai-fetch';\nimport { authenticateRequest }"],
 ['upstream = await fetch(upstreamRequest);','upstream = await providerFetch(upstreamRequest);'],
])
const pkgFile=path.join(target,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgFile,'utf8'));pkg.dependencies.undici='7.24.8';write('package.json',JSON.stringify(pkg,null,2)+'\n');
require('./pricing-patch.cjs')(patch)
console.log(JSON.stringify({sourcePrepared:true,target,backup,deployed:false}))
