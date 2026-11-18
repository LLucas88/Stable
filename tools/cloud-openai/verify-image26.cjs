'use strict'
// Read-only validation against a local gateway checkout. No fetch, DB, or deploy.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),esbuild=require('esbuild'),ts=require('typescript')
const root=path.resolve(__dirname,'../..'),source=path.resolve(process.argv[2]||path.join(root,'.local/ecs-production/source'))
const core=path.join(__dirname,'overlay/lib/core/openai-images.ts')
const overlays=[path.join(__dirname,'overlay/lib/server/openai-image-gateway.ts'),path.join(root,'tools/cloud-image-recovery/overlay/lib/server/openai-image-gateway.ts')]
async function main(){
  if(!fs.existsSync(path.join(source,'lib/core/gateway.ts')))throw Error('Provide a local gateway source checkout for offline validation.')
  const code=await esbuild.build({stdin:{contents:fs.readFileSync(core,'utf8'),resolveDir:path.join(source,'lib/core'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'})
  const m=new Module(core);m._compile(code.outputFiles[0].text,core+'.cjs')
  const {imageReservation,imageActualCost}=m.exports
  const price={inputMicrosPerMillion:1000000,outputMicrosPerMillion:5000000,maxOutputTokens:100,contextWindow:1000,pricingPolicy:{kind:'openai-cache',tiers:[{label:'standard',inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:100000,outputMicrosPerMillion:5000000}],imageInput:{inputMicrosPerMillion:2000000,cachedInputMicrosPerMillion:500000},imageOutputFormats:['svg','gif'],svgAuthor:{model:'test-author',inputMicrosPerMillion:3000000,outputMicrosPerMillion:4000000,maxInputTokens:20,maxOutputTokens:30}}}
  const usage={input_tokens:30,output_tokens:3,input_tokens_details:{text_tokens:10,image_tokens:20,cached_tokens:6,cached_tokens_details:{text_tokens:2,image_tokens:4}}}
  assert.equal(imageActualCost(usage,price,true).actual,58)
  assert.equal(imageActualCost(usage,price,true,{model:'test-author',input_tokens:2,output_tokens:3,total_tokens:5}).actual,76)
  assert.equal(imageReservation({prompt:'hi',output_format:'svg'},price).reservedMicros-imageReservation({prompt:'hi'},price).reservedMicros,180)
  const tiered={...price,pricingPolicy:{...price.pricingPolicy,tiers:[{label:'short',promptLessThan:500,inputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:0,outputMicrosPerMillion:5000000},{label:'long',inputMicrosPerMillion:10000000,cachedInputMicrosPerMillion:0,outputMicrosPerMillion:50000000}]}}
  const tieredUsage={input_tokens:800,output_tokens:100,input_tokens_details:{text_tokens:10,image_tokens:790}}
  assert.ok(imageReservation({prompt:'hi',references:[{}]},tiered).reservedMicros>=imageActualCost(tieredUsage,tiered,true).actual,'image tokens crossing a price tier must fit the reservation')
  for(const gateway of overlays){
    const override=new Map([[path.resolve(source,'lib/core/openai-images.ts'),core],[path.resolve(source,'lib/server/openai-image-gateway.ts'),gateway]])
    await esbuild.build({entryPoints:[path.join(source,'lib/server/openai-image-gateway.ts')],bundle:true,write:false,platform:'node',format:'cjs',external:['cloudflare:workers'],plugins:[{name:'image26-overlays',setup(build){build.onLoad({filter:/\.ts$/},args=>{const file=override.get(path.resolve(args.path));if(file)return {contents:fs.readFileSync(file,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)}});build.onResolve({filter:/^@\//},args=>({path:path.join(source,args.path.slice(2))+'.ts'}))}}]})
    const config=ts.readConfigFile(path.join(source,'tsconfig.json'),ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,source)
    const host=ts.createCompilerHost({...parsed.options,incremental:false,noEmit:true}),read=host.readFile.bind(host)
    host.readFile=file=>override.has(path.resolve(file))?fs.readFileSync(override.get(path.resolve(file)),'utf8'):read(file)
    const program=ts.createProgram([path.join(source,'lib/server/openai-image-gateway.ts')],{...parsed.options,incremental:false,noEmit:true},host)
    const issues=ts.getPreEmitDiagnostics(program).filter(d=>d.file&&override.has(path.resolve(d.file.fileName)))
    if(issues.length)throw Error(ts.formatDiagnosticsWithColorAndContext(issues,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>source,getNewLine:()=> '\n'}))
    console.log('PASS overlay bundle and changed-file typecheck:',path.relative(root,gateway))
  }
  console.log('IMAGE_26_GATEWAY_VERIFIED: existing image billing, separate SVG charge/reservation, both gateway overlays; no network or database writes.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
