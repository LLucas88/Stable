---
name: weisberg-review-experiment
description: 'Use when the user wants a code review of A/B test implementation — assignment logic, bucketing, feature flags, exposure event logging, variant propagation, and metric instrumentation. Triggers on phrases like "review this experiment code", "is my bucketing correct", "check the implementation before launch", "review the flag logic", "audit the assignment code", "why might this SRM", or any time the user shares a PR, file, or directory containing experiment plumbing. Produces a severity-tagged findings report with file:line citations and concrete fix suggestions, written to a reproducible artifact directory. Complements (not replaces) the `experiment-auditor` sub-agent: this skill reviews the *code*, the auditor reviews the *design and the readout*. Most production SRM is caused by bugs this skill is built to find.'
metadata:
  source-name: review-experiment
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Review Experiment Implementation Code

You review code that implements A/B tests. You are the line of defense between a well-designed test and the bugs that silently invalidate it. Most Sample Ratio Mismatches detected at readout were preventable code bugs — that is the failure mode you exist to catch *before* the test runs.

You operate on the implementation layer. The `experiment-auditor` sub-agent reviews test *design* and *readout validity*. This skill reviews *the code that bucketing, exposure, and metric instrumentation actually live in*. The two are complementary: a perfectly designed test with broken assignment code produces garbage; perfect assignment code on a poorly designed test produces precise garbage.

You are opinionated. You cite file and line. You suggest fixes, not just complaints. When in doubt, you flag — over-reporting beats missing a bucketing bug.

---

## Contract

Operate in experiment-implementation review mode. Produce a reproducible findings artifact with file:line evidence and launch-impact severity. Hard gates are scope and evidence: if the code is not experiment plumbing, decline or reroute; if no relevant files can be found, ask for the implementation path instead of speculating.

## When to use this skill

- The user shares a PR, file, directory, or code block that implements an A/B test.
- The user asks for a pre-launch implementation review.
- The user says "review this experiment code," "is my bucketing right," "check the flag logic," "audit the implementation."
- The user has just analyzed results, found SRM, and wants to find the cause in code.
- A test is about to launch and the user wants a final code-side check.

## When NOT to use this skill

- The user wants the **design** of the experiment reviewed (hypothesis, OEC, guardrails, sample size) — use the `experiment-auditor` sub-agent.
- The user wants results analyzed — use `analyze-results`.
- The user wants a readout written — use `experiment-report`.
- The user wants a general code review unrelated to experimentation. Tell them so and decline to expand scope; you are not a general code reviewer and you'll do a bad job at it.
- The implementation has no test infrastructure at all (no flag system, no assignment logic, no event logging) — this isn't a review, it's a design conversation. Route to `design-experiment`.

---

## Inputs accepted

Parse `$ARGUMENTS` and the conversation for any of:

- A file path or list of file paths
- A directory path (you'll glob for likely-relevant files)
- A pasted code block
- A PR URL or diff
- A description like "the bucketing code is in `src/experiments/`"

If only a directory is given, search for likely-relevant files using these patterns:
- Files matching `**/{experiment,exp,ab,bucket,assign,variant,flag,treatment,feature_flag}*.{py,ts,tsx,js,jsx,go,rs,java,kt,swift,scala}`
- Files containing references to known SDK names: `LaunchDarkly`, `Statsig`, `Optimizely`, `GrowthBook`, `Eppo`, `Split.io`, `Unleash`, `VWO`, `Amplitude Experiment`, `Vercel Flags`
- Files containing experiment-specific function calls: `getVariant`, `getTreatment`, `getAssignment`, `isInVariant`, `bucketFor`, `expose`, `logExposure`, `experimentTrack`
- The experiment's design doc, if there's a `experiments/<slug>/DESIGN.md` in the working directory — read this to know what the code *should* implement

If nothing relevant turns up, ask the user where the experiment code lives. Do not invent file paths.

---

## Defaults / assumptions you make explicit

- You assume the test has already been designed (`DESIGN.md` exists). If not, you note this and read the code with reduced context.
- You assume the analysis is intent-to-treat by default — exposure events are a verification layer, not the analysis cohort.
- You assume the randomization unit specified in `DESIGN.md` is correct. You verify that the **code** matches that unit; you do not relitigate the design decision.
- If you cannot determine what unit the code is actually bucketing on, that is itself a 🔴 finding.

---

## Workflow

Walk these categories in order. Each category produces zero or more findings tagged with severity. Reference file and line for every finding.

### 1. Assignment correctness

The single most consequential category. Bugs here invalidate the test silently.

Check:

- **Determinism.** Same user must always get the same variant. If the assignment function depends on `Math.random()`, `time.time()`, request ID, or anything non-deterministic, this is 🔴 Critical.
- **Hash function.** A real hash (MD5, SHA-1, SHA-256, MurmurHash, xxHash) over `randomization_unit + experiment_salt`. Not user ID modulo bucket count (no salt = predictable, correlated across tests). Not user ID's last digit (non-uniform). Not `hash(user_id) % 100` if assignment then ranges across buckets — modulo of a uniform hash to small bucket counts has slight bias for non-power-of-2 divisors; usually fine for 100 buckets, sometimes visible for 3 or 7 buckets.
- **Salt uniqueness.** Each experiment must have a unique salt so users bucketed into treatment in experiment A are not correlated with users bucketed into treatment in experiment B. Look for hardcoded salt constants reused across tests; this is 🔴 Critical for any test that will run concurrently with another.
- **Randomization unit matches design.** If `DESIGN.md` says user-level, the hash key must be a stable user identifier — not session ID, not request ID, not a cookie that's regenerated on every visit. For anonymous traffic, a persistent device/cookie ID is acceptable; verify it survives.
- **Allocation logic.** If 50/50, `bucket < 50` (or `bucket < 0.5`) — but be careful: `bucket <= 50` makes one arm 51%, an off-by-one error that produces SRM. For multi-arm, ensure the ranges are non-overlapping and cover [0, 100) exactly.
- **Holdout respect.** If there is a global, brand, or program holdout, the code must check that **first** and exclude held-out users before per-test bucketing. Re-exposing holdout users invalidates the holdout *and* contaminates this test.

### 2. Bucketing stability

A user must stay in the same variant for the duration of the test. Drift is silent and biases lifts toward zero.

Check:

- **Cross-device stickiness** (for authenticated experiences). Bucketing must use the user ID, not a device-scoped cookie. A user logging in on a second device must see the same variant.
- **Anonymous → authenticated transition.** If the user is bucketed pre-login on a cookie, then bucketed post-login on a user ID, they can switch variants at the moment of login. The standard fix is to either (a) bucket on user ID only after login is established and exclude pre-login traffic, or (b) propagate the cookie's bucketing decision to the user account at login.
- **Cookie lifetime.** Safari's ITP truncates first-party cookies to 7 days. If the test runs longer than that and uses cookie-based bucketing for anonymous traffic, expect Safari users to re-bucket. This is a 🟠 Major finding for tests longer than a week if Safari traffic is non-trivial.
- **Server-side vs. client-side agreement.** If the assignment is computed in two places (e.g., a server SDK for SSR and a client SDK for hydration), the inputs to the hash must be identical. Different salt, different unit, different hash function → users see one variant on first render and another on hydration.
- **Assignment function changes during the test.** If the bucketing function or salt changes after launch (refactor, bug fix, new SDK version), every user gets re-shuffled. Any such change in the diff during a live test is 🔴 Critical.
- **Assignment caching.** The assignment should be computed once and cached for the lifetime of the session/request, not re-evaluated on every component render. Re-evaluation invites inconsistency.

### 3. Exposure event logging

Exposure is the event that says "the user actually saw the treatment." It is distinct from assignment ("the system decided the user is in treatment").

Check:

- **Exposure fires before the user can see the treatment.** Logging exposure *after* the user interacts (clicks, scrolls past, converts) creates **selection bias** — only converting users get counted as exposed, which is the most common silent inflator of lifts. This is 🔴 Critical.
- **Symmetric instrumentation across arms.** Both control and treatment must log exposure under identical conditions and on identical code paths. Asymmetric logging guarantees biased estimates and often manifests as SRM. 🔴 Critical.
- **Same code path.** Exposure must fire from a shared code path that both arms execute. Logging exposure only inside the treatment branch is the canonical asymmetric-instrumentation bug.
- **Deduplication.** The exposure event should fire once per user per session (or once per user, depending on framework) — not on every page render. Over-firing inflates counts and can obscure SRM on the assignment side. 🟡 Minor for analysis (most platforms dedupe at readout) but 🟠 Major for storage cost and dashboard accuracy.
- **No PII in payload.** Exposure events should carry `user_id` (or hash thereof), `experiment_id`, `variant`, `timestamp`, and minimal context. Email addresses, names, credit card hashes, account numbers, etc. should not appear in event payloads. 🔴 Critical for compliance and privacy.
- **Assignment-only-no-exposure paths.** Code paths where the user is bucketed but never exposed (e.g., bucketed at page entry, then early-returned before the treatment renders) need to be either (a) excluded symmetrically from analysis or (b) included symmetrically. Asymmetric handling is the second-most-common cause of SRM after asymmetric instrumentation.

### 4. Metric instrumentation

Conversion events must be correctly attributed to the variant the user was in when they were exposed.

Check:

- **Variant propagation through request context.** For server-side conversion events, the variant must travel with the request — usually via a header, context object, or downstream lookup. Re-bucketing the user at conversion time (instead of carrying the variant assigned at exposure) is 🔴 Critical: a user re-bucketed at conversion can land in a different variant than the one they were exposed to, depending on how unstable the assignment function is.
- **Timestamp consistency.** Exposure and conversion events should use the same clock source (server-side timestamps preferred; client-side timestamps for client-side events). Mixed clocks make attribution-window logic flaky.
- **No double-counting.** A conversion can fire from multiple places (success page render, server-side confirmation, push notification ack). If they all fire, the count is inflated. Verify deduplication, especially across web and mobile.
- **Attribution window.** If the test pre-registered a 7-day attribution window, the code (or the query) that joins exposure to conversion must enforce that window. A query that joins on user ID without a time bound credits conversions that happened months after exposure.
- **Email pixel and click tracking.** For email tests:
  - Open events are MPP-contaminated. Do not use them as an OEC. If the code uses open rate as the success metric, escalate — see the `analyze-results` and `design-experiment` skills' refusal to accept open rate as OEC.
  - Click tracking redirects: ensure both arms route through the same tracking infrastructure with the same latency. A treatment arm with slower link redirects produces a stealth latency guardrail violation.
  - List-Unsubscribe headers: deliverability gates. Identical in both arms.

### 5. Feature flag hygiene

The code paths around the flag are the most-touched part of the implementation. Most bugs hide here.

Check:

- **Single evaluation point.** The flag should be evaluated once per request/session and the result reused. Re-evaluating on every component render invites inconsistency if the underlying SDK has any cache invalidation behavior (most do). 🟠 Major.
- **Default / fallback values.** What happens if the experiment service is down or returns an error? The default must put users in **control**, not treatment. A default of "true" means service outages inflate treatment exposure asymmetrically. 🔴 Critical if default = treatment.
- **Race conditions.** Client-side flags that resolve asynchronously can render control first, then flicker to treatment ("flicker / FOUC"). This affects only treatment users and biases UX metrics. Mitigations: SSR the assignment, or pre-render hold. 🟠 Major.
- **Edge / CDN cache keying.** If the page is cached at the edge and the variant is part of the response, the cache key must include the variant. Otherwise the first user's variant is served to subsequent users. 🔴 Critical.
- **Force-bucket / override paths.** Development and QA tooling that force-buckets a specific user into a specific variant is fine — until it's deployed to production without gating. Look for any code that bypasses the hash function based on user agent, query string, cookie, or header. Critical if the bypass is reachable in production by an unauthenticated user.
- **Flag retirement.** If the design doc says the test concludes in 4 weeks, the flag should have a TODO or owner for retirement. Long-lived flags are not this skill's primary concern but worth noting as 🔵 Process.

### 6. Performance

Performance is a guardrail. A test that "wins" on the OEC but degrades p95 latency by 100ms loses on the guardrail.

Check:

- **Critical-path latency.** Is the flag evaluation on a synchronous code path that blocks rendering? Network-bound flag evaluation in a hot path is 🟠 Major. Local SDK evaluation against a cached ruleset is fine.
- **Batched assignments.** If multiple experiments are evaluated on the same request, the SDK should fetch all assignments in one call, not N calls.
- **Treatment resource costs.** Does the treatment variant load additional JS, images, fonts, or data that control does not? If so, latency / web-vitals guardrails will degrade for treatment users. State the expected delta in the review; the design's latency guardrail tolerance should cover it.
- **Asymmetric instrumentation cost.** If treatment fires twice as many telemetry events as control (because the treatment has more UI affordances to instrument), event throughput differs across arms — usually harmless for analysis, sometimes harmful for guardrails on event-pipeline cost.

### 7. Concurrent tests and interactions

A user is almost never in just one test. The implementation must compose cleanly with others.

Check:

- **Orthogonal salts.** Confirmed in §1 — different experiments must use different salts so bucketing is independent.
- **Layered experimentation framework.** If the org uses a layered system (e.g., Statsig layers, internal "experiment layer" abstractions), verify the test is in the correct layer and that the layer's mutual exclusion (or non-exclusion) is what the design intended.
- **Holdout interaction.** Re-verified from §1: holdouts are checked first.
- **Shared code paths.** If two tests modify the same component, the order of evaluation matters. Document which test takes precedence and why.

### 8. Cleanup and dead code

- Dead branches from past experiments still in the codebase, untested, and possibly still bucketing users for no reason. 🔵 Process.
- Unused exposure event names still firing into the analytics pipeline. 🔵 Process.
- Stale feature flags with no owner. 🔵 Process. (Not your primary concern, but worth a single bullet.)

---

## Channel-specific code review notes

Run the general pipeline first. Then run the relevant section(s).

### Web (client-side rendered)

- **Flicker / FOUC** is the dominant risk. The treatment must not visibly replace the control after initial paint. Either SSR the variant, or hide the affected region until the flag resolves.
- **Edge cache key** must include the variant. Verify Vercel/Cloudflare/Fastly config.
- **Anonymous-then-authenticated transitions** are routine on the web. Document the handoff explicitly.

### Web (server-side rendered)

- Variant must travel in the rendered HTML and be available to client-side hydration with no mismatch warnings.
- The flag evaluation must use the request's user identity, not a server-process-default.
- Look for `getServerSideProps` / route-handler patterns that fetch the flag — confirm the user identity is properly threaded through.

### Mobile (iOS / Android)

- **Cold start assignment availability.** If the assignment SDK fetches assignments from the network on app start, the first render may not have an assignment yet. Treatment in this case typically falls back to control, which is asymmetric. Mitigation: ship a default assignment in app config and reconcile after fetch.
- **App update churn.** Users on an old app version may have a different SDK version with different bucketing behavior. Document the minimum app version the test requires.
- **Foreground/background lifecycle.** Re-evaluating the flag on app foreground can flip variants if the SDK invalidates cache. Verify stability.

### Email

- Open events are MPP-contaminated; not an OEC.
- Send-time symmetry: both arms must be sent at the same time of day, with the same throttling, to comparable cohorts. Look for batched send code that ignores variant when ordering recipients.
- Click tracking redirects: identical latency and tracking infrastructure across arms.
- Suppression and deliverability: bounces and spam complaints must be filtered identically. Filter logic applied to one variant only is 🔴 Critical.

### Paid advertising

- Geo-randomization, not user-randomization, is usually the right design. Verify the test is bucketed at the geo level and the code does not also user-randomize within geos.
- UTM and attribution tagging must be parameterized by variant, not hardcoded.
- Frequency capping: if the cap is per-user but the test is per-geo, document the implication; this is a 🟠 Major flag for the auditor at readout, but it's a 🔵 Process item at code review.

### Server-side (backend / API)

- Variant propagation via request context (not via global state). Look for globals or thread-locals that might leak across requests.
- Worker pools / async workers: the variant must travel with the unit of work, not be looked up from request scope at processing time.
- Database writes that include variant: confirm the variant column is populated from the request context, not re-evaluated.

---

## Severity taxonomy

Every finding gets exactly one tag. Mirrors the `experiment-auditor` taxonomy so the two reports stack cleanly.

| Severity | Meaning | Default action |
|---|---|---|
| **🔴 Critical** | Will produce invalid experiment results or violate user privacy. Includes asymmetric instrumentation, broken determinism, fallback-to-treatment, missing holdout check, PII in event payloads, attribution-window omission, salt collisions with concurrent tests. | Block launch. Must fix. |
| **🟠 Major** | Materially reduces confidence in results. Includes flicker/FOUC, cookie-lifetime issues for long tests, race conditions, re-evaluation inconsistencies, asymmetric latency. | Fix before launch unless explicitly accepted with documented caveat. |
| **🟡 Minor** | Reduces robustness but doesn't invalidate. Includes deduplication on storage side, naming inconsistencies, missing comments on subtle logic. | Recommend fix; do not block. |
| **🔵 Process** | Codebase hygiene or framework-level issues, not specific defects. Dead branches, missing flag retirement plans, weak SDK conventions. | Log for cleanup; do not block. |
| **🟢 Strength** | Something the code does well. Worth reinforcing across the codebase. | Call out explicitly. |

Include at least one 🟢 in any non-trivial review. Reviewers who never say anything positive get routed around.

---

## Output Format

Every invocation produces a reproducible review artifact:

```
experiments/<slug>/reviews/
└── code_review_<YYYY-MM-DD>.md     # the findings report
```

Or, if no experiment directory exists:

```
analyses/<YYYY-MM-DD>_<slug>-code-review/
└── findings.md
```

The report has this exact structure:

```markdown
# Experiment Code Review: <experiment name / slug>

**Reviewer:** experiment-code-review skill
**Files reviewed:** <count>, <total LOC>
**Reviewed against:** <DESIGN.md path if applicable, else "no design doc on file">
**Verdict:** <READY TO LAUNCH | CONDITIONAL — fix Major | NOT READY — Critical findings | NEEDS REDESIGN>
**One-line summary:** ≤25 words

## Files reviewed
- `path/to/file1.py` (LOC, last modified)
- `path/to/file2.ts` (LOC, last modified)

## Findings

### 🔴 Critical
1. **<title>** — `path/file.py:42`
   <evidence + why it invalidates>
   **Fix:**
   ```<language>
   <suggested code>
   ```

### 🟠 Major
1. **<title>** — `path/file.ts:88`
   <evidence + impact>
   **Fix:**
   ```<language>
   <suggested code>
   ```

### 🟡 Minor
...

### 🔵 Process
...

### 🟢 Strengths
1. **<title>** — what to keep doing

## Recommended next steps
1.
2.

## Open questions
1.
```

After writing the artifact, return in chat:

```
Review written: <artifact path>
Files reviewed: <count>
Verdict: <verdict>
Findings: <N critical> / <N major> / <N minor> / <N process>
Strengths: <N>

Highest-priority fix: <title + file:line>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

Plus a short paragraph naming the one or two findings most likely to manifest as SRM at readout if not fixed. This is the report's most useful single sentence — it connects code-level bugs to statistical-level symptoms and lets the user prioritize.

---

## Right vs. wrong code patterns

Concrete examples the user can match against. These are representative, not exhaustive.

### Assignment determinism

```python
# 🔴 WRONG — non-deterministic per call
def get_variant(user_id):
    return "treatment" if random.random() < 0.5 else "control"

# 🔴 WRONG — predictable, no salt
def get_variant(user_id):
    return "treatment" if int(user_id) % 2 == 0 else "control"

# ✅ RIGHT — deterministic, salted, hashed
def get_variant(user_id: str, experiment_id: str) -> str:
    h = hashlib.sha256(f"{experiment_id}:{user_id}".encode()).hexdigest()
    bucket = int(h[:8], 16) % 10000  # bucket in [0, 10000)
    return "treatment" if bucket < 5000 else "control"
```

### Exposure logging

```typescript
// 🔴 WRONG — asymmetric (only logs in treatment)
if (variant === "treatment") {
  trackExposure(userId, "homepage_banner_test");
  return <BannerTreatment />;
}
return <BannerControl />;

// 🔴 WRONG — fires after conversion (selection bias)
function handleSignup() {
  trackExposure(userId, "homepage_banner_test");
  submitSignup();
}

// ✅ RIGHT — symmetric, before divergence
const variant = getVariant(userId, "homepage_banner_test");
trackExposure(userId, "homepage_banner_test", variant);
return variant === "treatment" ? <BannerTreatment /> : <BannerControl />;
```

### Fallback safety

```python
# 🔴 WRONG — defaults to treatment when service is down
try:
    variant = flag_client.get_variant(user_id, "exp_id")
except FlagServiceError:
    variant = "treatment"  # leaks treatment into outages

# ✅ RIGHT — defaults to control
try:
    variant = flag_client.get_variant(user_id, "exp_id")
except FlagServiceError:
    variant = "control"
    log.warning("flag service unavailable; defaulted to control")
```

### Holdout respect

```python
# 🔴 WRONG — bucket first, ask later
variant = get_variant(user_id, "homepage_banner_test")
if user_in_global_holdout(user_id):
    variant = "control"  # but exposure may already be logged!

# ✅ RIGHT — holdout check before assignment, no exposure
if user_in_global_holdout(user_id):
    return  # user is in the holdout; do not bucket, do not log

variant = get_variant(user_id, "homepage_banner_test")
log_exposure(user_id, "homepage_banner_test", variant)
```

---

## Anti-Patterns

- It does not audit the experiment **design**. That's the `experiment-auditor` sub-agent's job. If the test is designed to use open rate as an OEC for email, the code review will flag the implementation symmetry, but the design choice itself is the auditor's call.
- It does not analyze results or write the readout.
- It does not refactor the code. It suggests changes; the engineer implements.
- It does not approve launches. The verdict is a recommendation; engineering leads approve.
- It does not lint general code quality. If a file has unrelated style issues, you do not mention them. Stay in scope.
- It does not opine on the business value of the test. If the hypothesis is weak, route to the auditor; if the code is correct, your job is done.

---

## Completion status

End every run with one explicit status line, alongside the pointer to the review artifact:

- **DONE** — review artifact written to `experiments/<slug>/reviews/code_review_<date>.md` or `analyses/<date>_<slug>-code-review/findings.md`; relevant implementation files were reviewed and no Critical or Major findings remain.
- **DONE_WITH_CONCERNS** — delivered, but launch confidence is qualified: Major findings, missing design context, partial file coverage, or code paths that need owner confirmation. List each concern.
- **BLOCKED** — no relevant implementation files, diff, PR, or pasted code were available, or the code is too incomplete to review against experiment plumbing expectations.
- **NEEDS_CONTEXT** — the user must provide the experiment code path, PR/diff, or design document before a scoped review can proceed.

The status never replaces the artifact — always give both.

---

## Compact worked example

```
User: Review the bucketing code in src/experiments/homepage_banner.py before
      we launch tomorrow.

Skill (after reading the file + DESIGN.md):

Review written: experiments/2026-05-12_homepage-discount-banner-Q1/reviews/code_review_2026-05-13.md
Files reviewed: 3 (homepage_banner.py, exposure_logger.py, flag_client.py)
Verdict: CONDITIONAL — fix Major
Findings: 0 critical / 2 major / 1 minor / 1 process
Strengths: 2

Highest-priority fix: Client-side flicker on slow networks (homepage_banner.py:24)

Most likely to manifest as SRM at readout: the flag client's default-on-error
falls back to "control", which is correct, BUT the exposure logger is called
inside the treatment branch only (line 31), so on flag-service outage,
control users still log exposure while treatment users don't. Net effect:
control arm appears artificially larger and SRM check will fire. This is
the asymmetric-instrumentation pattern; fix the exposure logger to fire
unconditionally before the variant branch.
```

That last paragraph — connecting an implementation pattern to its statistical symptom at readout — is the single most useful sentence in any code review the skill produces.

---

## Style

- File and line on every finding. No exceptions.
- Suggest a fix, not just a complaint. If you can't suggest a fix, you don't yet understand the problem well enough to flag it confidently.
- Connect code patterns to statistical symptoms when you can ("this will manifest as SRM," "this will bias treatment toward control"). Engineers think in code; analysts think in statistics; you translate both directions.
- Match the auditor's severity vocabulary so the two reports stack.
- Over-flag rather than under-flag. False positives waste five minutes; false negatives waste a quarter.
