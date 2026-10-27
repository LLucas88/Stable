'use strict'
const { isDeepSeekModel, isZhipuModel } = require('./model-registry.cjs')
const ZHIPU_SEARCH_PROVIDER_ID = 'zhipu-official'
const ZHIPU_SEARCH_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/web_search'

function isHttpSourceURL(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}

function mapZhipuSearchResponse(payload) {
  const sources = []
  const seen = new Set()
  for (const item of Array.isArray(payload?.search_result) ? payload.search_result : []) {
    const url = String(item?.link || '').trim()
    if (!isHttpSourceURL(url) || seen.has(url)) continue
    seen.add(url)
    const title = String(item?.title || '').trim()
    const snippet = String(item?.content || '').trim()
    const publishedAt = String(item?.publish_date || '').trim()
    sources.push({
      url,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    })
  }
  return { sources, truncated: false }
}

function createZhipuSearchProvider({ apiKey, WebError, fetchImpl = globalThis.fetch, endpoint = ZHIPU_SEARCH_ENDPOINT }) {
  const fail = (message, code = 'WEB_PROVIDER_ERROR', cause) => new WebError(message, code, cause === undefined ? undefined : { cause })
  const aborted = (signal, cause) => fail('智谱联网搜索已取消。', 'WEB_ABORTED', signal?.reason ?? cause)
  return {
    id: ZHIPU_SEARCH_PROVIDER_ID,
    available() { return Boolean(apiKey) && typeof fetchImpl === 'function' && isHttpSourceURL(endpoint) },
    async search(request, signal) {
      if (signal?.aborted) throw aborted(signal)
      const query = String(request?.query || '').trim().slice(0, 70)
      if (!query) throw fail('智谱联网搜索关键词不能为空。')
      const requestedCount = Number(request?.maxResults)
      const count = Number.isFinite(requestedCount) ? Math.max(1, Math.min(50, Math.trunc(requestedCount))) : 10
      let response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ search_query: query, search_engine: 'search_std', search_intent: false, count, search_recency_filter: 'noLimit', content_size: 'medium' }),
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw aborted(signal, error)
        throw fail(`智谱联网搜索请求失败：${String(error?.message || error)}`, 'WEB_PROVIDER_ERROR', error)
      }
      let payload
      try { payload = await response.json() }
      catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw aborted(signal, error)
        throw fail(`智谱联网搜索返回了无效数据（HTTP ${response.status}）。`, 'WEB_PROVIDER_ERROR', error)
      }
      if (!response.ok) {
        const detail = String(payload?.error?.message || payload?.message || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300)
        throw fail(`智谱联网搜索失败（HTTP ${response.status}）${detail ? `：${detail}` : '。'}`)
      }
      if (!Array.isArray(payload?.search_result)) throw fail('智谱联网搜索响应缺少 search_result。')
      const result = mapZhipuSearchResponse(payload)
      if (result.sources.length <= count) return result
      return { ...result, sources: result.sources.slice(0, count), truncated: true }
    },
  }
}

function chatURL(baseURL) {
  const url = new URL(baseURL)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型服务地址无效。')
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  return url.href
}

async function* readSSE(body) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r/g, '')
    if (buffer.length > 16 * 1024 * 1024) throw new Error('模型流式事件超过大小限制。')
    let end
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, end); buffer = buffer.slice(end + 2)
      const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
      if (data && data !== '[DONE]') yield JSON.parse(data)
    }
  }
  buffer += decoder.decode()
  const data = buffer.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
  if (data && data !== '[DONE]') yield JSON.parse(data)
}

async function runProviderSearch(request, signal) {
    if (this.search) return this.search(request, signal)
    if (this.model.providerId === 'stable-cloud' || isDeepSeekModel(this.model)) return require('./deepseek-web.cjs').runWebTool(this, 'search', request, signal)
    if (isZhipuModel(this.model)) {
      const provider = createZhipuSearchProvider({ apiKey: this.apiKey, WebError: Error, fetchImpl: this.fetch })
      return provider.search(request, signal)
    }
    throw new Error('当前模型未配置联网搜索，请使用可用的网页读取工具。')
  }
async function runProviderFetch(request, signal) {
  if (this.model.providerId === 'stable-cloud' || isDeepSeekModel(this.model)) return require('./deepseek-web.cjs').runWebTool(this, 'fetch', request, signal)
  throw Error('当前直连模型未配置 DeepSeek 网页抓取，请使用 stable_browser 读取网页。')
}
module.exports = { ZHIPU_SEARCH_ENDPOINT, ZHIPU_SEARCH_PROVIDER_ID, chatURL, readSSE, runProviderSearch, runProviderFetch, createZhipuSearchProvider, mapZhipuSearchResponse }
