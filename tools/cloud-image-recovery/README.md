# Image failure recovery (2026-11-04)

Fixes the case where an upstream HTTP 400 has already released the reservation,
but querying the same image request returns `image_result_unknown` forever.

## Apply and verify

Apply this overlay **after** the existing image/OpenAI/quota overlays:

```powershell
node tools/cloud-image-recovery/apply.cjs .local/ecs-production/source
node --test .local/ecs-production/source/tests/image-failure.test.ts
node tools/cloud-openai/verify-integration.cjs
node --test tests/image-generation.test.cjs tests/design-delivery-failure.test.cjs tests/cloud-transport.test.cjs
```

The apply script checks the previous source hashes and backs up changed files.
Reapplying an older overlay afterwards can undo this fix. Review any hash mismatch
instead of bypassing the guard. The integration fixture uses SQLite, real route
handlers and a mock provider; it never calls a paid model.

Before activating the new server build, apply
`overlay/drizzle/0013_image_failure_diagnostics.sql`. It adds a diagnostic table;
it does not rewrite historical billing, requests or results. Back up the database,
verify restoration, drain active generation requests, and preserve the previous
release for rollback. The older release can ignore the added table.

## State and compatibility contract

| Stored state | Same-key response | New provider call |
| --- | --- | --- |
| settled with saved result | 200, original image | No |
| released with definite rejection or cancellation before submission | terminal `image_generation_failed` | No |
| reserved/inflight, less than 10 minutes old | 202 PROCESSING | No |
| uncertain, legacy ambiguous release, stale active, settled without saved result | 409 `image_result_unknown` | No |
| same key with different parameters | 409 `idempotency_conflict` | No |

Released requests return 422, except provider balance/limit errors preserve
402/429. Existing clients recognize `image_generation_failed` as terminal while
recovering a receipt. An explicitly requested new attempt uses a new identifier;
neither the server nor receipt recovery automatically generates another image.

HTTP 408/409/5xx and transport failures remain uncertain, including legacy
records whose reservation was already released: they do not prove that
the provider stopped before generating or charging. Concurrent identical
submissions are serialized by the existing quota reservation uniqueness check.

## Diagnostics and limits

New rejected requests retain only allowlisted error code, parameter, moderation
stage and provider request ID, with a 16 KiB/2-second error parsing bound. No
provider message, prompt, image, authorization header or API key is retained in
this table. `X-Stable-Request-Id` correlates the desktop network log to the gateway.

Historical failures without a saved upstream error body retain a generic reason;
the fix cannot reconstruct the provider's original rejection reason or missing
image. Desktop delivery wording must distinguish zero files from preview files.
This change does not guarantee that future provider requests cannot be rejected.
