# Stable skills: authenticated cloud delivery

## Status and boundary

The private service was deployed with explicit approval on 2026-11-02 to `C:\stable-cloud\skills\releases\20261102-407844f77fb8`. `Stable-Cloud-Skills` runs as Local Service, binds `127.0.0.1:18882`, and receives `/api/skills/*` through the existing Caddy instance. Packages are outside the public `/updates/` directory. No new cloud resources or provider requests were used. The existing gateway and update manifest remain healthy.

The default release still bundles skills. Opt in locally with both `STABLE_CLOUD_ENABLED=1` and `STABLE_SKILL_DELIVERY=cloud`; the former enables the account service in development, while the latter changes the market and skips automatic bundled registration. `build/cloud-skills.config.cjs` and `build/cloud-skills-update.config.cjs` are opt-in full/update configurations: they exclude plugin ZIPs, omit the filtered bundle copy, and embed cloud delivery metadata. Experts and runtime dependencies remain included. No installer was built or published. Complete installation/upgrade acceptance using these configurations before switching the update channel.

## Artifacts and trust

Run `node scripts/prepare-cloud-skills.cjs`. It verifies the locked source manifest and creates `.local/cloud-skills/catalog.json` and `packages/<sha256>.zip`, plus the pinned client catalog `desktop/skills/cloud-catalog.json`.

There are 617 skills grouped into 44 original source packages to retain relative references, plus two business plugin packages (10 entry points). Only the selected skill is registered; shared resources are cached once. At this revision the packages total 67,138,962 bytes and the catalog is 1,199,023 bytes. Catalog hashes are shipped in the client: a server alone cannot change the installed bytes. Independent signed catalog updates, automatic skill upgrades and resumable client downloads are not implemented in this first stage. Interrupted downloads can be retried from the beginning. The server supports single Range requests.

## Server deployment and recovery

`deploy.ps1` defaults to read-only preflight; `-Apply` verifies the prepared manifest, backs up Caddy, registers the background task, checks readiness, and reloads the reviewed route. It refuses unrelated configuration changes and attempts rollback on an activation failure. The successful release retains `Caddyfile.before`, `deployment.json` and `rollback.ps1`. Run the release's rollback script on the server to restore the prior route and remove the skill task; resource files are retained. It refuses to overwrite later Caddy changes. Production rollback was not exercised.

The deployment procedure used was:

1. Inspect the current service, Caddy configuration and free disk; keep the existing release intact. Choose a new private versioned resource directory, outside the publicly served updates directory.
2. Copy the generated catalog and packages there. The server verifies every package on startup. Restrict writes to the publishing identity; the serving identity only needs read access.
3. Run `server.cjs` with `STABLE_SKILL_ROOT` set to that directory, using the existing Node runtime and a managed background service. It binds only `127.0.0.1:18882`.
4. After reviewing the live route order, proxy `/api/skills/*` through Caddy to that loopback service. Do not strip the prefix. Do not serve the package directory directly. The sidecar forwards the device Bearer token only to `http://127.0.0.1:18880/api/account`; that existing service remains the authority for session revocation and account state. It requires active accounts and rejects required password changes. No provider calls, quota reservations or usage billing are made by this module.
5. Verify missing/invalid tokens, GET/HEAD/Range, hashes, failure handling and existing health/update routes. Never log tokens. Expired/revoked-session and restricted-account denials are delegated to the existing account authority; denial responses were covered in local tests without revoking the user's real session.
6. Test real downloads with the approved current account and an isolated snapshot of existing skill records. These passed; installer publication remains a separate step.

## Client and migration

Downloads use the existing account's transport (including Electron system proxy behavior), the same service origin, no redirects, a two-minute deadline, pinned sizes and SHA-256. Extraction rejects traversal, links, extra files and oversized expansion. Installation uses staging then rename, and registers only after validation. Neither download nor extraction executes scripts.

Cloud mode copies intact existing resource groups to `userData/cloud-skill-packages/<sha256>` in a worker thread. The worker never opens the real database; the main thread checks records and metadata again before committing, preserving edits/removals made while copying. IDs, text edits, enabled state and conversation references are preserved. Migration does not delete originals. `cloudSkillMigration` records missing resources and conflicts. Missing unchanged managed resources can be downloaded again when selected. Modified/incomplete source groups or edited entries whose files are already gone require resolution before removing old installer resources. A database row alone is not treated as installed. Cached resources remain available offline; models or external tools may still require network access.

## Validation

`node --test tests/cloud-skills.test.cjs tests/filtered-skill-bundle.test.cjs tests/personal-plugins.test.cjs`

Run `tests/fixtures/cloud-skill-market-ui.cjs` and `tests/fixtures/cloud-skill-migration.cjs` through Electron with `ELECTRON_RUN_AS_NODE` removed and hidden windows. The UI bridge is synthetic; the second fixture verifies worker execution in Electron. Unit/local HTTP tests cover request failures and account denials.

Live acceptance used the current logged-in account without logging or persisting its token: catalog 200, anonymous/invalid session 401, full installs of a small skill plus both plugins, cache reuse, HEAD 200 and Range 206. Original encrypted credentials were unchanged. A read-only extraction of real skill records migrated 621 entries in an isolated profile, retaining 67 conversation-reference groups with no conflicts or missing files. Initial copying took about 185 seconds, which prompted the worker implementation; a cached worker rerun preserved main-thread responsiveness. See `docs/cloud-skill-delivery-20261102.md` for boundaries and details.

No formal installer, Git commit or push was performed. The currently published client and update channel were not changed by this task.
