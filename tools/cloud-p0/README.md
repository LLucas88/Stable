# Image reliability P0 overlay

Incremental patch against the actual `20261106-image26` cloud release, deployed as
`20261109-p0`. Apply this overlay **after** the image recovery, quota, OpenAI and
egress overlays. Applying an older overlay afterward can remove these fixes.

The seven changed/new cloud files add sanitized failure diagnostics, preserve
unknown-result deduplication, separate confirmed usage from pending amounts, and
display router instability. `lib/core/image-failure.ts` and
`app/admin/usage/page.tsx` are unchanged baseline references. No schema migration,
historical ledger rewrite, automatic refund or generation retry is included.

The matching router is `tools/cloud-egress/router.cjs`; matching desktop changes
are in `desktop/services/image-diagnostic.cjs`, `cloud-transport.cjs`,
`image-generation.cjs`, and the account settings usage display.

## Local verification

From the repository root:

```powershell
node --test tests/image-p0.test.cjs tests/cloud-transport.test.cjs tests/image-generation.test.cjs tests/design-direct.test.cjs tools/cloud-egress/router.test.cjs
node tools/cloud-p0/verify.cjs
npx tsc --noEmit
npm run build
```

The cloud integration check requires a complete, secret-free copy of the cloud
source at `.local/p0-20261109/source` (including `drizzle` and
`runtime/sqlite-d1.mjs`). This source is not the desktop repository. The check
copies this overlay into that fixture, bundles the real routes, mocks upstream
transport, and uses an in-memory database. It does not use production data or
generate paid images. The current workspace has this fixture; a fresh checkout
must prepare it from the matching cloud baseline first.

`observedNode` is a readiness-check snapshot, not proof of the final tunnel used.
Network error phases never prove that a request was not submitted. Existing
historical requests have no phase diagnostic and must not be backfilled by guess.

Deployment and acceptance evidence: `docs/image-p0-20261109.md`.
