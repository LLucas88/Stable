import { safeImageDiagnostic } from '../core/image-diagnostic';
import {
  calculateActualCostMicros,
  canonicalJson,
  type ReservationEstimate,
  type Usage,
} from '@/lib/core/gateway';
import { d1MutationApplied } from '@/lib/core/d1-result';
import { resolvePrice } from '@/lib/core/pricing';

import type { AuthContext } from './auth';
import { createId, sha256 } from './crypto';
import { getD1 } from './env';
import { AppError } from './http';
import type { ModelSnapshot } from './model-catalog';

export type ReservedRequest = {
  id: string;
  accountId: string;
  quotaBucketId: string;
  model: ModelSnapshot;
  idempotencyKey: string;
  requestFingerprint: string;
  reservedMicros: number;
  maxOutputTokens: number;
};

export async function reserveRequest({
  auth,
  model,
  body,
  idempotencyKey,
  estimate,
}: {
  auth: AuthContext;
  model: ModelSnapshot;
  body: Record<string, unknown>;
  idempotencyKey: string;
  estimate: ReservationEstimate;
}): Promise<ReservedRequest> {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new AppError(
      400,
      'invalid_idempotency_key',
      'Idempotency-Key 必须是 8–128 位安全字符。',
      'invalid_request_error',
    );
  }
  const now = Date.now();
  const quota = await (await getD1())
    .prepare(
      `SELECT id, currency FROM quota_buckets
       WHERE account_id = ? AND status = 'active'
         AND period_start <= ? AND period_end > ?
       ORDER BY period_start DESC LIMIT 1`,
    )
    .bind(auth.account.id, now, now)
    .first<{ id: string; currency: string }>();
  if (!quota || quota.currency !== model.currency) {
    throw new AppError(
      429,
      'insufficient_quota',
      '账号没有可用额度。',
      'quota_error',
    );
  }
  const requestFingerprint = await sha256(canonicalJson(body));
  const requestId = createId('req');

  try {
    await (await getD1())
      .prepare(
        `INSERT INTO gateway_requests (
          id, account_id, quota_bucket_id, model_id, price_version_id,
          idempotency_key, request_fingerprint, state, reserved_micros,
          actual_micros, created_at, updated_at, pricing_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?, 0, ?, ?, ?)`,
      )
      .bind(
        requestId,
        auth.account.id,
        quota.id,
        model.id,
        model.priceVersionId,
        idempotencyKey,
        requestFingerprint,
        estimate.reservedMicros,
        now,
        now,
        model.pricingAt,
      )
      .run();
  } catch (error) {
    const message = String(error);
    if (message.includes('quota_exceeded')) {
      throw new AppError(
        429,
        'insufficient_quota',
        '账号额度不足。',
        'quota_error',
      );
    }
    if (
      message.includes('uidx_gateway_account_idempotency') ||
      message.includes(
        'gateway_requests.account_id, gateway_requests.idempotency_key',
      )
    ) {
      const existing = await (await getD1())
        .prepare(
          `SELECT id, request_fingerprint, state
           FROM gateway_requests
           WHERE account_id = ? AND idempotency_key = ? LIMIT 1`,
        )
        .bind(auth.account.id, idempotencyKey)
        .first<{ id: string; request_fingerprint: string; state: string }>();
      if (existing?.request_fingerprint !== requestFingerprint) {
        throw new AppError(
          409,
          'idempotency_conflict',
          '相同 Idempotency-Key 对应了不同请求。',
          'invalid_request_error',
        );
      }
      throw new AppError(
        409,
        'idempotent_replay',
        `该请求已经存在，当前状态：${existing?.state ?? 'unknown'}。`,
        'invalid_request_error',
      );
    }
    throw error;
  }

  return {
    id: requestId,
    accountId: auth.account.id,
    quotaBucketId: quota.id,
    model,
    idempotencyKey,
    requestFingerprint,
    reservedMicros: estimate.reservedMicros,
    maxOutputTokens: estimate.maxOutputTokens,
  };
}

export async function markInflight(reservation: ReservedRequest) {
  const now = Date.now();
  const result = await (await getD1())
    .prepare(
      `UPDATE gateway_requests
       SET state = 'inflight', started_at = ?, updated_at = ?
       WHERE id = ? AND state = 'reserved'`,
    )
    .bind(now, now, reservation.id)
    .run();
  assertD1MutationApplied(result, 'request_not_reserved');
}

export async function settleRequest(
  reservation: ReservedRequest,
  usage: Usage,
  upstreamRequestId?: string,
) {
  const actualMicros = calculateActualCostMicros(usage, reservation.model);
  const billingSnapshot = JSON.stringify({
    version: 1, priceVersionId: reservation.model.priceVersionId,
    currency: reservation.model.currency, pricingAt: reservation.model.pricingAt,
    timeBasis: 'gateway_model_admission',
    rates: resolvePrice(usage, reservation.model),
    cachedPromptTokens: usage.cachedPromptTokens ?? null,
      cacheWrite30mTokens: usage.cacheWrite30mTokens ?? 0, cacheWrite12hTokens: usage.cacheWrite12hTokens ?? 0,
    cacheUsageReported: usage.cachedPromptTokens !== undefined,
    inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, actualMicros,
  });
  const now = Date.now();
  const result = await (await getD1())
    .prepare(
      `UPDATE gateway_requests
       SET state = 'settled', actual_micros = ?, prompt_tokens = ?,
           completion_tokens = ?, upstream_request_id = ?,
           failure_code = ?,
           completed_at = ?, updated_at = ?, cached_prompt_tokens = ?, billing_snapshot_json = ?
       WHERE id = ? AND state = 'inflight'`,
    )
    .bind(
      actualMicros,
      usage.promptTokens,
      usage.completionTokens,
      upstreamRequestId ?? null,
      actualMicros > reservation.reservedMicros
        ? 'actual_exceeded_reservation'
        : null,
      now,
      now,
      usage.cachedPromptTokens ?? null,
      billingSnapshot,
      reservation.id,
    )
    .run();
  assertD1MutationApplied(result, 'request_not_inflight');
  return actualMicros;
}

export async function releaseRequest(
  reservation: ReservedRequest,
  failureCode: string,
) {
  const now = Date.now();
  const result = await (await getD1())
    .prepare(
      `UPDATE gateway_requests
       SET state = 'released', failure_code = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND state IN ('reserved', 'inflight')`,
    )
    .bind(failureCode, now, now, reservation.id)
    .run();
  assertD1MutationApplied(result, 'request_not_releasable');
}

export async function markUncertain(
  reservation: ReservedRequest,
  failureCode: string,
) {
  const now = Date.now();
  const result = await (await getD1())
    .prepare(
      `UPDATE gateway_requests
       SET state = 'uncertain', actual_micros = reserved_micros,
           failure_code = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND state = 'inflight'`,
    )
    .bind(failureCode, now, now, reservation.id)
    .run();
  assertD1MutationApplied(result, 'request_not_inflight');
}

export async function getUsageSummary(
  accountId: string,
  from: number,
  to: number,
) {
  const db = await getD1();
  const [totals, byModel] = await Promise.all([
    db
      .prepare(
        `SELECT
          COUNT(*) AS request_count,
          SUM(CASE WHEN state = 'settled' THEN 1 ELSE 0 END) AS settled_count,
          SUM(CASE WHEN state IN ('released', 'uncertain') THEN 1 ELSE 0 END) AS exception_count,
          COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
          SUM(CASE
            WHEN prompt_tokens IS NULL OR completion_tokens IS NULL THEN 1
            ELSE 0
          END) AS usage_unknown_count,
          COALESCE(SUM(CASE WHEN state IN ('settled','reconciled') THEN actual_micros ELSE 0 END),0) AS confirmed_micros,
          COALESCE(SUM(CASE WHEN state='uncertain' THEN actual_micros ELSE 0 END),0) AS uncertain_micros,
          COALESCE(SUM(actual_micros), 0) AS actual_micros
        FROM gateway_requests
        WHERE account_id = ? AND created_at >= ? AND created_at < ?`,
      )
      .bind(accountId, from, to)
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT
          model_id, COUNT(*) AS request_count,
          COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
          COALESCE(SUM(CASE WHEN state IN ('settled','reconciled') THEN actual_micros ELSE 0 END),0) AS confirmed_micros,
          COALESCE(SUM(CASE WHEN state='uncertain' THEN actual_micros ELSE 0 END),0) AS uncertain_micros,
          COALESCE(SUM(actual_micros), 0) AS actual_micros
        FROM gateway_requests
        WHERE account_id = ? AND created_at >= ? AND created_at < ?
        GROUP BY model_id ORDER BY actual_micros DESC`,
      )
      .bind(accountId, from, to)
      .all<Record<string, number | string>>(),
  ]);
  return { totals, byModel: byModel.results };
}

export async function getAdminUsageOverview(from: number, to: number) {
  const db = await getD1();
  const [totals, byAccount, byModel] = await Promise.all([
    db
      .prepare(
        `SELECT
          COUNT(*) AS request_count,
          SUM(CASE WHEN state = 'settled' THEN 1 ELSE 0 END) AS settled_count,
          SUM(CASE WHEN state = 'released' THEN 1 ELSE 0 END) AS released_count,
          SUM(CASE WHEN state = 'uncertain' THEN 1 ELSE 0 END) AS uncertain_count,
          SUM(CASE WHEN state = 'reconciled' THEN 1 ELSE 0 END) AS reconciled_count,
          COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
          SUM(CASE
            WHEN prompt_tokens IS NULL OR completion_tokens IS NULL THEN 1
            ELSE 0
          END) AS usage_unknown_count,
          COALESCE(SUM(CASE
            WHEN state = 'uncertain' THEN actual_micros ELSE 0
          END), 0) AS uncertain_micros,
          COALESCE(SUM(CASE
            WHEN state IN ('settled', 'reconciled') THEN actual_micros ELSE 0
          END), 0) AS confirmed_micros,
          COALESCE(SUM(actual_micros), 0) AS actual_micros
        FROM gateway_requests
        WHERE created_at >= ? AND created_at < ?`,
      )
      .bind(from, to)
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT
          a.id AS account_id, a.username, a.display_name,
          COUNT(r.id) AS request_count,
          COALESCE(SUM(r.prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(r.completion_tokens), 0) AS completion_tokens,
          SUM(CASE
            WHEN r.id IS NOT NULL
              AND (r.prompt_tokens IS NULL OR r.completion_tokens IS NULL)
            THEN 1 ELSE 0
          END) AS usage_unknown_count,
          COALESCE(SUM(CASE
            WHEN r.state = 'uncertain' THEN r.actual_micros ELSE 0
          END), 0) AS uncertain_micros,
          COALESCE(SUM(r.actual_micros), 0) AS actual_micros
        FROM accounts a
        LEFT JOIN gateway_requests r
          ON r.account_id = a.id AND r.created_at >= ? AND r.created_at < ?
        GROUP BY a.id, a.username, a.display_name
        ORDER BY actual_micros DESC, a.created_at DESC`,
      )
      .bind(from, to)
      .all<Record<string, number | string>>(),
    db
      .prepare(
        `SELECT
          m.id AS model_id, m.display_name,
          COUNT(r.id) AS request_count,
          COALESCE(SUM(r.prompt_tokens), 0) AS prompt_tokens,
          COALESCE(SUM(r.completion_tokens), 0) AS completion_tokens,
          SUM(CASE
            WHEN r.id IS NOT NULL
              AND (r.prompt_tokens IS NULL OR r.completion_tokens IS NULL)
            THEN 1 ELSE 0
          END) AS usage_unknown_count,
          COALESCE(SUM(CASE
            WHEN r.state = 'uncertain' THEN r.actual_micros ELSE 0
          END), 0) AS uncertain_micros,
          COALESCE(SUM(r.actual_micros), 0) AS actual_micros
        FROM models m
        LEFT JOIN gateway_requests r
          ON r.model_id = m.id AND r.created_at >= ? AND r.created_at < ?
        GROUP BY m.id, m.display_name
        ORDER BY actual_micros DESC, m.display_name`,
      )
      .bind(from, to)
      .all<Record<string, number | string>>(),
  ]);
  return {
    totals: totals ?? emptyUsageTotals(),
    byAccount: byAccount.results,
    byModel: byModel.results,
  };
}

export async function listUncertainRequests(limit = 100) {
  const rows = await (await getD1())
    .prepare(
      `SELECT
        r.id, r.account_id, a.username, a.display_name,
        r.model_id, m.display_name AS model_display_name,
        q.currency, r.reserved_micros, r.actual_micros, r.prompt_tokens,
        r.completion_tokens, r.upstream_request_id, r.failure_code,
        r.created_at, r.completed_at, r.updated_at, f.failure_json
      FROM gateway_requests r
      LEFT JOIN gateway_image_failures f ON f.request_id=r.id
      JOIN accounts a ON a.id = r.account_id
      JOIN models m ON m.id = r.model_id
      JOIN quota_buckets q ON q.id = r.quota_bucket_id
      WHERE r.state = 'uncertain'
      ORDER BY r.updated_at ASC
      LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    accountDisplayName: row.display_name,
    modelId: row.model_id,
    modelDisplayName: row.model_display_name,
    reservedMicros: row.reserved_micros,
    chargedMicros: row.actual_micros,
    currency: row.currency,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    upstreamRequestId: row.upstream_request_id,
    failureCode: row.failure_code,
    diagnostic: (()=>{try{return safeImageDiagnostic(JSON.parse(String(row.failure_json||'null'))?.diagnostic);}catch{return null;}})(),
    createdAt: new Date(Number(row.created_at)).toISOString(),
    completedAt: row.completed_at
      ? new Date(Number(row.completed_at)).toISOString()
      : null,
    updatedAt: new Date(Number(row.updated_at)).toISOString(),
  }));
}

export async function reconcileUncertainRequest(
  actor: AuthContext,
  requestId: string,
  input: {
    actualMicros: number;
    promptTokens?: number;
    completionTokens?: number;
    note: string;
  },
) {
  const db = await getD1();
  if (
    (input.promptTokens === undefined) !==
    (input.completionTokens === undefined)
  ) {
    throw new AppError(
      400,
      'incomplete_usage',
      'promptTokens 与 completionTokens 必须同时填写或同时留空。',
    );
  }
  const current = await db
    .prepare(
      `SELECT id, account_id, state, reserved_micros, actual_micros,
              prompt_tokens, completion_tokens, failure_code
       FROM gateway_requests WHERE id = ? LIMIT 1`,
    )
    .bind(requestId)
    .first<Record<string, unknown>>();
  if (!current)
    throw new AppError(404, 'request_not_found', '网关请求不存在。');
  if (current.state !== 'uncertain') {
    throw new AppError(
      409,
      'request_not_uncertain',
      '该请求已不在待对账状态。',
    );
  }

  const now = Date.now();
  const result = await db
    .prepare(
      `UPDATE gateway_requests
       SET state = 'reconciled', actual_micros = ?,
           prompt_tokens = COALESCE(?, prompt_tokens),
           completion_tokens = COALESCE(?, completion_tokens),
           reconciled_by = ?, reconciled_at = ?, reconciliation_note = ?,
           updated_at = ?
       WHERE id = ? AND state = 'uncertain'`,
    )
    .bind(
      input.actualMicros,
      input.promptTokens ?? null,
      input.completionTokens ?? null,
      actor.account.id,
      now,
      input.note,
      now,
      requestId,
    )
    .run();
  assertD1MutationApplied(result, 'request_not_uncertain');
  return {
    id: requestId,
    state: 'reconciled' as const,
    actualMicros: input.actualMicros,
    adjustmentMicros: input.actualMicros - Number(current.actual_micros),
    reconciledAt: new Date(now).toISOString(),
  };
}

export async function recoverStaleRequests({
  reservedBefore,
  inflightBefore,
}: {
  reservedBefore: number;
  inflightBefore: number;
}) {
  const db = await getD1();
  const reserved = await db
    .prepare(
      `SELECT id FROM gateway_requests
       WHERE state = 'reserved' AND updated_at < ?
       ORDER BY updated_at LIMIT 200`,
    )
    .bind(reservedBefore)
    .all<{ id: string }>();
  const inflight = await db
    .prepare(
      `SELECT id FROM gateway_requests
       WHERE state = 'inflight' AND updated_at < ?
       ORDER BY updated_at LIMIT 200`,
    )
    .bind(inflightBefore)
    .all<{ id: string }>();
  let released = 0;
  let uncertain = 0;
  const now = Date.now();
  for (const row of reserved.results) {
    const result = await db
      .prepare(
        `UPDATE gateway_requests
         SET state = 'released', failure_code = 'stale_before_upstream',
             completed_at = ?, updated_at = ?
         WHERE id = ? AND state = 'reserved'`,
      )
      .bind(now, now, row.id)
      .run();
    released += Number(result.meta.changes ?? 0) > 0 ? 1 : 0;
  }
  for (const row of inflight.results) {
    const result = await db
      .prepare(
        `UPDATE gateway_requests
         SET state = 'uncertain', actual_micros = reserved_micros,
             failure_code = 'stale_after_upstream', completed_at = ?, updated_at = ?
         WHERE id = ? AND state = 'inflight'`,
      )
      .bind(now, now, row.id)
      .run();
    uncertain += Number(result.meta.changes ?? 0) > 0 ? 1 : 0;
  }
  return { released, uncertain };
}

function assertD1MutationApplied(result: D1Result, code: string) {
  if (!d1MutationApplied(result)) {
    throw new AppError(409, code, '请求状态已经改变。');
  }
}

function emptyUsageTotals() {
  return {
    request_count: 0,
    settled_count: 0,
    released_count: 0,
    uncertain_count: 0,
    reconciled_count: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    usage_unknown_count: 0,
    uncertain_micros: 0,
    confirmed_micros: 0,
    actual_micros: 0,
  };
}
