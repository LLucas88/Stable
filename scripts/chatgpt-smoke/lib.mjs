// Independently implemented from OpenAI's public SIWC protocol documentation.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';

export const ISSUER = 'https://auth.openai.com';
export const API = 'https://api.openai.com/v1';
export const TEST_PROMPT = 'Reply with exactly: STABLE_SIWC_OK';
const AUTH = `${ISSUER}/api/accounts/authorize`;
const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export class SmokeError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
const fail = code => { throw new SmokeError(code); };
// Do not surface upstream bodies, token strings, URLs or exception messages.
export function safeError(error) {
  return { code: error instanceof SmokeError ? error.code : 'LOCAL_OR_NETWORK_ERROR',
    ...(Number.isInteger(error?.status) ? { httpStatus: error.status } : {}) };
}
const knownErrors = new Set(['access_denied', 'invalid_grant', 'invalid_client',
  'subscription_sharing_user_not_eligible', 'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_usage_unavailable', 'subscription_sharing_unsupported_capability',
  'subscription_sharing_route_not_supported', 'subscription_sharing_invalid_user',
  'chatpass_v2_scope_not_authorized', 'chatpass_v2_invalid_authorization_context',
  'subscription_sharing_user_unavailable']);
export function upstreamError(body, status) {
  const code = typeof body?.error === 'string' ? body.error : body?.error?.code;
  return new SmokeError(knownErrors.has(code) ? code : 'UPSTREAM_REQUEST_FAILED', status);
}
export function transaction(clientId) {
  return { state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'), clientId, expiresAt: Date.now() + 600_000, consumed: false };
}
export function authorizationURL(tx, hostId) {
  const url = new URL(AUTH);
  url.search = new URLSearchParams({ client_id: tx.clientId || 'dynamic_agent_client',
    ...(!tx.clientId ? { agent_name_hint: 'Stable' } : {}), ext_agent_host_id: hostId,
    redirect_uri: tx.redirectUri, response_type: 'code', scope: SCOPE, resource: API,
    state: tx.state, nonce: tx.nonce, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(tx.verifier).digest('base64url') }).toString();
  return url.href;
}
export function callbackResult(url, tx) {
  if (tx.consumed || Date.now() >= tx.expiresAt) fail('CALLBACK_EXPIRED_OR_REUSED');
  for (const key of ['state', 'code', 'client_id', 'error']) {
    if (url.searchParams.getAll(key).length > 1) fail('CALLBACK_DUPLICATE_PARAMETER');
  }
  const state = Buffer.from(url.searchParams.get('state') || '');
  const expected = Buffer.from(tx.state);
  if (state.length !== expected.length || !timingSafeEqual(state, expected)) fail('CALLBACK_STATE_MISMATCH');
  tx.consumed = true;
  if (url.searchParams.has('error')) throw upstreamError({ error: url.searchParams.get('error') });
  const clientId = url.searchParams.get('client_id') || tx.clientId;
  if (!clientId || clientId === 'dynamic_agent_client' || clientId.length > 512 || /\s/.test(clientId)) fail('CLIENT_REGISTRATION_MISSING');
  if (tx.clientId && tx.clientId !== clientId) fail('CLIENT_REGISTRATION_MISMATCH');
  const code = url.searchParams.get('code');
  if (!code || code.length > 16384) fail('AUTHORIZATION_CODE_MISSING');
  return { code, clientId };
}
export async function jsonRequest(url, init = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, { ...init, redirect: 'error',
    signal: init.signal || AbortSignal.timeout(30_000) });
  let body;
  try {
    let text = ''; const decoder = new TextDecoder();
    for await (const bytes of response.body) {
      text += decoder.decode(bytes, { stream: true });
      if (text.length > 2_000_000) fail('RESPONSE_TOO_LARGE');
    }
    text += decoder.decode();
    body = JSON.parse(text);
  } catch (error) {
    if (!response.ok) throw new SmokeError('UPSTREAM_NON_JSON_ERROR', response.status);
    if (error instanceof SmokeError) throw error;
    fail('INVALID_JSON_RESPONSE');
  }
  if (!response.ok) throw upstreamError(body, response.status);
  return body;
}
export async function discover(fetchImpl = fetch) {
  const config = await jsonRequest(`${ISSUER}/.well-known/openid-configuration`, {}, fetchImpl);
  if (config.issuer !== ISSUER || config.authorization_endpoint !== AUTH || config.token_endpoint !== TOKEN) fail('UNEXPECTED_DISCOVERY_CONFIGURATION');
  const jwksURL = new URL(config.jwks_uri);
  if (jwksURL.origin !== ISSUER || jwksURL.username || jwksURL.password) fail('UNTRUSTED_JWKS_URL');
  const keys = await jsonRequest(jwksURL.href, {}, fetchImpl);
  return createLocalJWKSet(keys);
}
export async function verifyTokens(tokens, tx, clientId, jwks, expectedSubject) {
  if (typeof tokens?.id_token !== 'string' || typeof tokens?.access_token !== 'string' || !tokens.access_token ||
      tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) fail('INVALID_TOKEN_RESPONSE');
  let identity;
  try {
    ({ payload: identity } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'exp', 'iat', 'nonce'], clockTolerance: 5,
    }));
  } catch { fail('ID_TOKEN_VALIDATION_FAILED'); }
  if (identity.nonce !== tx.nonce || typeof identity.sub !== 'string' || !identity.sub) fail('ID_TOKEN_IDENTITY_MISMATCH');
  if ((Array.isArray(identity.aud) && identity.aud.length > 1 && identity.azp !== clientId) ||
      (identity.azp !== undefined && identity.azp !== clientId)) fail('ID_TOKEN_AUTHORIZED_PARTY_MISMATCH');
  if (expectedSubject && identity.sub !== expectedSubject) fail('ACCOUNT_MISMATCH');
  if (!String(tokens.scope || '').split(/\s+/).includes('chatgpt.tokens.use.direct')) fail('PLAN_USAGE_NOT_AUTHORIZED');
  return { accessToken: tokens.access_token, subject: identity.sub };
}
export async function exchangeCode(result, tx, fetchImpl = fetch) {
  return jsonRequest(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: result.clientId,
      code: result.code, code_verifier: tx.verifier, redirect_uri: tx.redirectUri, resource: API }) }, fetchImpl);
}
export function modelCatalog(body) {
  if (!Array.isArray(body?.models)) fail('INVALID_MODEL_CATALOG');
  const models = body.models.filter(m => m?.visibility === 'list' && typeof m.slug === 'string' && m.slug.length > 0)
    .map(m => ({ slug: m.slug, displayName: typeof m.display_name === 'string' ? m.display_name : m.slug }));
  if (!models.length) fail('NO_AVAILABLE_MODELS');
  return models;
}
export async function listModels(accessToken, fetchImpl = fetch) {
  return modelCatalog(await jsonRequest(`${API}/models`, { headers: { Authorization: `Bearer ${accessToken}` } }, fetchImpl));
}
export async function readCompletion(body) {
  if (!body) fail('EMPTY_RESPONSE_STREAM');
  const decoder = new TextDecoder();
  let buffer = '', text = '', completed = false;
  function consume(block) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { fail('INVALID_STREAM_EVENT'); }
    if (event.type === 'response.failed') throw upstreamError(event.response);
    if (event.type === 'error') throw upstreamError({ error: event });
    if (event.type === 'response.incomplete') fail('RESPONSE_INCOMPLETE');
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
    if (text.length > 16_384) fail('TEST_OUTPUT_TOO_LARGE');
    if (event.type === 'response.completed') {
      if (event.response?.status && event.response.status !== 'completed') fail('RESPONSE_NOT_COMPLETED');
      completed = true;
    }
  }
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 2_000_000) fail('STREAM_EVENT_TOO_LARGE');
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      consume(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  if (!completed) fail('STREAM_ENDED_WITHOUT_COMPLETION');
  if (!text.trim()) fail('EMPTY_MODEL_OUTPUT');
  return { text, completed };
}
export async function invoke(accessToken, model, fetchImpl = fetch) {
  const response = await fetchImpl(`${API}/responses`, { method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(90_000), headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: TEST_PROMPT }], store: false, stream: true }) });
  if (!response.ok) {
    // Read bounded errors without ever exposing their raw bodies.
    await jsonRequest(`${API}/responses`, {}, async () => response);
  }
  return readCompletion(response.body);
}
