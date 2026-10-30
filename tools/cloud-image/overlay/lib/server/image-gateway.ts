import { authenticateRequest } from './auth';
import { assertAllowedUpstream, getD1 } from './env';
import { getModelSnapshot, resolveProviderKey } from './model-catalog';
import { AppError, noStoreJson, readJson } from './http';
import { canonicalJson } from '../core/gateway';
import { sha256 } from './crypto';
import { markInflight, markUncertain, releaseRequest, reserveRequest } from './quota';
import { upstreamError } from '../core/upstream-error';

type ImageRequest = { id: string; request_fingerprint: string; state: string; response_json: string | null };
async function previousImage(accountId: string, key: string) {
  return (await getD1()).prepare(`SELECT r.id, r.request_fingerprint, r.state, i.response_json FROM gateway_requests r LEFT JOIN gateway_image_results i ON i.request_id = r.id WHERE r.account_id = ? AND r.idempotency_key = ?`).bind(accountId, key).first<ImageRequest>();
}
function pending() { return noStoreJson({ task_status: 'PROCESSING' }, { status: 202, headers: { 'Retry-After': '3' } }); }
async function resumeImage(previous: ImageRequest, accountId: string, key: string) {
  if (previous.state === 'settled' && previous.response_json) return noStoreJson(JSON.parse(previous.response_json));
  if (previous.state === 'released') throw new AppError(422, 'image_generation_failed', '此前生图已明确失败，预留额度已释放；不会自动重新生成。');
  const db = await getD1();
  const job = await db.prepare('SELECT * FROM gateway_image_jobs WHERE request_id=?').bind(previous.id).first<{ task_id: string; model_json: string; image_micros: number; billing_json: string }>();
  if (!job || previous.state !== 'inflight') throw new AppError(409, 'image_result_pending', '此前生图结果未知且没有可恢复任务编号，已阻止重复生成，请联系管理员核对。');
  const model = JSON.parse(job.model_json);
  const base = assertAllowedUpstream(model.upstreamBaseUrl);
  if (base.href.replace(/\/$/, '') !== 'https://open.bigmodel.cn/api/paas/v4') throw new AppError(503, 'image_not_configured', '生图恢复地址无效。');
  let data;
  try {
    const response = await fetch(base.href.replace(/\/$/, '') + '/async-result/' + encodeURIComponent(job.task_id), { redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${resolveProviderKey(model)}` } });
    if (!response.ok) { await response.body?.cancel(); throw Error('poll_failed'); }
    data = await limitedJson(response);
  } catch { throw new AppError(503, 'image_poll_unavailable', '暂时无法查询生图结果；任务已保留，恢复只查询原任务，不重新扣费生成。'); }
  if (data?.task_status === 'PROCESSING') return pending();
  if (data?.task_status === 'FAIL') {
    const now = Date.now();
    await db.prepare(`UPDATE gateway_requests SET state='released', failure_code='image_generation_failed', completed_at=?, updated_at=? WHERE id=? AND state='inflight'`).bind(now, now, previous.id).run();
    const latest = await previousImage(accountId, key);
    if (latest?.state === 'settled' && latest.response_json) return noStoreJson(JSON.parse(latest.response_json));
    throw new AppError(422, 'image_generation_failed', '供应商确认生图失败，预留额度已释放；未自动重新生成。');
  }
  let result;
  try {
    const image = new URL(data?.image_result?.[0]?.url);
    if (data.task_status !== 'SUCCESS' || data.image_result.length !== 1 || image.protocol !== 'https:' || image.username || image.password) throw Error('invalid_image');
    result = { created: Math.floor(Date.now() / 1000), data: [{ url: image.href }] };
  } catch { throw new AppError(503, 'image_poll_unavailable', '生图结果暂时无法确认；已保留原任务，不重新生成。'); }
  const now = Date.now();
  try {
    await db.batch([
      db.prepare('INSERT INTO gateway_image_results(request_id,response_json,created_at) VALUES (?,?,?)').bind(previous.id, JSON.stringify(result), now),
      db.prepare(`UPDATE gateway_requests SET state='settled', actual_micros=?, billing_snapshot_json=?, completed_at=?, updated_at=? WHERE id=? AND state='inflight'`).bind(job.image_micros, job.billing_json, now, now, previous.id),
    ]);
  } catch (error) {
    // Two pollers may complete together. Only the first transaction settles.
    const latest = await previousImage(accountId, key);
    if (latest?.state === 'settled' && latest.response_json) return noStoreJson(JSON.parse(latest.response_json));
    throw error;
  }
  return noStoreJson(result);
}

function invalid(message: string): never { throw new AppError(400, 'invalid_image_request', message); }
function imageBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('生图请求必须是对象。');
  const b = value as Record<string, unknown>;
  if (Object.keys(b).some(k => !['model', 'prompt', 'size', 'quality'].includes(k)) || b.model !== 'glm-image' || b.quality !== 'hd') invalid('仅支持 GLM-image 单张高清生图。');
  if (typeof b.prompt !== 'string' || !b.prompt.trim() || [...b.prompt].length > 1000) invalid('图片描述需要 1–1000 字符。');
  const size = typeof b.size === 'string' && /^(\d{3,4})x(\d{3,4})$/.exec(b.size);
  if (!size || size.slice(1).some(v => Number(v) < 512 || Number(v) > 2048 || Number(v) % 32)) invalid('图片尺寸需要 512–2048 且为 32 的倍数。');
  return { model: 'glm-image', prompt: b.prompt.trim(), size: b.size as string, quality: 'hd' };
}
async function limitedJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) throw Error('invalid_response');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > 1_048_576) throw Error('response_too_large'); parts.push(result.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function handleImageGeneration(request: Request) {
  const auth = await authenticateRequest(request);
  const body = imageBody(await readJson(request, 32_768));
  const key = request.headers.get('idempotency-key') || '';
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) invalid('需要有效的 Idempotency-Key。');
  const db = await getD1(); const fingerprint = await sha256(canonicalJson(body));
  const previous = await previousImage(auth.account.id, key);
  if (previous) {
    if (previous.request_fingerprint !== fingerprint) throw new AppError(409, 'idempotency_conflict', '相同请求标识不能对应不同生图参数。');
    return resumeImage(previous, auth.account.id, key);
  }
  const model = await getModelSnapshot('glm-image');
  const price = await db.prepare('SELECT image_micros FROM image_prices WHERE price_version_id = ?').bind(model.priceVersionId).first<{ image_micros: number }>();
  if (!price || !Number.isSafeInteger(price.image_micros) || price.image_micros < 0) throw new AppError(503, 'image_price_missing', '云端生图尚未配置有效的每张价格，请联系管理员。');
  const asynchronous = request.headers.get('prefer') === 'respond-async';
  let url: URL, providerKey: string;
  try {
    const base = assertAllowedUpstream(model.upstreamBaseUrl);
    if (base.href.replace(/\/$/, '') !== 'https://open.bigmodel.cn/api/paas/v4' || model.upstreamModel !== 'glm-image') throw Error('invalid_image_provider');
    url = new URL(base.href.replace(/\/$/, '') + (asynchronous ? '/async/images/generations' : '/images/generations')); providerKey = resolveProviderKey(model);
  } catch { throw new AppError(503, 'image_not_configured', '云端 GLM-image 凭据或服务地址未配置。'); }
  const reservation = await reserveRequest({ auth, model, body, idempotencyKey: key, estimate: { inputUpperBoundTokens: 0, maxOutputTokens: 0, reservedMicros: price.image_micros } });
  if (request.signal.aborted) { await releaseRequest(reservation, 'client_aborted_before_upstream'); throw new AppError(499, 'client_closed_request', '请求已取消。'); }
  await markInflight(reservation);
  // After submission, finish saving the result even if the desktop disconnects.
  // A lost response can then be replayed by key without a second paid request.
  let response: Response;
  try { response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(asynchronous ? 30_000 : 180_000), headers: { authorization: `Bearer ${providerKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { await markUncertain(reservation, 'image_upstream_network'); throw new AppError(502, 'image_result_unknown', '生图提交结果未知，已保留请求记录，请勿重新生成。'); }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 400 && response.status < 500) await releaseRequest(reservation, `upstream_${response.status}`);
    else await markUncertain(reservation, `upstream_${response.status}`);
    const error = upstreamError(response.status); throw new AppError(error.status, error.code, error.message);
  }
  const billing = JSON.stringify({ version: 1, kind: 'image', count: 1, imageMicros: price.image_micros, actualMicros: price.image_micros, priceVersionId: model.priceVersionId, currency: model.currency });
  if (asynchronous) {
    let task;
    try {
      task = await limitedJson(response);
      if (typeof task?.id !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(task.id)) throw Error('invalid_task');
      await db.prepare('INSERT INTO gateway_image_jobs(request_id,task_id,model_json,image_micros,billing_json,created_at) VALUES (?,?,?,?,?,?)').bind(reservation.id, task.id, JSON.stringify(model), price.image_micros, billing, Date.now()).run();
    } catch { await markUncertain(reservation, 'image_task_not_saved'); throw new AppError(502, 'image_result_unknown', '生图任务编号无法确认或保存，已阻止重复生成，请联系管理员核对。'); }
    return pending();
  }
  let result: { created: number; data: { url: string }[] };
  try {
    const data = await limitedJson(response); const image = new URL(data?.data?.[0]?.url);
    if (image.protocol !== 'https:' || image.username || image.password || data.data.length !== 1) throw Error('invalid_image');
    result = { created: Math.floor(Date.now() / 1000), data: [{ url: image.href }] };
  } catch { await markUncertain(reservation, 'image_invalid_response'); throw new AppError(502, 'image_invalid_response', '生图响应无法确认，已保留请求记录，请勿重复提交。'); }
  const now = Date.now();
  // D1 batch/SQLite adapter transact both writes together. Existing quota ledger
  // triggers settle the reservation exactly once; no fake token usage is stored.
  await db.batch([
    db.prepare('INSERT INTO gateway_image_results(request_id,response_json,created_at) VALUES (?,?,?)').bind(reservation.id, JSON.stringify(result), now),
    db.prepare(`UPDATE gateway_requests SET state='settled', actual_micros=?, billing_snapshot_json=?, completed_at=?, updated_at=? WHERE id=? AND state='inflight'`).bind(price.image_micros, billing, now, now, reservation.id),
  ]);
  return noStoreJson(result);
}
