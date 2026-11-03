# OpenAI public provider overlay

Deployed 2026-10-29; acceptance record: `docs/openai-cloud-acceptance-20261029.md`.

Image-edit source update deployed 2026-11-03 to `C:\stable-cloud\releases\20261103-design-images`. See `docs/design-cloud-deployment-20261103.md` for 13 live non-provider checks, price versions, encrypted backup, and the current rollback entry point. The older `rollback.ps1` below belongs to the 2026-10-29 rollout and intentionally rejects this newer release.

Apply only to the inspected Stable Cloud Node release using `node apply.cjs TARGET`. This overlay adds Responses API chat, token-billed image generation and targeted OpenAI proxy support. Run `verify.cjs` and `verify-integration.cjs` against a disposable copy before deployment. `activate-models.mjs` requires an explicit approved FX argument and refuses to overwrite existing models/prices.

Chat models use Responses, flat function tools, encrypted reasoning replay, `store:false`, and official per-model reasoning options. Do not reuse the Codex login namespace-specific function-choice protocol for the public API.

The 2026-11-03 source update adds `/v1/images/edits` with authenticated reference uploads (up to 4 images, 10 MiB each, 20 MiB total), byte-hash validation, upstream multipart transport, and separate image-input billing. This update is not deployed by editing this repository. The generation route remains text-only. Edit requests fail before upstream submission until the immutable price version contains `imageInput` rates. `enable-image-input-pricing.mjs DATABASE` previews the proposed new price versions; `--apply` writes them only after deployment approval. It retains the existing text-input currency conversion, leaves accounts/quotas untouched, and does not rewrite old prices or ledger entries. Image admission reserves the configured entire input-context ceiling rather than assuming an unverified image token formula; settlement uses actual text/image token breakdown. Results with unknown billing or network outcomes cannot be resubmitted.

Production configuration stores `OPENAI_API_KEY` and `OPENAI_HTTPS_PROXY` in machine-encrypted runtime configuration. Never include credentials in this package. `undici` proxy routing is restricted to the official OpenAI origin.

Rollback: copy `rollback.ps1` and `disable-models.cjs` together to the server; validate with `-ValidateOnly`. Run without that flag only for an intentional rollback. It disables the four new model admissions, waits for an idle gateway, then restores the retained previous release. It preserves the current database, prices and ledger: restoring a pre-deployment database would erase legitimate subsequent usage. Validation does not exercise a production rollback.
