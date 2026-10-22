import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { ISSUER, API, transaction, authorizationURL, callbackResult, verifyTokens, modelCatalog,
  readCompletion, invoke, safeError, discover, jsonRequest, exchangeCode } from './lib.mjs';

function callback(tx, params = {}) {
  return new URL('http://127.0.0.1:12345/auth/callback?' + new URLSearchParams({ state: tx.state, code: 'code', client_id: 'oaiapp_test', ...params }));
}
function stream(events, crlf = false) {
  const bytes = new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}${crlf ? '\r\n\r\n' : '\n\n'}`).join(''));
  return new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } });
}
test('fresh state, nonce and S256 PKCE; returning registration stays stable', () => {
  const tx = transaction(); tx.redirectUri = 'http://127.0.0.1:54321/auth/callback';
  const p = new URL(authorizationURL(tx, 'urn:uuid:test')).searchParams;
  assert.equal(p.get('code_challenge'), createHash('sha256').update(tx.verifier).digest('base64url'));
  assert.equal(p.get('client_id'), 'dynamic_agent_client'); assert.equal(p.get('agent_name_hint'), 'Stable');
  assert.equal(p.get('resource'), API); assert.equal(p.get('redirect_uri'), tx.redirectUri);
  assert.notEqual(tx.state, transaction().state); assert.notEqual(tx.nonce, tx.state);
  const returning = new URL(authorizationURL({ ...tx, clientId: 'oaiapp_saved' }, 'urn:uuid:test'));
  assert.equal(returning.searchParams.get('client_id'), 'oaiapp_saved'); assert.equal(returning.searchParams.has('agent_name_hint'), false);
});
test('callback rejects wrong state, duplicate values, expired and reused transactions', () => {
  const tx = transaction();
  assert.throws(() => callbackResult(callback(tx, { state: 'wrong' }), tx), /STATE_MISMATCH/);
  const duplicate = callback(tx); duplicate.searchParams.append('state', tx.state);
  assert.throws(() => callbackResult(duplicate, tx), /DUPLICATE/);
  assert.equal(tx.consumed, false);
  assert.equal(callbackResult(callback(tx), tx).clientId, 'oaiapp_test');
  assert.throws(() => callbackResult(callback(tx), tx), /REUSED/);
  const old = transaction(); old.expiresAt = 0;
  assert.throws(() => callbackResult(callback(old), old), /EXPIRED/);
});
test('callback rejects consent denial, missing registration and account registration replacement', () => {
  const denied = transaction(); assert.throws(() => callbackResult(callback(denied, { error: 'access_denied' }), denied), /access_denied/);
  const missing = transaction(); assert.throws(() => callbackResult(callback(missing, { client_id: 'dynamic_agent_client' }), missing), /REGISTRATION_MISSING/);
  const changed = transaction('oaiapp_saved'); assert.throws(() => callbackResult(callback(changed), changed), /REGISTRATION_MISMATCH/);
  const same = transaction('oaiapp_saved'); const url = callback(same); url.searchParams.delete('client_id');
  assert.equal(callbackResult(url, same).clientId, 'oaiapp_saved');
});
test('code exchange uses exact callback and issued client, never a secret or API key', async () => {
  const tx = transaction(); tx.redirectUri = 'http://127.0.0.1:54321/auth/callback';
  await exchangeCode({ code: 'one-time-code', clientId: 'oaiapp_test' }, tx, async (url, init) => {
    assert.equal(url, `${ISSUER}/api/accounts/oauth/token`); assert.equal(init.redirect, 'error');
    assert.equal(init.body.get('redirect_uri'), tx.redirectUri); assert.equal(init.body.get('client_id'), 'oaiapp_test');
    assert.equal(init.body.get('code_verifier'), tx.verifier); assert.equal(init.body.has('client_secret'), false);
    return Response.json({});
  });
});
test('JWT signature, issuer, audience, nonce, expiry, subject and sharing permission are enforced', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = await exportJWK(publicKey); key.kid = 'test';
  const jwks = createLocalJWKSet({ keys: [key] }); const tx = transaction();
  async function tokens(overrides = {}) {
    const jwt = await new SignJWT({ nonce: tx.nonce, ...overrides.claims }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(overrides.issuer || ISSUER).setAudience(overrides.audience || 'oaiapp_test').setSubject('subject')
      .setIssuedAt().setExpirationTime(overrides.expiry || '2m').sign(privateKey);
    return { id_token: jwt, access_token: 'secret-token', token_type: 'Bearer', expires_in: 3600,
      scope: 'openid chatgpt.tokens.use.direct' };
  }
  const valid = await tokens();
  assert.equal((await verifyTokens(valid, tx, 'oaiapp_test', jwks)).subject, 'subject');
  for (const overrides of [{ issuer: 'https://evil.invalid' }, { audience: 'wrong' }, { claims: { nonce: 'wrong' } }, { expiry: '-1h' }]) {
    await assert.rejects(verifyTokens(await tokens(overrides), tx, 'oaiapp_test', jwks));
  }
  await assert.rejects(verifyTokens({ ...valid, id_token: valid.id_token.slice(0, -12) + 'bad-signature' }, tx, 'oaiapp_test', jwks));
  await assert.rejects(verifyTokens(valid, tx, 'oaiapp_test', jwks, 'other-account'), /ACCOUNT_MISMATCH/);
  await assert.rejects(verifyTokens({ ...valid, scope: 'openid' }, tx, 'oaiapp_test', jwks), /PLAN_USAGE_NOT_AUTHORIZED/);
});
test('discovery rejects unexpected issuer or endpoint before using JWKS', async () => {
  await assert.rejects(discover(async () => Response.json({ issuer: 'https://evil.invalid' })), /UNEXPECTED_DISCOVERY/);
});
test('catalog only exposes visible models and rejects ordinary API catalogs', () => {
  assert.deepEqual(modelCatalog({ models: [{ slug: 'a', display_name: 'A', visibility: 'list' }, { slug: 'hidden' }] }), [{ slug: 'a', displayName: 'A' }]);
  assert.throws(() => modelCatalog({ data: [{ id: 'a' }] }), /INVALID_MODEL/);
  assert.throws(() => modelCatalog({ models: [] }), /NO_AVAILABLE/);
});
test('SSE handles arbitrary Unicode chunks, CRLF and completed events', async () => {
  const result = await readCompletion(stream([{ type: 'response.output_text.delta', delta: '中文 OK' }, { type: 'response.completed', response: { status: 'completed' } }], true));
  assert.deepEqual(result, { text: '中文 OK', completed: true });
});
test('partial, failed, incomplete and empty streams cannot pass', async () => {
  const delta = { type: 'response.output_text.delta', delta: 'partial' };
  await assert.rejects(readCompletion(stream([delta])), /WITHOUT_COMPLETION/);
  await assert.rejects(readCompletion(stream([delta, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])), /usage_limit_exceeded/);
  await assert.rejects(readCompletion(stream([delta, { type: 'response.incomplete' }])), /INCOMPLETE/);
  await assert.rejects(readCompletion(stream([{ type: 'response.completed' }])), /EMPTY_MODEL_OUTPUT/);
});
test('single inference uses OAuth Responses contract and reports completion', async () => {
  let calls = 0;
  const result = await invoke('test-token', 'account-model', async (url, init) => {
    calls++; assert.equal(url, `${API}/responses`); assert.equal(init.headers.Authorization, 'Bearer test-token');
    const body = JSON.parse(init.body); assert.equal(body.stream, true); assert.equal(body.store, false);
    assert.equal(body.model, 'account-model'); assert.equal('max_output_tokens' in body, false);
    return new Response(stream([{ type: 'response.output_text.delta', delta: 'STABLE_SIWC_OK' }, { type: 'response.completed' }]));
  });
  assert.equal(calls, 1); assert.equal(result.text, 'STABLE_SIWC_OK');
});
test('HTTP and unknown errors never expose raw credentials or retry billable calls', async () => {
  let calls = 0;
  await assert.rejects(invoke('secret', 'model', async () => { calls++; return new Response('secret=do-not-log', { status: 520 }); }), error => {
    assert.deepEqual(safeError(error), { code: 'UPSTREAM_NON_JSON_ERROR', httpStatus: 520 }); return true;
  });
  assert.equal(calls, 1); assert.deepEqual(safeError(new Error('secret-token')), { code: 'LOCAL_OR_NETWORK_ERROR' });
});
test('JSON decoder preserves multibyte text across chunks', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ text: '中文' }));
  const body = new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } });
  assert.deepEqual(await jsonRequest('https://test.invalid', {}, async () => new Response(body)), { text: '中文' });
});
