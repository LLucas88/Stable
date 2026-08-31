'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { CloudAccountService, DEVICE_TOKEN_KEY } = require('../desktop/services/cloud-account.cjs')

function context(routes, savedToken = '') {
  const settings = new Map(); const secrets = new Map(savedToken ? [[DEVICE_TOKEN_KEY, savedToken]] : [])
  const requests = []
  const service = new CloudAccountService({
    store: { getSetting: (key) => settings.get(key), setSetting: (key, value) => settings.set(key, value) },
    secrets: { get: (key) => secrets.get(key) || '', set: (key, value) => secrets.set(key, value), remove: (key) => secrets.delete(key) },
    appVersion: '0.9.39', baseURL: 'https://stable.example.com',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      const route = routes[new URL(url).pathname]
      if (!route) return Response.json({ error: { message: 'missing' } }, { status: 404 })
      const result = typeof route === 'function' ? await route(options) : route
      return Response.json(result.body ?? result, { status: result.status || 200 })
    },
  })
  return { service, settings, secrets, requests }
}

test('login stores only the device token and loads account, quota, models, and usage', async () => {
  const account = { id: 'acc_1', username: 'member', displayName: '成员', role: 'member', status: 'active', mustChangePassword: false }
  const quota = { id: 'quota_1', currency: 'CNY', limitMicros: 10_000_000, spentMicros: 2_000_000, reservedMicros: 0, remainingMicros: 8_000_000, periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }
  const ctx = context({
    '/api/auth/login': { account, quota, device_token: 'device-secret' },
    '/api/account': { account, quota },
    '/v1/models': { object: 'list', data: [{ id: 'model-a', display_name: 'Model A' }] },
    '/api/usage/summary': { totals: { request_count: 2, actual_micros: 2_000_000 }, byModel: [] },
  })
  const state = await ctx.service.login(' member ', 'password')
  assert.equal(ctx.secrets.get(DEVICE_TOKEN_KEY), 'device-secret')
  assert.equal(state.status, 'authenticated')
  assert.equal(state.models[0].id, 'model-a')
  assert.equal(state.usage.totals.request_count, 2)
  const loginBody = JSON.parse(ctx.requests[0].options.body)
  assert.equal(loginBody.username, 'member')
  assert.equal(loginBody.device.appVersion, '0.9.39')
  assert.equal(ctx.requests[1].options.headers.authorization, 'Bearer device-secret')
})

test('temporary password blocks model access until password change rotates the token', async () => {
  const temporary = { id: 'acc_1', username: 'member', displayName: '成员', role: 'member', status: 'active', mustChangePassword: true }
  const changed = { ...temporary, mustChangePassword: false }
  let account = temporary
  const ctx = context({
    '/api/auth/login': { account: temporary, quota: null, device_token: 'temporary-token' },
    '/api/auth/change-password': { device_token: 'rotated-token' },
    '/api/account': () => ({ account, quota: null }),
    '/v1/models': { object: 'list', data: [] },
    '/api/usage/summary': { totals: {}, byModel: [] },
  })
  assert.equal((await ctx.service.login('member', 'temporary')).status, 'password_change_required')
  account = changed
  assert.equal((await ctx.service.changePassword('temporary', 'new-password-value')).status, 'authenticated')
  assert.equal(ctx.secrets.get(DEVICE_TOKEN_KEY), 'rotated-token')
})

test('restore clears rejected sessions but preserves a retryable network state', async () => {
  const rejected = context({ '/api/account': { status: 401, body: { error: { message: 'expired', code: 'invalid_session' } } } }, 'expired')
  assert.equal((await rejected.service.restore()).status, 'signed_out')
  assert.equal(rejected.secrets.has(DEVICE_TOKEN_KEY), false)

  const offline = context({ '/api/account': () => { throw new Error('offline') } }, 'saved')
  assert.equal((await offline.service.restore()).status, 'unavailable')
  assert.equal(offline.secrets.get(DEVICE_TOKEN_KEY), 'saved')
})
