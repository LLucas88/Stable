import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

// Standard USD prices per million tokens as of 2026-11-20.
const textModels = [
  { id: 'gpt-6.2-astra', name: 'GPT-6.2 Astra', input: 8, cached: 0.4, output: 40 },
  { id: 'gpt-6.2-sol', name: 'GPT-6.2 Sol', input: 2, cached: 0.1, output: 10 },
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', input: 2, cached: 0.1, output: 10 },
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', input: 1, cached: 0.05, output: 5 },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', input: 10, cached: 1, output: 50 },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', input: 2, cached: 0.2, output: 10 },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', input: 0.1, cached: 0.01, output: 0.5 },
]

const upstreamBaseURL = 'https://api.openai.com/v1'
const modelWindow = 1_050_000
const maxOutput = 128_000
const micros = usd => Math.round(usd * 1_000_000)
const initialUsdMicros = micros(10)
const initialGrantAction = 'quota.usd_initial_20261120'
const initialWalletDurationMs = 30 * 86_400_000

function pricingPolicy(model) {
  return {
    version: 1,
    kind: 'openai-cache',
    source: `https://developers.openai.com/api/docs/models/${model.id}`,
    verifiedAt: '2026-11-20',
    tiers: [
      { label: 'standard', promptLessThan: 272_001, inputMicrosPerMillion: micros(model.input), cachedInputMicrosPerMillion: micros(model.cached), outputMicrosPerMillion: micros(model.output) },
      { label: 'long-context', inputMicrosPerMillion: micros(model.input * 2), cachedInputMicrosPerMillion: micros(model.cached * 2), outputMicrosPerMillion: micros(model.output * 1.5) },
    ],
  }
}

function initialWallets(db) {
  const granted = db.prepare('SELECT 1 FROM audit_logs WHERE action = ? AND entity_type = ? LIMIT 1').get(initialGrantAction, 'quota_batch')
  if (granted) return null
  return db.prepare(`SELECT a.id,
      EXISTS(SELECT 1 FROM quota_buckets usd WHERE usd.account_id = a.id AND usd.currency = 'USD' AND usd.status = 'active') AS has_usd
    FROM accounts a
    WHERE a.status = 'active'`).all()
}

function grantInitialWallets(db, wallets, now) {
  if (!wallets) return
  if (wallets.some(row => row.has_usd)) throw new Error('Review active accounts with an existing USD wallet before granting initial allowances')
  const insert = db.prepare(`INSERT INTO quota_buckets
    (id, account_id, currency, limit_micros, spent_micros, reserved_micros, period_start, period_end, status, created_at, updated_at)
    VALUES (?, ?, 'USD', ?, 0, 0, ?, ?, 'active', ?, ?)`)
  const audit = db.prepare(`INSERT INTO audit_logs (target_account_id, action, entity_type, entity_id, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
  const periodEnd = now + initialWalletDurationMs
  for (const row of wallets) {
    const id = `quota_${randomUUID()}`
    insert.run(id, row.id, initialUsdMicros, now, periodEnd, now, now)
    audit.run(row.id, initialGrantAction, 'quota_bucket', id, JSON.stringify({ currency: 'USD', limitMicros: initialUsdMicros, periodEnd }), now)
  }
  audit.run(null, initialGrantAction, 'quota_batch', null, JSON.stringify({ currency: 'USD', count: wallets.length, perAccountMicros: initialUsdMicros }), now)
}

export function activateGpt6Text(db, { apply = false, now } = {}) {
  const lookup = db.prepare('SELECT id, provider, upstream_model, upstream_base_url, status FROM models WHERE id = ?')
  const currentPrices = db.prepare(`SELECT id, currency, effective_at, pricing_policy_json,
    input_micros_per_million, output_micros_per_million FROM model_prices
    WHERE model_id = ? AND (retired_at IS NULL OR retired_at > ?) ORDER BY effective_at DESC`)

  if (apply) db.exec('BEGIN IMMEDIATE')
  try {
    now ??= Date.now()
    const plans = textModels.map(model => {
      const existing = lookup.get(model.id)
      const policy = pricingPolicy(model)
      if (existing) {
        const prices = currentPrices.all(model.id, now)
        const price = prices[0]
        if (existing.provider !== 'openai' || existing.upstream_model !== model.id ||
            existing.upstream_base_url !== upstreamBaseURL || existing.status !== 'active' ||
            !price || price.effective_at > now || prices.length !== 1 || !['USD', 'CNY'].includes(price.currency) ||
            (price.currency === 'CNY' && price.effective_at === now)) {
          throw new Error(`Existing model ${model.id} needs review before activation`)
        }
        if (price.currency === 'USD') {
          const recorded = JSON.parse(price.pricing_policy_json || 'null')
          const standard = policy.tiers[0]
          if (recorded?.kind !== policy.kind || recorded.version !== policy.version || !isDeepStrictEqual(recorded.tiers, policy.tiers) ||
              price.input_micros_per_million !== standard.inputMicrosPerMillion || price.output_micros_per_million !== standard.outputMicrosPerMillion) {
            throw new Error(`Existing USD prices for ${model.id} need review before activation`)
          }
        }
        return { id: model.id, name: model.name, policy, price, action: price.currency === 'USD' ? 'current' : 'switch-to-usd' }
      }
      return { id: model.id, name: model.name, policy, action: 'add' }
    })
    const wallets = initialWallets(db)

    if (apply) {
      const insertModel = db.prepare(`INSERT INTO models
        (id, display_name, provider, upstream_model, upstream_base_url, secret_name, context_window, max_output_tokens, status, created_at, updated_at)
        VALUES (?, ?, 'openai', ?, ?, 'OPENAI_API_KEY', ?, ?, 'active', ?, ?)`)
      const insertPrice = db.prepare(`INSERT INTO model_prices
        (id, model_id, currency, input_micros_per_million, output_micros_per_million, pricing_policy_json, effective_at, created_at)
        VALUES (?, ?, 'USD', ?, ?, ?, ?, ?)`)
      const retirePrice = db.prepare('UPDATE model_prices SET retired_at = ? WHERE id = ?')
      grantInitialWallets(db, wallets, now)
      for (const { id, name, policy, price, action } of plans) {
        if (action === 'current') continue
        const standard = policy.tiers[0]
        if (action === 'add') insertModel.run(id, name, id, upstreamBaseURL, modelWindow, maxOutput, now, now)
        else retirePrice.run(now, price.id)
        insertPrice.run(`${id}-20261120-usd`, id, standard.inputMicrosPerMillion, standard.outputMicrosPerMillion, JSON.stringify(policy), now, now)
      }
      db.exec('COMMIT')
    }

    return { applied: apply, currency: 'USD', models: plans.map(({ id, name, action, policy }) => ({ id, name, action, tiers: policy.tiers })),
      grant: { alreadyApplied: wallets === null, perAccountMicros: initialUsdMicros, periodDays: 30, accounts: wallets?.length ?? 0,
        conflicts: wallets?.filter(row => row.has_usd).length ?? 0 } }
  } catch (error) {
    if (apply && db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...flags] = process.argv.slice(2)
  const apply = flags.length === 1 && flags[0] === '--apply'
  if (!file || !existsSync(file) || (flags.length > 0 && !apply)) {
    throw new Error('Usage: node activate-gpt6-text.mjs DATABASE [--apply]')
  }
  const db = new DatabaseSync(file, { readOnly: !apply })
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
    console.log(JSON.stringify(activateGpt6Text(db, { apply })))
  } finally {
    db.close()
  }
}
