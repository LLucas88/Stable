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

const { imageOptions, checkImageSize } = require('./image-models.cjs')
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/images/generations'
const MAX_BYTES = 20 * 1024 * 1024
const IMAGE_GUIDANCE = '需要新生成插画、海报、封面或其他图片素材时，使用 stable_image_generate（支持 GLM-image 和云端 GPT Image 2.5），无需切换对话模型；凭据由 Stable 读取，不要查找或传入 API Key。已有图片查看、截图、数据图表不属于文本生图，不要为这些任务调用。原图编辑需要新背景或装饰时，仅生成新增素材，再通过脚本合成受保护的原图内容；不能把 GLM 当成原图编辑接口。多个独立方案优先通过 additionalImages 附带第二张，每批最多2张并发，其余下一批；依赖上一张结果时串行。复用已生成的文件；成功后用 Read 查看实际图片并提供本地文件链接或嵌入交付文件。失败如实说明，不伪造产物、不反复付费重试。'

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
  if (!args || Object.keys(args).some(key => !['prompt', 'size', 'output', 'model', 'quality', 'background'].includes(key))) throw Error('生图参数无效。')
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || [...args.prompt].length > 1000) throw Error('图片描述需要 1–1000 个字符。')
  const size = args.size || '1280x1280'
  const parts = /^(\d{3,4})x(\d{3,4})$/.exec(size)
  if (!parts || parts.slice(1).some(value => Number(value) < 512 || Number(value) > 2048 || Number(value) % 32)) throw Error('图片宽高须为 512–2048 且为 32 的整数倍，例如 1280x1280。')
  if (typeof args.output !== 'string' || path.extname(args.output).toLowerCase() !== '.png') throw Error('请提供工作区内新的 .png 输出路径，父目录须已存在。')
  const options = imageOptions(args); checkImageSize(options.model, size)
  return { prompt: args.prompt.trim(), size, output: args.output, ...options }
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
function createImageGenerator({ policy, resolveApiKey, resolveRoute, jobStore, nativeImage, fetchImpl = globalThis.fetch, download = downloadImage, sleep = (ms, signal) => delay(ms, undefined, { signal }) }) {
  if (policy?.outputPreset && !Object.hasOwn(require('./design-presets.json'), policy.outputPreset)) throw Error('图片交付规格无效。')
  // Durable receipts retain successful URLs across runs and app restarts.
  // Repeating the same call retries download, not a paid generation.
  const jobs = new Map()
  const queue = imageQueue(jobStore?.directory)
  const generate = async ({ workspace, args, signal }) => {
    signal?.throwIfAborted()
    const input = validateArgs(policy ? { ...args, size: policy.size, model: policy.model, quality: policy.quality, background: policy.background } : args)
    const imageProvider = input.model === 'glm-image' ? 'GLM-Image' : 'GPT Image'
    const root = Array.isArray(workspace) ? workspace[0] : workspace
    const requested = path.resolve(root, input.output)
    const route = resolveRoute ? await resolveRoute() : { endpoint: ENDPOINT, apiKey: await resolveApiKey?.(), scope: 'direct', replay: false }
    if (input.model !== 'glm-image' && !route.replay) throw Error('GPT Image 需要已配置的 Stable Cloud 网关。')
    if (!route.apiKey) throw Error(route.replay ? '请在设置 → 账号中登录 Stable Cloud，再生成图片。' : '请在设置 → 模型连接中配置智谱标准 API Key，再生成图片。')
    const key = createHash('sha256').update(JSON.stringify([route.scope, requested, input.prompt, input.size, ...(input.model === 'glm-image' ? [] : [input.model,input.quality,input.background]), ...(policy?.outputPreset ? ['delivery', policy.outputPreset] : [])])).digest('hex')
    const saved = jobStore?.read(key)
    if (!jobs.has(key) && saved) jobs.set(key, { output: requested, record: saved, result: saved.result, hash: saved.hash })
    const existing = jobs.get(key)
    if (existing?.result && fs.existsSync(existing.result.path)) {
      const file = toolFile(workspace, requested)
      if (fs.statSync(file).size > MAX_BYTES || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== existing.hash) throw Error('已生成的文件发生变化，请先查看当前文件，不重复生图。')
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
      if (job.record?.status === 'failed') throw Error(job.record.error)
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
            try { response = await (route.fetch || fetchImpl)(route.endpoint, { method: 'POST', redirect: 'error', signal: job.record.cloudPending ? AbortSignal.any([combined, AbortSignal.timeout(30_000)]) : combined,
              headers: { Authorization: `Bearer ${route.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `image-${key}`, ...(route.replay ? { Prefer: 'respond-async' } : {}) },
              body: JSON.stringify({ model: input.model, prompt: input.prompt, size: input.size, quality: input.quality, ...(input.model === 'glm-image' ? {} : {background:input.background}) }) }) }
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
                if (response.status === 503 && payload?.error?.code === 'image_poll_unavailable') {
                  await sleep(3000, combined); continue
                }
              } else await response.body?.cancel()
              const hint = [401,403].includes(response.status) ? '请检查智谱标准 API Key 和生图权限。' : [402,429].includes(response.status) ? '请检查余额或额度/限流，不要连续重试。' : '请稍后检查服务状态。'
              const message = route.replay && response.status === 404 ? `${imageProvider} 云端生图服务尚未部署或配置，请联系网关管理员。` : `${imageProvider} 请求失败（HTTP ${response.status}）。${cloudError?.message || hint}`
              if (response.status === 429) queue.serial()
              if ([400,401,402,403,404,422,429].includes(response.status) && (!route.replay || (!recovering && !job.record.cloudPending) || cloudCode === 'image_generation_failed')) persist({ status: 'failed', error: message })
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
              const url='data:image/png;base64,'+encoded; persist({status:'generated',url});return url
            }
            if (typeof data?.data?.[0]?.url !== 'string') throw Error(`${imageProvider} 未返回图片，可能被内容审核拦截。`)
            persist({ status: 'generated', url: data.data[0].url })
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
      try { bytes = input.model !== 'glm-image' && url.startsWith('data:image/png;base64,') ? Buffer.from(url.slice(22),'base64') : await download(url, combined) }
      catch { throw Error('图片已生成但下载未完成；再次调用相同参数将只重试下载，不重新生图。') }
      combined.throwIfAborted()
      if (!bytes?.length || bytes.length > MAX_BYTES) throw Error('生成图片为空或超过 20 MB。')
      const decoded = nativeImage.createFromBuffer(bytes)
      if (decoded.isEmpty()) throw Error('返回内容无法解码为图片。')
      let dimensions = decoded.getSize()
      if (!dimensions.width || !dimensions.height || dimensions.width > 4096 || dimensions.height > 4096) throw Error('生成图片尺寸不受支持。')
      let png
      if (policy?.outputPreset) ({ png, dimensions } = require('./design-output.cjs').finishDesignImage(decoded, nativeImage, policy.outputPreset, input.background))
      else png = decoded.toPNG()
      if (png.length > MAX_BYTES) throw Error('生成图片文件过大。')
      combined.throwIfAborted()
      const target = toolFile(workspace, requested, { output: true })
      const fd = fs.openSync(target, 'wx')
      try { fs.writeFileSync(fd, png) }
      catch (error) { fs.closeSync(fd); fs.unlinkSync(target); throw error }
      fs.closeSync(fd)
      job.hash = createHash('sha256').update(png).digest('hex')
      job.result = { path: target, model: input.model, mimeType: 'image/png', ...dimensions, bytes: png.length }
      persist({ ...job.record, status: 'completed', hash: job.hash, result: job.result })
      return job.result
    })().finally(() => { job.saving = null; if (lockKey) activeJobs.delete(lockKey); if (!job.record) jobs.delete(key) })
    if (lockKey) activeJobs.set(lockKey, job.saving)
    return job.saving
  }
  return async request => {
    const { additionalImages, ...first } = request.args || {}
    if (additionalImages === undefined) return generate(request)
    if (!Array.isArray(additionalImages) || additionalImages.length !== 1) throw Error('一批最多两张图片，请将其余方案放在下一批。')
    const inputs = [first, ...additionalImages].map(args => validateArgs(policy ? { ...args, size: policy.size, model: policy.model, quality: policy.quality, background: policy.background } : args))
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

module.exports = { createImageGenerator, IMAGE_GUIDANCE, ENDPOINT, validateArgs, downloadImage, publicAddress, allowedImageAddress }
