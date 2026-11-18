'use strict'

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const dns = require('node:dns')
const { createHash } = require('node:crypto')
const { BlockList } = require('node:net')
const { toolFile } = require('./tool-files.cjs')
const { setTimeout: delay } = require('node:timers/promises')
const { imageQueue } = require('./image-request-queue.cjs')

const { imageOptions, checkImageSize, imageArguments, outputExtension, FORMATS } = require('./image-models.cjs')
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/images/generations'
const MAX_BYTES = 20 * 1024 * 1024
const IMAGE_GUIDANCE = '需要新生成插画、海报、封面或其他图片素材时，使用 stable_image_generate（支持 GLM-image、GPT Image 2.5 / 2.6，以及已配置的官方或兼容中转图片连接），无需切换对话模型；凭据由 Stable 读取，不要查找或传入 API Key。已有图片查看、截图、数据图表不属于文本生图，不要为这些任务调用。GPT Image 可直接编辑本次授权参考图，referenceIds 只能来自应用提供的清单；GLM 不能接收参考图。严格保持原图像素时仍须原图合成，不宣称模型编辑会像素不变。多个独立方案优先通过 additionalImages 附带第二张，每批最多2张并发，其余下一批；依赖上一张结果时串行。复用已生成的文件；成功后用 Read 查看实际图片并提供本地文件链接或嵌入交付文件。失败如实说明，不伪造产物、不反复付费重试。'

// Download only the URL returned by the provider, never a model-supplied URL.
// Pin public DNS results at connection time, including each redirect; no API key
// is sent to the image host. Prevent private-network and loopback requests.
const blocked = new BlockList()
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',3]]) blocked.addSubnet(ip, bits, 'ipv4')
for (const [ip, bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]]) blocked.addSubnet(ip, bits, 'ipv6')
function publicAddress(address, family) { return !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4') }
function allowedImageAddress(host, address, family) {
  // Local TUN proxies use the benchmark subnet as synthetic DNS. Permit this
  // only for the exact official image CDN observed in GLM-Image responses;
  // unrelated hosts, redirects and other private address ranges stay blocked.
  return publicAddress(address, family) || host === 'maas-watermark-prod-new.cn-wlcb.ufileos.com' && family === 4 && /^198\.(18|19)\./.test(address)
}
function downloadImage(value, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    let url
    try { url = new URL(value) } catch { return reject(Error('图片下载地址无效。')) }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || redirects > 3) return reject(Error('图片下载地址不受支持。'))
    // IP literals bypass Node lookup, so reject them here as well.
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const family = require('node:net').isIP(host)
    if (family && !publicAddress(host, family)) return reject(Error('图片下载地址不受支持。'))
    const req = https.get(url, { signal, lookup(hostname, options, callback) {
      dns.lookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error)
        if (!addresses.length || addresses.some(item => !allowedImageAddress(hostname, item.address, item.family))) return callback(Error('图片下载地址不受支持。'))
        if (options?.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      })
    } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        downloadImage(new URL(res.headers.location, url).href, signal, redirects + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200 || Number(res.headers['content-length']) > MAX_BYTES) { res.destroy(); return reject(Error('图片下载失败或文件过大。')) }
      const chunks = []; let size = 0
      res.on('data', chunk => { size += chunk.length; if (size > MAX_BYTES) res.destroy(Error('图片超过 20 MB。')); else chunks.push(chunk) })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

function validateArgs(args) {
  if (!args || Object.keys(args).some(key => !['prompt', 'size', 'output', 'model', 'quality', 'background', 'referenceIds', 'outputFormat', 'complexity', 'frameCount', 'frameDurationMs', 'connectionId', 'upstreamModel', 'editTransport'].includes(key))) throw Error('生图参数无效。')
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || [...args.prompt].length > 1000) throw Error('图片描述需要 1–1000 个字符。')
  const size = args.size || '1280x1280'
  const extension = outputExtension(imageOptions(args))
  if (typeof args.output !== 'string' || ![`.${extension}`, ...(extension==='jpg'?['.jpeg']:[])].includes(path.extname(args.output).toLowerCase())) throw Error(`请提供工作区内新的 .${extension} 输出路径，父目录须已存在。`)
  if (args.referenceIds !== undefined && (!Array.isArray(args.referenceIds) || !args.referenceIds.length || args.referenceIds.length > 4 || new Set(args.referenceIds).size !== args.referenceIds.length || args.referenceIds.some(id => !/^[a-f0-9]{64}$/.test(id)))) throw Error('参考图标识无效。')
  const options = imageOptions(args); checkImageSize(options.model, size)
  return { prompt: args.prompt.trim(), size, output: args.output, ...options, ...(args.referenceIds ? { referenceIds: args.referenceIds } : {}) }
}

function imageWireRequest(input,route,references=[],layers={}) {
  const parameters={model:route.upstreamModel||input.model,prompt:input.prompt,...(input.size==='auto'?{}:{size:input.size}),...(input.quality==='auto'?{}:{quality:input.quality}),...(input.model==='glm-image'||input.background==='auto'?{}:{background:input.background}),...(input.outputFormat?{output_format:input.outputFormat}:{}),...(input.complexity?{complexity:input.complexity}:{}),...(input.outputFormat==='gif'?{frame_count:input.frameCount,frame_duration_ms:input.frameDurationMs}:{})}
  if(!route.replay&&route.editTransport==='multipart'&&references.length){
    const form=new FormData();for(const [name,value]of Object.entries(parameters))if(value!==undefined)form.set(name,String(value));form.set('n','1')
    references.forEach((r,i)=>form.append('image[]',new Blob([Buffer.from(r.data,'base64')],{type:r.mimeType}),'reference-'+i+({ 'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}[r.mimeType]||'.png')))
    for(const [name,layer]of Object.entries(layers))if(layer)form.set(name,new Blob([layer.bytes],{type:'image/png'}),name+'.png')
    return {headers:{},body:form}
  }
  return {headers:{'Content-Type':'application/json'},body:JSON.stringify({...parameters,...(references.length?route.replay?{references}:{images:references.map(r=>({image_url:'data:'+r.mimeType+';base64,'+r.data}))}:{}),...Object.fromEntries(Object.entries(layers).filter(([,v])=>v).map(([k,v])=>[k,route.replay?{id:v.id,mimeType:'image/png',data:v.bytes.toString('base64')}:{image_url:'data:image/png;base64,'+v.bytes.toString('base64')}]))})}
}

async function responseJSON(response) {
  const chunks = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 28 * 1024 * 1024) throw Error('生图响应过大，未处理。')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const activeJobs = new Map()
function createImageGenerator({ policy, userPrompt = '', references = [], markup, mask, resolveApiKey, resolveRoute, jobStore, nativeImage, fetchImpl = globalThis.fetch, download = downloadImage, sleep = (ms, signal) => delay(ms, undefined, { signal }) }) {
  if (policy?.outputPreset && !Object.hasOwn(require('./design-presets.json'), policy.outputPreset)) throw Error('图片交付规格无效。')
  // Durable receipts retain successful URLs across runs and app restarts.
  // Repeating the same call retries download, not a paid generation.
  const selectReferences = input => {
    const selected = input.referenceIds ? input.referenceIds.map(id => {
      const item = references.find(item => item.id === id)
      if (!item) throw Error('只能使用本次明确提供的参考图片。')
      return item
    }) : references
    if (selected.length && input.model === 'glm-image') throw Error('GLM 当前不支持参考图直传，请手动选择 GPT Image 后再发送。')
    if (selected.length > 4) throw Error('本次最多使用 4 张参考图片。')
    for (const item of selected) if (!Buffer.isBuffer(item.bytes) || createHash('sha256').update(item.bytes).digest('hex') !== item.id) throw Error('参考图快照校验失败。')
    return selected
  }
  const jobs = new Map()
  const queue = imageQueue(jobStore?.directory)
  const generate = async ({ workspace, args, signal }) => {
    signal?.throwIfAborted()
    const input = validateArgs(policy ? { ...args, ...imageArguments(policy) } : args)
    const selectedReferences = selectReferences(input)
    const referenceBody = selectedReferences.map(({id,mimeType,bytes}) => ({id,mimeType,data:bytes.toString('base64')}))
    const imageProvider = input.model === 'glm-image' ? 'GLM-Image' : 'GPT Image'
    const root = Array.isArray(workspace) ? workspace[0] : workspace
    const requested = path.resolve(root, input.output)
    const route = resolveRoute ? await resolveRoute(input) : { endpoint: ENDPOINT, apiKey: await resolveApiKey?.(), scope: 'direct', replay: false }
    if (input.model !== 'glm-image' && !route.replay && route.protocol !== 'openai-images') throw Error('GPT Image 需要配置兼容图片接口的服务连接。')
    if (input.outputFormat==='svg' && selectedReferences.length) throw Error('SVG 暂不支持参考图编辑，请移除参考图。')
    if (markup && mask) throw Error('说明标注和局部蒙版不能同时提交。')
    if ((markup || mask) && (!selectedReferences.length || ['svg','gif'].includes(input.outputFormat))) throw Error('当前格式不支持局部标注或蒙版编辑。')
    for (const layer of [markup,mask].filter(Boolean)) {
      if (!Buffer.isBuffer(layer.bytes) || layer.bytes.length>10*1024*1024 || createHash('sha256').update(layer.bytes).digest('hex')!==layer.id) throw Error('编辑图层校验失败。')
      const decoded=nativeImage.createFromBuffer(layer.bytes), source=await require('./image-artifacts.cjs').decodeRaster(selectedReferences[0].bytes,nativeImage)
      if(decoded.isEmpty() || JSON.stringify(decoded.getSize())!==JSON.stringify(source.getSize()) || !decoded.toBitmap().some((n,i)=>i%4===3&&n<255)) throw Error('编辑图层必须是与原图同尺寸的透明 PNG。')
    }
    if (selectedReferences.length && !route.editEndpoint) throw Error('云端参考图编辑接口尚未配置，未提交生图请求。')
    if (!route.apiKey) throw Error(route.replay ? '请在设置 → 账号中登录 Stable Cloud，再生成图片。' : '请在设置 → 模型连接中配置所选图片服务的 API Key，再生成图片。')
    const key = createHash('sha256').update(JSON.stringify([route.scope, requested, input.prompt, input.size, ...(input.model === 'glm-image' ? [] : [input.model,input.quality,input.background]), ...(policy?.outputPreset ? ['delivery', policy.outputPreset] : []), ...(selectedReferences.length ? ['references-v1', selectedReferences.map(item => item.id)] : []), ...(['outputFormat','complexity','frameCount','frameDurationMs','connectionId','upstreamModel','editTransport'].some(k=>input[k]!==undefined)||markup||mask ? ['image-options-v2', input.outputFormat||'png',input.complexity||null,input.frameCount||null,input.frameDurationMs||null,input.connectionId||null,input.upstreamModel||null,input.editTransport||null,markup?.id||null,mask?.id||null] : [])])).digest('hex')
    const saved = jobStore?.read(key)
    if (!jobs.has(key) && saved) jobs.set(key, { output: requested, record: saved, result: saved.result, hash: saved.hash })
    const existing = jobs.get(key)
    if (existing?.result && fs.existsSync(existing.result.path)) {
      const file = toolFile(workspace, requested)
      if (fs.statSync(file).size > MAX_BYTES || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== existing.hash) throw Error('已生成的文件发生变化，请先查看当前文件，不重复生图。')
      if (policy) await require('./image-artifacts.cjs').inspectArtifactAsync(fs.readFileSync(file),input.outputFormat||'png',nativeImage,policy)
      return { ...existing.result, reused: true }
    }
    toolFile(workspace, requested, { output: true })
    const relative = path.relative(root, requested)
    if (relative.split(/[\\/]/).some(part => ['.git', '.codex', '.claude', '.agents'].includes(part.toLowerCase()))) throw Error('不能向配置目录写入生成图片。')
    if (!nativeImage) throw Error('当前运行环境未提供图片解码器。')
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(480_000)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    // Credential resolution may yield; re-read so simultaneous identical calls
    // share the same paid request rather than racing to create separate jobs.
    let job = jobs.get(key)
    if (!job) {
      if ([...jobs.values()].some(item => item.output === requested)) throw Error('此输出路径已有生图请求，请复用原参数或另选新文件。')
      if (jobs.size >= (policy?.count || 32)) throw Error('已达到本轮选择的生图张数，请先检查已有产物。')
      job = { output: requested }; jobs.set(key, job)
    }
    const lockKey = jobStore ? jobStore.directory + ':' + key : null
    if (lockKey && activeJobs.has(lockKey)) return activeJobs.get(lockKey)
    const persist = record => { jobStore?.write(key, record); job.record = record }
    if (!job.generated) job.generated = Promise.resolve().then(async () => {
      if (job.record?.url) return job.record.url
      if (job.record?.status === 'failed' && !(job.record.notSubmitted === true && job.record.code === 'openai_egress_unavailable')) throw Error(job.record.error)
      if (job.record?.status === 'submitted' && !route.replay) throw Error('此前生图提交结果未知，已停止重复生成。请先核对供应商记录。')
      const recovering = job.record?.status === 'submitted'
      const release = await queue.acquire(combined)
      try {
        // Check after queuing too: a preceding job may have become unknown.
        if (!job.record) {
          const receipts = jobStore?.list() || [...jobs.entries()].map(([key, value]) => value.record && { ...value.record, key }).filter(Boolean)
          if (receipts.some(record => record.key !== key && record.status === 'submitted' && (record.unknown || !(jobStore ? activeJobs.has(jobStore.directory + ':' + record.key) : jobs.get(record.key)?.saving)))) throw Error('此前生图结果未确认，已阻止新增付费请求。请使用原参数恢复，不能换提示词或路径重新生成。')
        }
        persist({ ...job.record, status: 'submitted', unknown: false, input, output: requested, scope: route.scope })
        try {
          // POST with the same key is also the cloud status lookup. It cannot
          // reserve or submit twice; legacy gateways may still return sync 200.
          for (let poll = 0; poll < 160; poll++) {
            combined.throwIfAborted()
            let response
            try { const wire=imageWireRequest(input,route,referenceBody,{markup,mask});response = await (route.fetch || fetchImpl)(selectedReferences.length ? route.editEndpoint : route.endpoint, { method: 'POST', redirect: 'error', signal: job.record.cloudPending ? AbortSignal.any([combined, AbortSignal.timeout(30_000)]) : combined,
              headers: { Authorization: `Bearer ${route.apiKey}`, ...wire.headers, 'Idempotency-Key': `image-${key}`, ...(route.replay ? { Prefer: 'respond-async' } : {}) },body:wire.body }) }
            catch (error) {
              if (!route.replay || !job.record.cloudPending || combined.aborted) throw error
              await sleep(3000, combined); continue
            }
            if (!response.ok) {
              let cloudError, cloudCode
              if (route.replay) {
                let payload
                try { payload = await responseJSON(response) } catch { /* Non-JSON error pages must not reach the model. */ }
                cloudError = require('./cloud-transport.cjs').cloudResponseError(response, payload)
                cloudCode = payload?.error?.code
                if (cloudError.imageDiagnostic) persist({ ...job.record, diagnostic: cloudError.imageDiagnostic })
                if (response.status === 503 && payload?.error?.code === 'image_poll_unavailable') {
                  await sleep(3000, combined); continue
                }
              } else await response.body?.cancel()
              const hint = [401,403].includes(response.status) ? '请检查所选服务的 API Key 和图片功能权限。' : [402,429].includes(response.status) ? '请检查余额或额度/限流，不要连续重试。' : [400,422].includes(response.status) ? '当前服务拒绝所选参数，请核对模型、格式及功能权限。参数不会被自动删除或降级。' : '请稍后检查服务状态。'
              const message = route.replay && response.status === 404 ? `${imageProvider} 云端生图服务尚未部署或配置，请联系网关管理员。` : `${imageProvider} 请求失败（HTTP ${response.status}）。${cloudError?.message || hint}`
              if (response.status === 429) queue.serial()
              const confirmedFailure = route.replay && cloudCode === 'image_generation_failed' && response.status >= 400 && response.status < 500
              // The gateway emits this only before reserving/submitting a NEW
              // image. Never downgrade an already pending/unknown receipt.
              if (route.replay && cloudCode === 'openai_egress_unavailable' && response.status === 503 && !recovering && !job.record.cloudPending) persist({ status: 'failed', notSubmitted: true, error: message, code: cloudCode, input, output: requested, scope: route.scope })
              if (confirmedFailure || [400,401,402,403,404,422,429].includes(response.status) && (!route.replay || (!recovering && !job.record.cloudPending))) persist({ status: 'failed', error: message, code: cloudCode, input, output: requested, scope: route.scope })
              throw Error(message)
            }
            const data = await responseJSON(response)
            if (route.replay && response.status === 202 && data?.task_status === 'PROCESSING') {
              if (!job.record.cloudPending) persist({ ...job.record, cloudPending: true })
              await sleep(3000, combined); continue
            }
            if (input.model !== 'glm-image' && typeof data?.data?.[0]?.b64_json === 'string') {
              const encoded=data.data[0].b64_json
              if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length>28*1024*1024)throw Error('GPT Image 图片数据无效。')
              if(data.output_format && data.output_format!==(input.outputFormat||'png'))throw Error('GPT Image 返回格式与请求不一致。')
              const url='data:'+FORMATS[input.outputFormat||'png'].mimeType+';base64,'+encoded; persist({status:'generated',url,input,output:requested,usage:data.usage,svgUsage:data.svg_usage,requestId:response.headers?.get?.('x-request-id')||undefined});return url
            }
            if (typeof data?.data?.[0]?.url !== 'string') throw Error(`${imageProvider} 未返回图片，可能被内容审核拦截。`)
            persist({ status: 'generated', url: data.data[0].url, input, output:requested, usage:data.usage, svgUsage:data.svg_usage })
            return data.data[0].url
          }
          throw Error(`${imageProvider} 等待结果超时；任务已保留，请用原参数恢复查询，不要新增生图请求。`)
        } catch (error) {
          if (job.record?.status === 'submitted') persist({ ...job.record, unknown: true })
          // Never expose upstream response text, request headers or raw network errors.
          if (/^(GLM-Image|GPT Image) /.test(error.message)) throw error
          throw Error(`${imageProvider} 请求中断或超时，结果未确认；恢复时不会另行重复提交生图请求。`)
        }
      } finally { release() }
    }).catch(error => { job.generated = null; throw error })
    if (!job.saving) job.saving = (async () => {
      const url = await job.generated
      let bytes
      try { bytes = input.model !== 'glm-image' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(url) ? Buffer.from(url.slice(url.indexOf(',')+1),'base64') : await download(url, combined) }
      catch { throw Error('图片已生成但下载未完成；再次调用相同参数将只重试下载，不重新生图。') }
      combined.throwIfAborted()
      if (!bytes?.length || bytes.length > MAX_BYTES) throw Error('生成图片为空或超过 20 MB。')
      const format=input.outputFormat||'png', {inspectArtifactAsync,encodeRaster,decodeRaster}=require('./image-artifacts.cjs')
      const measured=await inspectArtifactAsync(bytes,format,nativeImage)
      let dimensions={width:measured.width,height:measured.height}, png=bytes
      if (policy) {
        const source=requested+'.source.'+outputExtension(input), original=bytes
        if(!fs.existsSync(source)) fs.writeFileSync(toolFile(workspace,source,{output:true}),original,{flag:'wx'})
        else if(createHash('sha256').update(fs.readFileSync(toolFile(workspace,source))).digest('hex')!==createHash('sha256').update(original).digest('hex'))throw Error('保留的原图发生变化，已停止处理。')
        persist({...job.record,input,rawPath:source,rawHash:createHash('sha256').update(original).digest('hex')})
        try {
          if(['svg','gif'].includes(format))await inspectArtifactAsync(bytes,format,nativeImage,policy)
          else if(format!=='png'&&!policy.outputPreset&&(policy.size==='auto'||policy.size===measured.width+'x'+measured.height)){await inspectArtifactAsync(bytes,format,nativeImage,policy)}
          else {const fitted=require('./design-output.cjs').finishDesignImage(await decodeRaster(bytes,nativeImage),nativeImage,policy);dimensions=fitted.dimensions;png=await encodeRaster(nativeImage.createFromBuffer(fitted.png),format);await inspectArtifactAsync(png,format,nativeImage,policy)}
        }catch(error){throw Error(error.message+' 原图已保存：'+source+'；可恢复本地处理，不会重复生图。')}
      }
      if (png.length > MAX_BYTES) throw Error('生成图片文件过大。')
      combined.throwIfAborted()
      const target = toolFile(workspace, requested, { output: true })
      const fd = fs.openSync(target, 'wx')
      try { fs.writeFileSync(fd, png) }
      catch (error) { fs.closeSync(fd); fs.unlinkSync(target); throw error }
      fs.closeSync(fd)
      job.hash = createHash('sha256').update(png).digest('hex')
      job.result = { path: target, model: input.model, mimeType: FORMATS[format].mimeType, outputFormat:format, ...(measured.frameCount?{frameCount:measured.frameCount,frameDurationsMs:measured.frameDurationsMs,durationMs:measured.durationMs}:{}), ...(job.record?.usage?{usage:job.record.usage}:{}), ...(job.record?.svgUsage?{svgUsage:job.record.svgUsage}:{}), ...dimensions, bytes: png.length }
      persist({ ...job.record, status: 'completed', hash: job.hash, result: job.result, ...(policy ? { deliverySpec: require('./design-output.cjs').deliverySpec(policy) } : {}) })
      return job.result
    })().finally(() => { job.saving = null; if (lockKey) activeJobs.delete(lockKey); if (!job.record) jobs.delete(key) })
    if (lockKey) activeJobs.set(lockKey, job.saving)
    return job.saving
  }
  return async request => {
    const { additionalImages, designOverrides, ...first } = request.args || {}
    if (designOverrides !== undefined) {
      if (!policy || !designOverrides || typeof designOverrides !== 'object' || Array.isArray(designOverrides) || Object.keys(designOverrides).some(key => !['size','model','quality','background','count','text','mode','fit','outputFormat','complexity','frameCount','frameDurationMs','connectionId','upstreamModel','editTransport'].includes(key))) throw Error('本次 Design 参数覆盖无效。')
      const next = { ...policy, ...designOverrides }
      if (designOverrides.size !== undefined) {
        const parts = /^(\d{3,4})x(\d{3,4})$/.exec(designOverrides.size)
        if (!parts) throw Error('图片尺寸无效，尚未提交生图。')
        Object.assign(next, { ratio: 'custom', width: +parts[1], height: +parts[2], outputPreset: undefined })
      }
      const normalized = require('./design-prompt.cjs').resolveDesignPrompt(next, userPrompt)
      // Freeze one resolved contract for the whole turn once any image starts.
      if (jobs.size && JSON.stringify(normalized) !== JSON.stringify(policy)) throw Error('本轮已开始生图，不能中途更换图片参数；请在新请求中提供新要求。')
      Object.assign(policy, normalized)
      if (!normalized.outputPreset) delete policy.outputPreset
    }
    if (additionalImages === undefined) return generate({ ...request, args: first })
    if (!Array.isArray(additionalImages) || additionalImages.length !== 1) throw Error('一批最多两张图片，请将其余方案放在下一批。')
    const inputs = [first, ...additionalImages].map(args => validateArgs(policy ? { ...args, ...imageArguments(policy) } : args))
    for (const input of inputs) selectReferences(input)
    const root = Array.isArray(request.workspace) ? request.workspace[0] : request.workspace
    const targets = inputs.map(input => path.resolve(root, input.output))
    if (new Set(targets.map(file => process.platform === 'win32' ? file.toLowerCase() : file)).size !== inputs.length) throw Error('同批图片需要不同的输出路径。')
    // Validate the whole batch before any paid submission.
    for (const target of targets) {
      toolFile(request.workspace, target, { output: !fs.existsSync(target) })
      if (fs.existsSync(target) && ![...jobs.values()].some(job => job.result?.path === target) && !jobStore?.list().some(record => record.result?.path === target)) throw Error('输出文件已存在，不能覆盖或重新生图。')
      if (path.relative(root, target).split(/[\\/]/).some(part => ['.git', '.codex', '.claude', '.agents'].includes(part.toLowerCase()))) throw Error('不能向配置目录写入生成图片。')
    }
    if (jobs.size + targets.filter(target => ![...jobs.values()].some(job => job.output === target)).length > (policy?.count || 32)) throw Error('已达到本轮选择的生图张数，请先检查已有产物。')
    const results = await Promise.allSettled(inputs.map(args => generate({ ...request, args })))
    const images = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    const errors = results.flatMap((result, index) => result.status === 'rejected' ? [{ output: inputs[index].output, message: result.reason.message }] : [])
    return { ok: !errors.length, images, ...(errors.length ? { errors, error: '部分图片未完成；保留成功产物，仅使用原参数恢复未完成任务，不要新增付费请求。' } : {}) }
  }
}

module.exports = { imageWireRequest, createImageGenerator, IMAGE_GUIDANCE, ENDPOINT, validateArgs, downloadImage, publicAddress, allowedImageAddress }
