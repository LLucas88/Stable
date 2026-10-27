import { authenticateRequest } from './auth';
import { assertAllowedUpstream, getD1 } from './env';
import { getModelSnapshot, resolveProviderKey } from './model-catalog';
import { AppError, noStoreJson, readJson } from './http';
import { canonicalJson } from '../core/gateway';
import { sha256 } from './crypto';
import { markInflight, markUncertain, releaseRequest, reserveRequest } from './quota';
import { BlockList, isIP } from 'node:net';

type Operation = 'search' | 'fetch';
const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',3]] as const) blocked.addSubnet(ip, bits, 'ipv4');
for (const [ip, bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]] as const) blocked.addSubnet(ip, bits, 'ipv6');
function invalid(message: string): never { throw new AppError(400, 'invalid_web_request', message); }
function publicURL(value: unknown) {
  if (typeof value !== 'string' || value.length > 8192) invalid('仅支持最多8192字符的公开网页 URL。');
  let url: URL; try { url = new URL(value); } catch { return invalid('网页 URL 无效。'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase(), family = isIP(host);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !host.includes('.') && !family || /(?:^|\.)(?:localhost|local|internal|lan)$/.test(host) || family && (blocked.check(host, family === 6 ? 'ipv6' : 'ipv4') || host.includes('::ffff:'))) invalid('不允许本机、内网或包含账号密码的 URL。');
  return url.href;
}
function requestBody(operation: Operation, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('请求必须是对象。');
  const b = value as Record<string, unknown>;
  if (operation === 'fetch') {
    if (Object.keys(b).some(k => k !== 'url')) invalid('抓取仅接受 url。');
    return { url: publicURL(b.url) };
  }
  if (Object.keys(b).some(k => !['query', 'count', 'need_content'].includes(k))) invalid('搜索参数不受支持。');
  if (typeof b.query !== 'string' || !b.query.trim() || [...b.query.trim()].length > 128) invalid('搜索关键词需要 1–128 个字符。');
  const count = b.count ?? 10;
  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 50) invalid('count 需要 1–50 的整数。');
  if (b.need_content !== undefined && typeof b.need_content !== 'boolean') invalid('need_content 必须为布尔值。');
  return { query: b.query.trim(), count, need_content: b.need_content ?? false };
}
async function responseJSON(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) { await response.body?.cancel(); throw Error('invalid_response'); }
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; if (size > 4_194_304) throw Error('response_too_large'); parts.push(r.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { await reader.cancel().catch(() => {}); }
}
function resultBody(operation: Operation, data: Record<string, unknown>) {
  if (operation === 'fetch') {
    if (typeof data?.title !== 'string' || typeof data?.content !== 'string') throw Error('invalid_fetch_result');
    return { title: data.title, content: data.content };
  }
  if (!Array.isArray(data?.results) || data.results.length > 50) throw Error('invalid_search_result');
  return { results: data.results.map((item: Record<string, unknown>) => {
    if (!item || ['title','url','snippet','summary','content'].some(k => typeof item[k] !== 'string')) throw Error('invalid_search_item');
    return { title: item.title, url: item.url, snippet: item.snippet, summary: item.summary, content: item.content, ...(typeof item.date === 'string' ? { date: item.date } : {}) };
  }) };
}
function providerError(status: number): AppError {
  const messages: Record<number, [string, string]> = {
    400: ['web_invalid_request', 'DeepSeek 联网服务拒绝请求参数，请修改后再试。'],
    401: ['web_provider_authentication_failed', 'DeepSeek 联网服务凭据无效，请联系网关管理员。'],
    402: ['upstream_insufficient_balance', 'DeepSeek 联网服务供应商余额不足（HTTP 402）；这不是 Stable 账号额度不足，请联系网关管理员充值，勿重复请求。'],
    403: ['web_fetch_blocked', '网页抓取被供应商安全策略拒绝，请使用允许访问的公开网址。'],
    404: ['web_fetch_unavailable', '网页无可提取正文、站点不可访问或站点策略禁止抓取。'],
    429: ['web_rate_limited', 'DeepSeek 联网服务限流，请稍后重试。'],
  };
  const [code, message] = messages[status] || ['web_provider_error', `DeepSeek 联网服务暂时不可用（HTTP ${status}），本次未自动重试。`];
  return new AppError(status === 401 ? 502 : status >= 400 && status < 600 ? status : 502, code, message);
}
export async function handleWebTool(request: Request, operation: Operation) {
  const auth = await authenticateRequest(request);
  const body = requestBody(operation, await readJson(request, 32768));
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) invalid('需要有效 Idempotency-Key。');
  const db = await getD1(), fingerprintBody = { operation, ...body }, fingerprint = await sha256(canonicalJson(fingerprintBody));
  const old = await db.prepare('SELECT r.request_fingerprint,r.state,w.response_json FROM gateway_requests r LEFT JOIN gateway_web_results w ON w.request_id=r.id WHERE r.account_id=? AND r.idempotency_key=?').bind(auth.account.id, key).first<{ request_fingerprint: string; state: string; response_json: string | null }>();
  if (old) {
    if (old.request_fingerprint !== fingerprint) throw new AppError(409, 'idempotency_conflict', '相同请求标识不能对应不同联网请求。');
    if (old.state === 'settled' && old.response_json) return noStoreJson(JSON.parse(old.response_json));
    throw new AppError(409, 'web_result_pending', '此前请求已记录，当前结果不可恢复；本次不会重复调用。');
  }
  let model;
  try { model = await getModelSnapshot('deepseek-' + operation); }
  catch (error) { if (error instanceof AppError && error.status === 404) throw new AppError(503, 'web_not_configured', '网关尚未启用 DeepSeek 联网服务，请联系管理员。'); throw error; }
  const price = await db.prepare('SELECT request_micros FROM web_tool_prices WHERE price_version_id=?').bind(model.priceVersionId).first<{ request_micros: number }>();
  if (!price || !Number.isSafeInteger(price.request_micros) || price.request_micros < 0) throw new AppError(503, 'web_price_missing', '网关尚未配置联网服务的每次价格。');
  let providerKey: string;
  try {
    const base = assertAllowedUpstream(model.upstreamBaseUrl);
    if (base.href.replace(/\/$/, '') !== 'https://api.deepseek.com' || model.upstreamModel !== 'deepseek-' + operation) throw Error('wrong_web_provider');
    providerKey = resolveProviderKey(model);
  } catch { throw new AppError(503, 'web_not_configured', 'DeepSeek 联网服务地址或凭据未配置。'); }
  const reservation = await reserveRequest({ auth, model, body: fingerprintBody, idempotencyKey: key, estimate: { inputUpperBoundTokens: 0, maxOutputTokens: 0, reservedMicros: price.request_micros } });
  if (request.signal.aborted) { await releaseRequest(reservation, 'client_aborted_before_upstream'); throw new AppError(499, 'client_closed_request', '请求已取消。'); }
  await markInflight(reservation);
  // Complete settlement/recovery after submission even if the client disconnects.
  let response: Response;
  try { response = await fetch('https://api.deepseek.com/v1/tools/' + operation, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(120000), headers: { authorization: 'Bearer ' + providerKey, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { await markUncertain(reservation, 'web_upstream_network'); throw new AppError(502, 'web_result_unknown', '联网请求结果未知，已记录待核对，本次未自动重试。'); }
  if (!response.ok) {
    await response.body?.cancel();
    // Official Search/Fetch failed responses and timeouts are not billable.
    await releaseRequest(reservation, 'web_upstream_' + response.status);
    throw providerError(response.status);
  }
  let result: ReturnType<typeof resultBody>;
  try { result = resultBody(operation, await responseJSON(response)); }
  catch { await markUncertain(reservation, 'web_invalid_response'); throw new AppError(502, 'web_invalid_response', '联网响应无法确认，已记录待核对，本次未自动重试。'); }
  const billable = operation === 'search' ? Boolean(result.results?.length) : Boolean(result.content?.trim());
  const actual = billable ? price.request_micros : 0, now = Date.now();
  const snapshot = JSON.stringify({ version: 1, kind: 'web_' + operation, count: billable ? 1 : 0, requestMicros: price.request_micros, actualMicros: actual, priceVersionId: model.priceVersionId, currency: model.currency });
  await db.batch([
    db.prepare('INSERT INTO gateway_web_results(request_id,response_json,created_at) VALUES (?,?,?)').bind(reservation.id, JSON.stringify(result), now),
    db.prepare("UPDATE gateway_requests SET state='settled',actual_micros=?,billing_snapshot_json=?,completed_at=?,updated_at=? WHERE id=? AND state='inflight'").bind(actual, snapshot, now, now, reservation.id),
  ]);
  return noStoreJson(result);
}
