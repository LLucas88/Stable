'use strict'

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const dns = require('node:dns')
const { createHash } = require('node:crypto')
const { BlockList } = require('node:net')
const { toolFile } = require('./tool-files.cjs')

const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/images/generations'
const MAX_BYTES = 20 * 1024 * 1024
const IMAGE_GUIDANCE = '需要新生成插画、海报、封面或其他图片素材时，使用 stable_image_generate（GLM-Image），无需切换对话模型；凭据由 Stable 读取，不要查找或传入 API Key。已有图片查看、截图、数据图表不属于文本生图，不要为这些任务调用。原图编辑需要新背景或装饰时，仅生成新增素材，再通过脚本合成受保护的原图内容；不能把 GLM 当成原图编辑接口。每次生成一张，复用已生成的文件；成功后用 Read 查看实际图片并提供本地文件链接或嵌入交付文件。失败如实说明，不伪造产物、不反复付费重试。'

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
  if (!args || Object.keys(args).some(key => !['prompt', 'size', 'output'].includes(key))) throw Error('生图参数无效。')
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || [...args.prompt].length > 1000) throw Error('图片描述需要 1–1000 个字符。')
  const size = args.size || '1280x1280'
  const parts = /^(\d{3,4})x(\d{3,4})$/.exec(size)
  if (!parts || parts.slice(1).some(value => Number(value) < 512 || Number(value) > 2048 || Number(value) % 32)) throw Error('图片宽高须为 512–2048 且为 32 的整数倍，例如 1280x1280。')
  if (typeof args.output !== 'string' || path.extname(args.output).toLowerCase() !== '.png') throw Error('请提供工作区内新的 .png 输出路径，父目录须已存在。')
  return { prompt: args.prompt.trim(), size, output: args.output }
}

async function responseJSON(response) {
  const chunks = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 1024 * 1024) throw Error('GLM-Image 响应过大，未处理。')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const activeJobs = new Map()
function createImageGenerator({ policy, resolveApiKey, resolveRoute, jobStore, nativeImage, fetchImpl = globalThis.fetch, download = downloadImage }) {
  // Durable receipts retain successful URLs across runs and app restarts.
  // Repeating the same call retries download, not a paid generation.
  const jobs = new Map()
  return async ({ workspace, args, signal }) => {
    signal?.throwIfAborted()
    const input = validateArgs(policy ? { ...args, size: policy.size } : args)
    const root = Array.isArray(workspace) ? workspace[0] : workspace
    const requested = path.resolve(root, input.output)
    const route = resolveRoute ? await resolveRoute() : { endpoint: ENDPOINT, apiKey: await resolveApiKey?.(), scope: 'direct', replay: false }
    if (!route.apiKey) throw Error('请在设置 → 模型连接中配置智谱标准 API Key，再生成图片。')
    const key = createHash('sha256').update(JSON.stringify([route.scope, requested, input.prompt, input.size])).digest('hex')
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
    const timeout = AbortSignal.timeout(180_000)
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
    if (!job.generated) job.generated = (async () => {
      if (job.record?.url) return job.record.url
      if (job.record?.status === 'failed') throw Error(job.record.error)
      if (job.record?.status === 'submitted' && !route.replay) throw Error('此前生图提交结果未知，已停止重复生成。请先核对供应商记录。')
      persist({ status: 'submitted' })
        try {
          const response = await (route.fetch || fetchImpl)(route.endpoint, { method: 'POST', redirect: 'error', signal: combined,
            headers: { Authorization: `Bearer ${route.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `image-${key}` },
            body: JSON.stringify({ model: 'glm-image', prompt: input.prompt, size: input.size, quality: 'hd' }) })
          if (!response.ok) {
            let cloudError
            if (route.replay) {
              let payload
              try { payload = await responseJSON(response) } catch { /* Non-JSON error pages must not reach the model. */ }
              cloudError = require('./cloud-transport.cjs').cloudResponseError(response, payload)
            } else await response.body?.cancel()
            const hint = [401,403].includes(response.status) ? '请检查智谱标准 API Key 和生图权限。' : [402,429].includes(response.status) ? '请检查余额或额度/限流，不要连续重试。' : '请稍后检查服务状态。'
            const message = route.replay && response.status === 404 ? 'GLM-Image 云端生图服务尚未部署或配置，请联系网关管理员。' : `GLM-Image 请求失败（HTTP ${response.status}）。${cloudError?.message || hint}`
            if ([400,401,402,403,404,422,429].includes(response.status)) persist({ status: 'failed', error: message })
            throw Error(message)
          }
          const data = await responseJSON(response)
          if (typeof data?.data?.[0]?.url !== 'string') throw Error('GLM-Image 未返回图片，可能被内容审核拦截。')
          persist({ status: 'generated', url: data.data[0].url })
          return data.data[0].url
        } catch (error) {
          // Never expose upstream response text, request headers or raw network errors.
          if (/^GLM-Image /.test(error.message)) throw error
          throw Error('GLM-Image 请求中断或超时，结果未确认；恢复时不会另行重复提交生图请求。')
        }
      })()
    if (!job.saving) job.saving = (async () => {
      const url = await job.generated
      let bytes
      try { bytes = await download(url, combined) }
      catch { throw Error('图片已生成但下载未完成；再次调用相同参数将只重试下载，不重新生图。') }
      combined.throwIfAborted()
      if (!bytes?.length || bytes.length > MAX_BYTES) throw Error('生成图片为空或超过 20 MB。')
      const decoded = nativeImage.createFromBuffer(bytes)
      if (decoded.isEmpty()) throw Error('返回内容无法解码为图片。')
      const dimensions = decoded.getSize()
      if (!dimensions.width || !dimensions.height || dimensions.width > 4096 || dimensions.height > 4096) throw Error('生成图片尺寸不受支持。')
      const png = decoded.toPNG()
      if (png.length > MAX_BYTES) throw Error('生成图片文件过大。')
      combined.throwIfAborted()
      const target = toolFile(workspace, requested, { output: true })
      const fd = fs.openSync(target, 'wx')
      try { fs.writeFileSync(fd, png) }
      catch (error) { fs.closeSync(fd); fs.unlinkSync(target); throw error }
      fs.closeSync(fd)
      job.hash = createHash('sha256').update(png).digest('hex')
      job.result = { path: target, model: 'glm-image', mimeType: 'image/png', ...dimensions, bytes: png.length }
      persist({ ...job.record, status: 'completed', hash: job.hash, result: job.result })
      return job.result
    })().finally(() => { job.saving = null; if (lockKey) activeJobs.delete(lockKey) })
    if (lockKey) activeJobs.set(lockKey, job.saving)
    return job.saving
  }
}

module.exports = { createImageGenerator, IMAGE_GUIDANCE, ENDPOINT, validateArgs, downloadImage, publicAddress, allowedImageAddress }
