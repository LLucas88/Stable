'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createZhipuSearchProvider,mapZhipuSearchResponse,ZHIPU_SEARCH_ENDPOINT,ZHIPU_SEARCH_PROVIDER_ID}=require('../desktop/services/model-provider.cjs')
test('Zhipu search provider calls the official endpoint and normalizes citeable sources', async () => {
  class TestWebError extends Error {
    constructor(message, code, options) { super(message); this.code = code; this.cause = options?.cause }
  }
  const requests = []
  const provider = createZhipuSearchProvider({
    apiKey: 'zhipu-secret',
    WebError: TestWebError,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            search_result: [
              { title: 'Result A', content: 'Summary A', link: 'https://example.com/a', publish_date: '2026-09-02' },
              { title: 'Duplicate', content: 'Duplicate', link: 'https://example.com/a' },
              { title: 'Unsafe', content: 'Skip', link: 'file:///tmp/private' },
              { title: 'Result B', link: 'http://example.org/b' },
            ],
          }
        },
      }
    },
  })

  assert.equal(provider.id, ZHIPU_SEARCH_PROVIDER_ID)
  assert.equal(provider.available(), true)
  const result = await provider.search({ query: 'a'.repeat(100), maxResults: 99 })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, ZHIPU_SEARCH_ENDPOINT)
  assert.equal(requests[0].options.headers.authorization, 'Bearer zhipu-secret')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    search_query: 'a'.repeat(70), search_engine: 'search_std', search_intent: false,
    count: 50, search_recency_filter: 'noLimit', content_size: 'medium',
  })
  assert.deepEqual(result, {
    sources: [
      { url: 'https://example.com/a', title: 'Result A', snippet: 'Summary A', publishedAt: '2026-09-02' },
      { url: 'http://example.org/b', title: 'Result B' },
    ],
    truncated: false,
  })
  assert.deepEqual(mapZhipuSearchResponse({ search_result: [] }), { sources: [], truncated: false })
})

test('Zhipu search provider enforces the Harness result bound even when the API over-returns', async () => {
  class TestWebError extends Error {
    constructor(message, code) { super(message); this.code = code }
  }
  const provider = createZhipuSearchProvider({
    apiKey: 'zhipu-secret', WebError: TestWebError,
    fetchImpl: async () => ({
      ok: true, status: 200,
      json: async () => ({ search_result: [1, 2, 3].map((index) => ({ title: `R${index}`, link: `https://example.com/${index}` })) }),
    }),
  })
  assert.deepEqual(await provider.search({ query: 'Stable', maxResults: 2 }), {
    sources: [
      { url: 'https://example.com/1', title: 'R1' },
      { url: 'https://example.com/2', title: 'R2' },
    ],
    truncated: true,
  })
})

test('Zhipu search provider exposes provider-safe HTTP errors without leaking credentials', async () => {
  class TestWebError extends Error {
    constructor(message, code) { super(message); this.code = code }
  }
  const provider = createZhipuSearchProvider({
    apiKey: 'never-leak-this-key', WebError: TestWebError,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'API key invalid' } }) }),
  })
  await assert.rejects(
    () => provider.search({ query: 'Stable' }),
    (error) => error.code === 'WEB_PROVIDER_ERROR' && /HTTP 401.*API key invalid/.test(error.message) && !error.message.includes('never-leak-this-key'),
  )
})
