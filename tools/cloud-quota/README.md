# Stable Cloud request-based quota reservation

The Responses gateway previously reserved the full model context window for every
request. With the configured Sol rates, even a tiny request required at least
¥75.60, so accounts with enough balance for the actual task could be rejected.

This overlay obtains the structured input count from the provider's
`POST /v1/responses/input_tokens` endpoint. It includes text, image content,
encrypted reasoning, and tool definitions. The server alone supplies the measured
count to quota calculation; client-provided counts are rejected. Output is still
reserved at the requested maximum, using conservative tier/cache rates. Actual
settlement, ledger invariants, prices, and existing reservations are unchanged.

The counter has a 15-second deadline and a bounded response body. A timeout,
redirect, malformed count, or upstream failure returns a sanitized 503 before
creating a reservation or requesting generation. No fallback guesses are used.
Other protocols retain their existing reservation policy.

## Apply to gateway source

```powershell
node tools/cloud-quota/apply.cjs .local/ecs-production/source
```

The installer checks source anchors, is idempotent, and saves changed originals
in a timestamped `.quota-source-backup-*` directory. It does not deploy, migrate
the database, change prices, or install desktop packages.

## Validation

From `D:\stable`, with Node supporting TypeScript stripping:

```powershell
node --test tests/openai-responses.test.cjs
node --test .local/ecs-production/source/tests/gateway-core.test.ts .local/ecs-production/source/tests/pricing.test.ts .local/ecs-production/source/tests/quota-database.test.ts .local/ecs-production/source/tests/request-reservation.test.ts
node tools/cloud-quota/verify-integration.cjs
node tools/cloud-openai/verify-integration.cjs
```

The integration fixtures use a real in-memory SQLite database and mocked provider
responses. They check insufficient quota, concurrent admission, duplicate keys,
count failure without generation, upstream failure release, and settlement.
They do not call a paid generation endpoint.

See the [official token-counting guide](https://developers.openai.com/api/docs/guides/token-counting)
and [endpoint reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count).
