'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { build } = require('esbuild')
const { OpenAIResponses } = require('../../desktop/services/openai-responses.cjs')
const { readSSE } = require('../../desktop/services/model-provider.cjs')

async function main() {
  const source = path.resolve(process.argv[2] || '.local/gpt6-currency-stage/source')
  const file = relative => path.join(source, relative)
  const specifier = relative => JSON.stringify(file(relative).replaceAll('\\', '/'))
  const { SqliteD1 } = await import(pathToFileURL(file('runtime/sqlite-d1.mjs')).href)
  const { activateGpt6Text } = await import('./activate-gpt6-text.mjs')
  const db = new SqliteD1(':memory:')
  const sql = db.database
  const originalFetch = globalThis.fetch
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stable-currency-fixture-'))
  try {
    const migrations = fs.readdirSync(file('drizzle')).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort()
    const migration = migrations.find(name => name.endsWith('_dual_currency_quota.sql'))
    assert(migration, 'dual-currency migration is missing')
    for (const name of migrations.filter(name => name !== migration)) sql.exec(fs.readFileSync(file(`drizzle/${name}`), 'utf8'))
    const insertAccount = sql.prepare(`INSERT INTO accounts
      (id, username, display_name, role, status, password_algorithm, password_hash, password_salt,
        password_iterations, must_change_password, auth_version, created_at, updated_at)
      VALUES (?, ?, ?, 'member', ?, 'pbkdf2-sha256', 'fixture', 'fixture', 100000, 0, 1, 1, 1)`)
    insertAccount.run('fixture', 'fixture', 'Fixture', 'active')
    insertAccount.run('disabled', 'disabled', 'Disabled', 'disabled')
    sql.exec(`INSERT INTO quota_buckets
      (id, account_id, currency, limit_micros, spent_micros, reserved_micros, period_start, period_end, status, created_at, updated_at)
      VALUES ('fixture-cny', 'fixture', 'CNY', 100000000, 0, 0, 0, 9999999999999, 'active', 1, 1);`)
    const activeModels = ['gpt-6.1-sol', 'gpt-6.1-terra']
    for (const model of activeModels) {
      sql.prepare(`INSERT INTO models
        (id, display_name, provider, upstream_model, upstream_base_url, secret_name, context_window, max_output_tokens, status, created_at, updated_at)
        VALUES (?, ?, 'openai', ?, 'https://api.openai.com/v1', 'OPENAI_API_KEY', 1050000, 128000, 'active', 1, 1)`).run(model, model, model)
      sql.prepare(`INSERT INTO model_prices
        (id, model_id, currency, input_micros_per_million, output_micros_per_million, effective_at, created_at)
        VALUES (?, ?, 'CNY', 1000000, 5000000, 0, 1)`).run(`${model}-legacy`, model)
    }
    globalThis.__currencyFixtureEnv = { DB: db, SESSION_TOKEN_PEPPER: 'fixture-pepper', ALLOWED_UPSTREAM_ORIGINS: 'https://api.openai.com', OPENAI_API_KEY: 'synthetic-key' }
    const out = path.join(tmp, 'routes.cjs')
    await build({ stdin: { contents: `
      export { POST as chat } from ${specifier('app/v1/responses/route.ts')};
      export { GET as account } from ${specifier('app/api/account/route.ts')};
      export { GET as usage } from ${specifier('app/api/usage/summary/route.ts')};
      export { listPublicModels } from ${specifier('lib/server/model-catalog.ts')};
      export { hashSessionToken } from ${specifier('lib/server/crypto.ts')};`, resolveDir: source, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: out, plugins: [{ name: 'currency-fixture', setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'currency-env' }))
      builder.onLoad({ filter: /.*/, namespace: 'currency-env' }, () => ({ contents: 'export const env=globalThis.__currencyFixtureEnv' }))
      builder.onResolve({ filter: /^@\// }, args => ({ path: file(`${args.path.slice(2)}.ts`) }))
      builder.onResolve({ filter: /^\.\/openai-fetch$/ }, () => ({ path: 'egress', namespace: 'currency-egress' }))
      builder.onLoad({ filter: /.*/, namespace: 'currency-egress' }, () => ({ contents: 'export const providerFetch=request=>fetch(request);export const assertOpenAIEgressReady=async()=>{}' }))
    } }] })
    const api = require(out)
    const token = 'currency-test-token'
    sql.prepare(`INSERT INTO sessions (id, account_id, token_hash, auth_version, device_id, device_name, platform, app_version, expires_at, last_seen_at, created_at)
      VALUES ('session', 'fixture', ?, 1, 'device', 'Fixture', 'win32', 'test', 9999999999999, 1, 1)`).run(await api.hashSessionToken(token, 'fixture-pepper'))

    const upstream = []
    globalThis.fetch = async input => {
      assert(input.url === 'https://api.openai.com/v1/responses' || input.url === 'https://api.openai.com/v1/responses/input_tokens')
      if (input.url.endsWith('/input_tokens')) return Response.json({ object: 'response.input_tokens', input_tokens: 20 })
      const body = await input.json()
      upstream.push(body.model)
      const forced = body.tool_choice?.name
      const result = body.input.find(item => item.type === 'function_call_output')
      const output = forced
        ? [{ type: 'function_call', name: forced, call_id: 'call_currency_fixture', status: 'completed', arguments: '{}' }]
        : [{ type: 'message', content: [{ type: 'output_text', text: result ? result.output : 'ok' }] }]
      return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', model: body.model,
        output, usage: { input_tokens: 20, output_tokens: 3 } } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const chat = (id, body) => api.chat(new Request('https://gateway.fixture/v1/responses', { method: 'POST', headers: { ...headers, 'idempotency-key': id }, body: JSON.stringify(body) }))
    const send = async (model, id) => {
      const response = await chat(id, { model, input: [{ role: 'user', content: 'fixture' }], store: false, stream: true, max_output_tokens: 64 })
      assert.equal(response.status, 200, await response.clone().text())
      assert.match(await response.text(), /response.completed/)
    }
    const balances = () => sql.prepare('SELECT currency, limit_micros, spent_micros, reserved_micros FROM quota_buckets ORDER BY currency').all().map(row => ({ ...row }))
    await send('gpt-6.1-sol', 'fixt-legacy-cny')
    const cny = balances()[0]
    assert(cny.spent_micros > 0)
    sql.exec(fs.readFileSync(file(`drizzle/${migration}`), 'utf8'))
    const preview = activateGpt6Text(sql)
    assert.equal(preview.grant.accounts, 1)
    assert.equal(preview.models.filter(item => item.action === 'add').length, 5)
    assert.equal(preview.models.filter(item => item.action === 'switch-to-usd').length, 2)
    assert.deepEqual(balances(), [cny])
    const activation = activateGpt6Text(sql, { apply: true })
    assert.equal(activation.grant.perAccountMicros, 10_000_000)
    assert.deepEqual(balances(), [cny, { currency: 'USD', limit_micros: 10_000_000, spent_micros: 0, reserved_micros: 0 }])
    assert.equal(activateGpt6Text(sql, { apply: true }).grant.alreadyApplied, true)
    assert.equal(sql.prepare("SELECT currency FROM model_prices WHERE id='gpt-6.1-sol-legacy'").get().currency, 'CNY')
    const models = await api.listPublicModels()
    assert.equal(models.length, 7)
    for (const model of models) {
      assert.equal(model.currency, 'USD')
      assert.equal(model.responses_supported, true)
      await send(model.id, `fixt-usd-${model.id}`)
    }
    let nextKey = 0
    const adapter = new OpenAIResponses({ model: { model: 'gpt-6.2-sol', providerId: 'stable-cloud', cloudResponses: true, baseURL: 'http://127.0.0.1:65500/v1' }, apiKey: 'fixture',
      fetchImpl: (_url, init) => chat(`fixt-tool-${++nextKey}`, JSON.parse(init.body)) })
    async function translated(body) {
      const result = []
      for await (const event of readSSE((await adapter.request(body)).body)) result.push(event)
      return result
    }
    const request = { messages: [{ role: 'user', content: 'synthetic check' }], max_tokens: 64 }
    const forced = await translated({ ...request, tools: [{ type: 'function', function: { name: 'echo', parameters: { type: 'object' } } }], tool_choice: { type: 'function', function: { name: 'echo' } } })
    const call = forced.at(-1).choices[0].delta.tool_calls[0]
    assert.equal(call.function.name, 'echo')
    const completed = await translated({ ...request, messages: [...request.messages,
      { role: 'assistant', content: '', tool_calls: [call] }, { role: 'tool', tool_call_id: call.id, content: 'currency-ok' }] })
    assert.equal(completed[0].choices[0].delta.content, 'currency-ok')
    const current = balances()
    assert.deepEqual(current[0], cny)
    assert(current[1].spent_micros > 0)
    assert.equal(current[1].reserved_micros, 0)
    const account = await (await api.account(new Request('https://gateway.fixture/api/account', { headers }))).json()
    assert.equal(account.quota.currency, 'CNY')
    assert.deepEqual(account.quotas.map(item => item.currency).sort(), ['CNY', 'USD'])
    const usageUrl = `https://gateway.fixture/api/usage/summary?to=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`
    const usage = await (await api.usage(new Request(usageUrl, { headers }))).json()
    assert.equal(usage.totals.confirmed_micros, cny.spent_micros)
    assert.deepEqual(usage.byCurrency.map(item => [item.currency, item.confirmed_micros]).sort(), current.map(item => [item.currency, item.spent_micros]))
    assert.deepEqual(usage.byModel.filter(item => item.model_id === 'gpt-6.1-sol').map(item => item.currency).sort(), ['CNY', 'USD'])
    assert.equal(sql.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), [])
    console.log('PASS: single USD grant, historical CNY prices and settlement, seven native USD prices, tool round-trip, and separate wallet/usage totals')
  } finally {
    globalThis.fetch = originalFetch
    delete globalThis.__currencyFixtureEnv
    sql.close()
    fs.rmSync(path.join(tmp, 'routes.cjs'), { force: true })
    fs.rmdirSync(tmp)
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
