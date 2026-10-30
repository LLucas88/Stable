# OpenAI public provider overlay

Deployed 2026-10-29; acceptance record: `docs/openai-cloud-acceptance-20261029.md`.

Apply only to the inspected Stable Cloud Node release using `node apply.cjs TARGET`. This overlay adds Responses API chat, token-billed image generation and targeted OpenAI proxy support. Run `verify.cjs` and `verify-integration.cjs` against a disposable copy before deployment. `activate-models.mjs` requires an explicit approved FX argument and refuses to overwrite existing models/prices.

Chat models use Responses, flat function tools, encrypted reasoning replay, `store:false`, and official per-model reasoning options. Do not reuse the Codex login namespace-specific function-choice protocol for the public API. Image generation accepts text prompts only; it does not implement the image-edit endpoint or bill image inputs.

Production configuration stores `OPENAI_API_KEY` and `OPENAI_HTTPS_PROXY` in machine-encrypted runtime configuration. Never include credentials in this package. `undici` proxy routing is restricted to the official OpenAI origin.

Rollback: copy `rollback.ps1` and `disable-models.cjs` together to the server; validate with `-ValidateOnly`. Run without that flag only for an intentional rollback. It disables the four new model admissions, waits for an idle gateway, then restores the retained previous release. It preserves the current database, prices and ledger: restoring a pre-deployment database would erase legitimate subsequent usage. Validation does not exercise a production rollback.
