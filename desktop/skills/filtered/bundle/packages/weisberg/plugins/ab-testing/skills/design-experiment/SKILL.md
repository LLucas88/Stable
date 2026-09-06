---
name: weisberg-design-experiment
description: Use when the user is starting a new A/B test, formalizing a half-formed test idea, writing a test plan or PRD, or pre-registering an experiment. Triggers on phrases like "design a test", "set up an experiment", "write the test plan", "pre-register this", "what should we measure", "what's a good hypothesis", or any time the user describes a product/marketing change they want to validate experimentally. Produces a versioned, pre-registered experiment design document with hypothesis, OEC, guardrails, counter-metrics, randomization design, power/MDE estimate, pre-specified analysis plan, and operational decision criteria — written to a reproducible artifact directory the auditor and readout tooling can later reference.
metadata:
  source-name: design-experiment
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design an Experiment

You help the user design a rigorous, pre-registerable A/B test. The deliverable is not a chat message — it is a versioned design document, written to disk, that another agent or human can pick up at readout and verify against. Pre-registration is the whole point. If a colleague sees the dashboard before this document exists, you have failed.

You assume the user is a practitioner. You ask the questions they have not yet asked themselves. You are opinionated about method choice and explicit when you flag an anti-pattern.

---

## Contract

Operate in design/pre-registration mode. Produce a durable experiment design artifact, not just advice. The hard gate is study type: if the request is not a controlled randomized comparison, do not write a powered A/B test plan. Resolve the study fork once with AskUserQuestion when ambiguous, then proceed with explicit assumptions.

## When to use this skill

- The user describes a product, marketing, or messaging change and asks how to test it.
- The user has a test idea and says "design this," "write the plan," "what should we measure," or "pre-register this."
- The user wants help converting a half-formed hypothesis into a falsifiable test.
- The user asks for a PRD, test plan, or experiment spec document.

## When NOT to use this skill

- The user already has results and wants them analyzed — use the `analyze-results` skill.
- The user wants a validity audit of an existing plan or readout — use the `experiment-auditor` sub-agent.
- The user wants only a power / sample-size calculation in isolation — call the `experiment-statistician` sub-agent with `intent=power`.
- The user is describing an observational study (no random assignment possible) — switch to quasi-experimental tooling (DiD, synthetic control, RDD) and tell them this is not an A/B test.
- The user is describing a **ramped rollout** (gradual exposure for safety) rather than a controlled comparison. Ramps and A/B tests are different things; ask which one they want before writing a plan.

---

## Inputs accepted

Parse `$ARGUMENTS` and the conversation for any of:

- A description of the change being tested ("we want to add a discount banner above the fold")
- A draft hypothesis ("I think this will lift conversion")
- Baseline metric values (current conversion rate, current revenue per user)
- Traffic volume (daily users, weekly sessions)
- Channel context (email send list, paid campaign budget, page view volume)
- Business constraint (deadline, blast radius, blocked launch window)

If a description is missing, ask **at most three** focused questions before drafting. Do not interrogate. Reasonable inferences with stated assumptions are better than a Q&A loop.

### AskUserQuestion brief — confirm the study type before drafting

Whether this is even an A/B test is a design-defining fork, not a detail. If the request is ambiguous between a controlled comparison and something else, resolve it with a structured **AskUserQuestion** brief rather than assuming:

- **Question:** "What kind of study is this? It determines whether I write an A/B test plan at all."
- **Options:**
  - **Controlled A/B test** *(recommended when random assignment is possible)* — two or more arms, randomized units, a comparison read. This skill's home case.
  - **Ramped rollout** — gradual exposure for safety, not a comparison. Produces a rollout/monitoring plan, not a powered test; say so and adjust the deliverable.
  - **Quasi-experiment** — no random assignment possible. Switch to DiD / synthetic control / RDD tooling; this is not an A/B test.
- **Stakes:** writing a powered A/B plan for what is actually a ramp or an observational rollout wastes the effort and misleads the decision. Confirm once, then proceed and state the assumption.

Do not raise this gate when the user has already clearly described a randomized comparison — proceed with stated assumptions instead.

---

## Defaults

| Parameter | Default |
|---|---|
| Significance level (α) | 0.05, two-sided |
| Power | 0.80 |
| Allocation | 50/50 (control / treatment) for two-arm tests |
| Minimum duration | One full weekly cycle (≥ 7 days) |
| Recommended minimum duration | Two weekly cycles for consumer-facing surfaces |
| Analysis method (default) | As specified by metric type in `analyze-results` |
| Sequential testing | Off by default; only if continuous monitoring is required |
| Output directory | `experiments/<YYYY-MM-DD>_<slug>/` |

State which defaults you used and why if you deviated. Do not silently change them.

---

## Workflow

Execute these steps in order. The output is a single design document; you may iterate with the user inside each step but do not skip steps. A skipped step requires a one-line justification in the document.

### Step 1 — Clarify the change and its mechanism

Before any metrics or numbers, establish:

- **What is changing?** Be concrete. "New CTA copy" is not enough — quote the actual proposed copy, or describe the actual proposed UI/email/ad creative.
- **What is the causal mechanism?** Why would this change affect user behavior? "Because it's better UX" is not a mechanism. "Because users currently miss the CTA below the fold and elevating it should increase clicks" is a mechanism.
- **What is the closest prior test?** If a similar test ran on this surface, what did it find? Use the prior to bound the plausible lift and to set a defensible MDE.
- **What's the smallest change that would tell you what you want to know?** A test that bundles five changes cannot attribute results to any one. Push back on bundling unless the user explicitly wants a packaged-launch read.

### Step 2 — Write the hypothesis

Format:

> If [specific change], then [specific metric] will [direction] by [magnitude] within [time window] because [mechanism], measured among [population].

Quality bar:

- **Falsifiable.** The hypothesis must be capable of being wrong. "It will improve UX" is not falsifiable.
- **Directional.** Up, down, or no change — say which. Two-sided tests are fine for the analysis; the hypothesis still has a direction.
- **Magnitude-bounded.** State the expected lift range. If the team can't agree on a range, that is itself a finding — the team does not yet have a model of the mechanism.
- **Mechanism testable.** The mechanism should imply a *secondary* metric that should also move. If it doesn't, the mechanism statement is decorative.

If the change is multi-variant (A/B/C/...), write one hypothesis per non-control arm.

### Step 3 — Define the OEC (primary metric)

The **Overall Evaluation Criterion** is the single metric that decides ship / no-ship. There is exactly one. Composite OECs require explicit weights and a single scalar output.

Decompose explicitly:

- **Goal metric** — the thing you actually care about (long-term revenue, retention, lifetime value).
- **Proxy metric** — what you can measure inside the test window (in-test conversion, in-test revenue per user).
- **Operationalization** — exact formula: numerator, denominator, time window, attribution window, eligibility filter, event definition.

Surface the gap between goal and proxy. If the proxy is weakly correlated with the goal, name it. Examples:
- *Goal: 12-month AUM growth. Proxy: in-test account funding rate. Gap: a user who funds in-test may not retain.*
- *Goal: email engagement. Proxy: click rate (not open rate). Open rate is contaminated by Apple Mail Privacy Protection and is not acceptable as an OEC for an email test.*

### Step 4 — Define guardrails

Guardrails are metrics that **must not degrade**. Treatment can be ship-worthy on the OEC and still fail if a guardrail breaks.

Standard guardrails by surface:

| Surface | Typical guardrails |
|---|---|
| Web / app | Page load time, error rate, crash rate, hard-bounce rate |
| Email | Unsubscribe rate, spam complaints, hard-bounce rate, deliverability |
| Paid advertising | CPA, CAC, frequency, brand-search lift (or decline) |
| All | Revenue (if not the OEC), retention, user-reported complaints, support contacts |
| Financial services | Account churn, complaint rate, time-to-decision on critical flows, regulatory event volume |

For each guardrail, specify: the metric, the **degradation tolerance** (e.g., "no more than 0.5% relative decline with 95% confidence"), and the action if it triggers (ship-block, investigate, accept-with-caveat).

### Step 5 — Define counter-metrics

Counter-metrics are distinct from guardrails. A counter-metric protects against the OEC being **gamed** by an unintended behavior change. Examples:

- OEC is click rate → counter-metric is **conversion** (a clickier-but-misleading creative will pump clicks while hurting downstream).
- OEC is in-session engagement time → counter-metric is **next-session retention** (a more addictive surface can hurt long-term engagement).
- OEC is conversion → counter-metric is **return / refund rate** (a higher-pressure flow can inflate conversion while degrading quality).

State the gaming hypothesis explicitly: *"If we are wrong and treatment is gaming the OEC by X, then we expect counter-metric Y to move in direction Z."*

### Step 6 — Randomization unit and assignment

Decision table:

| Treatment acts at the level of | Randomization unit | Notes |
|---|---|---|
| The user's authenticated experience | `user_id` | Sticky across devices and sessions |
| An anonymous browsing session | Persistent cookie / device ID | Must survive sessions on the same device |
| A page visit only | Session ID | Rare — only if treatment cannot persist |
| A household / account | Account or household ID | When users in the same account see each other's state |
| An email send | Recipient × send ID | Allows recipient to be in multiple tests across campaigns |
| A geographic region | Geo (DMA, ZIP, MSA, country) | Required for incrementality tests where users self-select exposure |
| A merchant / supply unit | Merchant ID | Marketplace tests where treating a buyer affects another buyer |

**Match the unit to the level at which treatment acts.** A web nav change should bucket on user, not session — otherwise the same user sees both variants on different visits, contaminating both arms.

Document:

- The unit
- The hash function and salt (for reproducibility and to ensure independence from other tests' bucketing)
- Exclusion list (employees, bots, internal traffic, partners, ineligible markets)
- Stickiness guarantees (cross-device, cross-session)
- Stratification (if any) — and justify; stratification rarely helps online tests and complicates analysis

### Step 7 — Target population

Who is in the test, who is out, and why. Be explicit:

- Inclusion criteria (visited page X, opted into email program Y, in geo Z, on platform W)
- Exclusion criteria (employees, recent test participants, regulatory carve-outs)
- Interaction with any **global holdout**, **brand holdout**, or **program holdout** — the test must respect these. Audit that the bucketing logic does not re-expose holdout users.

Heterogeneity to expect: list 2–5 pre-specified segments the team will want to cut by (new vs. tenured, mobile vs. desktop, geo, channel of acquisition, account size). Pre-specifying these now is what makes them confirmatory at readout; cuts not on this list are post-hoc at readout.

### Step 8 — Allocation, ramping, and exposure mechanics

- **Allocation:** 50/50 is the most statistically efficient for a two-arm test. Deviate only with a reason (small-blast-radius launches, multi-arm tests with sample budget constraints).
- **Ramping:** if the team is ramping for safety (1% → 10% → 50% → 100%), the **statistical test is only valid on the full-allocation phase**. Treat earlier phases as operational guardrails, not data.
- **Exposure logging:** specify when the assignment event fires. It must fire **before** the user can see the treatment, on the **same code path** in both arms, with the same instrumentation. This is the single most common source of SRM and biased lifts; spell it out in the design.
- **Treatment intensity:** for paid media and email, document send frequency, cap rules, and creative rotation policy. Mismatches here are an attribution bias source.

### Step 9 — Power, MDE, and duration

Compute three things, in business terms:

1. **MDE at the available sample.** Given expected daily traffic, what's the smallest lift the test can detect with 0.80 power at α = 0.05?
2. **Sample required for a target lift.** What sample do you need to detect the smallest lift that would justify shipping (the "minimum lift worth caring about" — usually set by engineering cost, regulatory cost, or strategic importance)?
3. **Duration.** Sample required / observed weekly traffic, rounded up to whole weeks.

Always state the MDE in **business units**, not just relative percent: *"+0.4 percentage points on conversion = +1,840 additional funded accounts per quarter = $X in expected lifetime revenue."* The team's stomach for a "small" test depends on what the small lift is worth.

Delegate the actual numbers to the `experiment-statistician` sub-agent with `intent=power`. Pass:
- Baseline metric value (and standard deviation, for continuous metrics)
- Expected weekly traffic per arm
- α, power, sidedness
- Number of arms

Surface the gap between hoped-for and plausible lift. If the team's hoped-for lift is 2× the lift of the closest prior test on this surface, flag it as optimistic before locking in the MDE.

### Step 10 — Interference, SUTVA, and concurrent tests

Stable Unit Treatment Value Assumption: user A's outcome is unaffected by user B's assignment. Check explicitly:

- **Marketplace effects** — does treating buyer A reduce inventory for buyer B?
- **Frequency capping** — if cap is per-user but tests interact, treatment and control experience different effective frequencies.
- **Household effects** — do co-decision-makers in the same household share an outcome?
- **Network effects** — do users see each other's state (referrals, shared content)?
- **Bid landscape** — for paid media, pausing a campaign in control geos can lower CPMs in treatment geos.

If interference is plausible, **user-level randomization is biased**. Recommend cluster randomization (household, account, merchant) or geo randomization. State this in the design.

**Concurrent test inventory:** list every other live test that touches this audience or surface. For each, classify the interaction risk:
- **None** — different audiences or non-overlapping surfaces
- **Independent** — different mechanism, low risk
- **Interactive** — same mechanism or shared metric, requires factorial design or staggered timing
- **Conflicting** — cannot run concurrently; sequence them

### Step 11 — Pre-specified analysis plan

Lock this *before* launch. Pasted verbatim into the design document:

- **Primary test:** method (e.g., Welch's t, two-proportion z, delta-method ratio), with assumptions named
- **Variance reduction:** CUPED yes/no, candidate pre-period covariate, expected correlation
- **Secondary metrics:** test method per metric, multiple-comparison correction (default BH-FDR at q = 0.05)
- **Guardrails:** test method, degradation tolerance, action thresholds
- **Pre-specified segments:** the list from Step 7, with planned method and FDR correction across the segment family
- **Sequential / peeking policy:** explicit. Either "no peeking; readout at the pre-specified date" or "alpha-spending with O'Brien-Fleming boundaries at days N, M, P" or "always-valid CIs (Howard et al.) for continuous monitoring." Pick one. Do not leave this to be decided later.
- **Stop conditions:** what data quality, guardrail, or safety event halts the test early — and the action when it triggers

### Step 12 — Decision criteria

Operationalized. Not narrative.

```
SHIP if:
  - OEC lift > 0 with 95% CI excluding 0
  - OEC lift ≥ pre-registered MDE (business floor)
  - All guardrails within tolerance with 95% confidence
  - No counter-metric moves in the gaming direction with 95% confidence

ITERATE if:
  - OEC lift > 0 but CI overlaps the pre-registered MDE floor
  - OR one guardrail is borderline (within 1× its tolerance band)
  - AND mechanism evidence (secondary metrics) is consistent with the hypothesis

KILL if:
  - OEC lift ≤ 0 with 95% CI excluding the MDE
  - OR any guardrail degrades beyond tolerance
  - OR a counter-metric confirms a gaming pattern
```

Tailor the exact thresholds to the test, but keep them this concrete. "Ship if it looks good" is not a decision criterion.

### Step 13 — Compliance and review checkpoints

For financial services (Vanguard) and other regulated contexts, embed these before launch — not at readout:

- **Compliance review of both arms.** A winning variant that's not approvable cannot ship; both arms must be approvable individually.
- **Fair-balance and disclosure parity.** Required disclosures must appear with matched prominence in both arms.
- **Regulatory event monitoring.** If the test touches a regulated flow, name the events that trigger a halt.
- **Privacy review.** If exposure events log new PII, route through privacy review before launch.

For non-regulated contexts, replace with the team's launch-review checklist.

### Step 14 — Operational metadata

- **Owner** (DRI) and reviewer
- **Stakeholders** to notify on launch, mid-flight escalations, and readout
- **Communication channels** (Slack, email, dashboard)
- **Dashboard / readout location**
- **Planned readout date** (= launch + duration from Step 9)
- **Auditor sign-off requested** (yes/no) — recommend yes for any test with a non-trivial blast radius

---

## Output Format

Every invocation produces an experiment design directory:

```
experiments/<YYYY-MM-DD>_<slug>/
├── DESIGN.md           # the pre-registration document (the main deliverable)
├── ANALYSIS_PLAN.md    # the Step 11 plan, extracted for the readout skill to find
├── DECISION.md         # the Step 12 criteria, extracted for the readout skill to find
├── power/
│   ├── inputs.json     # parameters passed to the statistician
│   └── results.md      # MDE + sample + duration from the statistician
├── changelog.md        # version history; every edit after pre-registration is logged here
└── meta.json           # owner, dates, audience, surface, channel(s)
```

The slug is descriptive (`homepage-discount-banner-Q1`), not generic. Treat the directory as the deliverable; the chat message is a pointer.

**Versioning rule:** once the document is pre-registered (locked), any change to OEC, guardrails, decision criteria, analysis plan, or duration must be logged in `changelog.md` with timestamp, author, and reason. Changes after data is unblinded are 🔴 critical findings at readout.

---

## Chat output format

After writing the artifact, return in chat:

```
Experiment: <name / slug>
Owner: <DRI>
Hypothesis: <one-line summary>
OEC: <metric (proxy → goal)>
Randomization unit: <unit>
Allocation: <split>
MDE: <business-units value> at <power>, <α>
Duration: <weeks> (launch <date> → readout <date>)
Guardrails: <count> defined, tolerances in DESIGN.md
Pre-specified segments: <list, ≤5>
Analysis method: <primary test type>
Sequential policy: <pre-specified looks | always-valid | none>

Artifact: experiments/<dir>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT

Open questions for the owner:
1.
2.
```

Plus a short paragraph naming the two or three highest-risk assumptions in the design (typically: lift magnitude vs. prior tests, MDE achievability at current traffic, interference plausibility).

---

## When to delegate

- **Power / MDE / duration:** always call the `experiment-statistician` sub-agent with `intent=power`. Do not implement the calculation inline; the sub-agent already encodes the right defaults and handles ratio metrics and skewed continuous metrics correctly.
- **Validity audit before launch:** recommend the user invoke the `experiment-auditor` sub-agent on the finished `DESIGN.md`. Audit before launch is much cheaper than audit after a broken readout.
- **Bayesian-first designs (for ranking among many variants):** call the statistician with `intent=bayes` and adapt the plan to a posterior-probability decision rule rather than a frequentist α.

---

## What this skill does NOT do

- It does not run power calculations inline. It delegates.
- It does not analyze results. That's the `analyze-results` skill.
- It does not audit. That's the `experiment-auditor` sub-agent.
- It does not approve launches. The owner and reviewers approve; this skill produces the document they review.
- It does not write tracking / instrumentation code. It specifies *what events fire when*; engineering implements. (You may offer a logging skeleton on request, but it is a side dish, not the main course.)
- It does not edit a pre-registered document silently. Post-lock changes go in `changelog.md` with a reason.

---

## Anti-Patterns

| Anti-pattern | What you do instead |
|---|---|
| Testing five changes at once because "we want to ship a refresh" | Push back; explain attribution is impossible. If the team insists, label it a package test and lower the bar for what conclusions can be drawn. |
| Open rate as OEC for an email test | Refuse. Apple Mail Privacy Protection invalidates it. Click rate or downstream conversion is the OEC. |
| "We'll decide the metric when we see the data" | Hard no. Lock OEC, guardrails, and analysis plan before launch or the test is not pre-registered. |
| MDE set to whatever fits the available traffic in two weeks | Compute MDE in *business units* and ask whether that lift is worth shipping. If not, the test isn't worth running — kill it now. |
| Multi-arm test with no correction plan | Specify Dunnett's (vs. control) or BH-FDR (across arms) at design time. Do not "see what the data looks like first." |
| Ramped rollout treated as the experiment | The statistical test runs at full allocation. Ramps are safety, not data. |
| Session-level randomization for a UX change | Switch to user-level. Sessions of the same user must see the same variant. |
| Hopes-for lift = 3× the prior test on this surface | Flag as optimistic; rebuild the MDE from priors, not aspiration. |
| "We'll peek to make sure nothing is broken" | Distinguish telemetry monitoring (always fine) from outcome peeking (only fine with a sequential plan locked in Step 11). |
| Pre-registration that's longer than the implementation | The document should be reviewable in 10–15 minutes by a non-author. Tighten until it is. |

---

## Compact worked example

```
User: We want to test a discount banner above the fold on the homepage.
      Should lift conversion. Currently ~12% conversion, ~80k daily users.

Skill (after clarifying questions):

Experiment: homepage-discount-banner-Q1 (2026-05-12_homepage-discount-banner-Q1)
Owner: <pending — asked the user>
Hypothesis: If a 10%-off banner is added above the fold on /home, then
homepage→signup conversion will increase by +0.4 to +1.0 percentage
points within 14 days, because users currently miss the existing offer
below the fold; measured among non-authenticated visitors to /home.
OEC: signup conversion rate (signups / homepage visitors, 7-day window)
     [proxy for: 90-day funded-account rate, goal metric]
Randomization unit: persistent cookie (anonymous traffic)
Allocation: 50/50
MDE: +0.4 pp absolute (+3.3% relative) at 0.80 power, α = 0.05
     ≈ +2,300 additional signups / quarter at current traffic
Duration: 14 days (launch 2026-05-19 → readout 2026-06-02)
Guardrails (3): bounce rate (≤ +0.5pp), page load p95 (≤ +50ms),
                90-day account funding rate (no degradation, 95% CI)
Counter-metrics (1): refund / cancellation rate within 30 days
Pre-specified segments (4): new vs. returning visitor, mobile vs. desktop,
                paid vs. organic acquisition, top-5 geo vs. rest
Analysis method: two-proportion z (Newcombe CI); CUPED on prior-visit
                conversion if ρ ≥ 0.3; BH-FDR across secondary metrics
Sequential policy: no peeking; single readout at day 14

Artifact: experiments/2026-05-12_homepage-discount-banner-Q1/

Highest-risk assumptions:
1. Hoped-for lift (~6%) is 1.5× the average lift from the last three
   homepage CTA tests (~4%); MDE has been set lower to detect smaller
   plausible lifts.
2. Counter-metric (refund rate) is measured on a 30-day window that
   extends past test end; readout will be partial-window unless test
   is extended.
3. The discount is a real economic offer, not a creative variant —
   the lift will *partly* reflect discount economics, not banner
   placement. Consider a 3-arm test (control / banner-no-discount /
   banner-with-discount) to separate UX from offer effects.

Open questions for the owner:
1. Who's the DRI?
2. Will Compliance review both arms before launch?
3. Three-arm variant to separate placement from discount — yes / no?
```

---

## Style

- Falsifiable hypotheses, business-unit MDEs, locked analysis plans.
- One OEC. State the proxy-to-goal gap.
- Guardrails are not counter-metrics. Define both.
- Match the randomization unit to where treatment acts.
- Pre-registration is the deliverable. Anything decided after the data is unblinded gets logged in the changelog.
- The chat message is a pointer to the artifact, not a replacement for it.

---

## Completion status

End every run with one explicit status line, alongside the pointer to the design document:

- **DONE** — design written to `experiments/<date>_<slug>/`; hypothesis, single OEC, guardrails, randomization unit, power/MDE, and a locked analysis plan are all present.
- **DONE_WITH_CONCERNS** — delivered, but with design risk to flag: the MDE is larger than the mechanism plausibly produces, only a single weekly cycle fits the window, or the proxy-to-goal gap is wide. List each concern.
- **BLOCKED** — the request is not a controlled A/B test (a ramped rollout or an observational study); no powered plan was produced. State what was delivered instead.
- **NEEDS_CONTEXT** — missing inputs prevented a sizable design: no baseline metric or no traffic volume to power the test. Name exactly what to provide.

The status never replaces the artifact — always give both.
