---
name: weisberg-sample-size
description: Use when the user needs to calculate the required sample size, duration, or minimum detectable effect (MDE) for an A/B test. Triggers on phrases like "how many users do I need", "what sample size", "calculate MDE", "how long should this test run", "do we have enough traffic", "is this test feasible", "power calculation", or any planning question that involves trading off effect size, sample, and duration. Produces a reproducible sample-size artifact with the headline n-per-arm + duration, a two-direction sensitivity table (n at multiple MDEs, MDE at multiple durations), adjustments for CUPED / cluster designs / multiple comparisons / sequential testing, and the MDE translated into business units. Delegates to the `experiment-statistician` sub-agent for ratio metrics, heavily skewed continuous metrics, and cluster-randomized designs that require simulation.
metadata:
  source-name: sample-size
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Calculate Sample Size and Experiment Duration

You compute the sample size, duration, and MDE for an A/B test. The goal is not just a number — it is a number with the assumptions visible, the sensitivities mapped out, and the MDE translated into something the business actually cares about (accounts, dollars, sessions).

A power calculation that comes back with "you need 412,330 users per arm" and no further context is a failure. The user needs to know: what does that mean in days? What lift is that detecting? Is that lift worth shipping if we find it? What if we accept a larger MDE — can we get there in two weeks instead of six? You answer all of those.

You are the human-facing entry point for power calculations. The `experiment-statistician` sub-agent's `power` intent is the agent-to-agent entry point that does the same job programmatically when called by `design-experiment` or another agent. They produce the same numbers; same logic, different surface.

---

## Contract

Operate in planning/power mode. Produce a reproducible sample-size artifact with assumptions, sensitivity tables, and business-unit translation. Hard gates are metric type and input clarity: delegate ratio, skewed, clustered, or non-standard sequential designs rather than forcing a weak closed-form; ask once when baseline/MDE/traffic inputs are ambiguous.

## When to use this skill

- The user is designing a test and asks how many users / days / sessions they need.
- The user has a fixed traffic window and asks what lift the test can actually detect.
- The user is deciding whether a test is feasible — *"can we run this in two weeks?"*
- The user wants to weigh smaller-MDE-longer-duration vs. larger-MDE-shorter-duration tradeoffs.
- The user asks "what's our MDE on this surface" as a general planning question.

## When NOT to use this skill

- The user has results and wants them analyzed — use `analyze-results`.
- The user wants a full experiment design (hypothesis, OEC, guardrails, plan) — use `design-experiment`, which will call this skill (or the statistician sub-agent) as one of its steps.
- The user wants a validity audit of an existing power calculation — use the `experiment-auditor` sub-agent.
- The user asks for power on a ratio metric, a heavily skewed continuous metric, a cluster-randomized design, or anything that needs simulation — **delegate to `experiment-statistician` with `intent=power`** rather than approximating with the wrong closed-form.

---

## Inputs accepted

Parse `$ARGUMENTS` and the conversation for any of these. Use defaults where noted.

| Parameter | Description | Default |
|---|---|---|
| **Baseline value** | Current proportion, mean, or rate | _required_ |
| **Baseline std dev** | For continuous metrics only | _required for continuous_ |
| **MDE** | Minimum detectable effect (absolute or relative — specify which) | _required, unless solving the inverse problem_ |
| **Available traffic** | Daily / weekly users (or total) | _optional but recommended_ |
| **Available time window** | Days available for the test | _optional_ |
| **Significance level (α)** | Type I error rate | 0.05 |
| **Statistical power (1 − β)** | Probability of detecting a true effect | 0.80 |
| **Number of arms** | Including control | 2 |
| **Allocation** | Per-arm share, must sum to 1 | Equal across arms |
| **Sidedness** | One-sided or two-sided | Two-sided |
| **CUPED expected correlation** | ρ between pre-period and in-period outcome | None |
| **Cluster randomization** | If yes, average cluster size and ICC | No cluster |
| **Multiple primary metrics** | If > 1, count and correction method | 1 (no correction) |
| **Sequential testing** | If yes, framework (alpha-spending, mSPRT, always-valid) | None |

Parse expressions like `"baseline 5% mde 10% relative"` or `"baseline conversion 0.12, want to detect 0.5pp absolute"`. Ask one clarifying question if the input is ambiguous (relative vs. absolute MDE is the most common ambiguity).

---

## Workflow

### Step 0 — Identify the metric type

Before any formula, identify which one applies:

- **Proportion** — binary outcome aggregated to a rate (conversion, click-through, retention).
- **Continuous (well-behaved)** — real-valued with reasonable distribution (session duration, page views).
- **Continuous (skewed)** — revenue, AUM, session time on long-tail. Closed-form formulas overstate power here. **Delegate to `experiment-statistician` with `intent=power`** and have it simulate from an empirical pre-period distribution.
- **Ratio (shared denominator)** — clicks/impressions, revenue/session where the denominator varies per unit. Requires delta-method variance from per-unit data. **Delegate.**
- **Count / rate** — events per user. Closed-form approximations exist (Poisson) but are usually less defensible than bootstrap from pre-period. Delegate unless the user explicitly wants the closed-form.

State which type you're using and why. Do not silently apply the wrong formula.

### Step 1 — Validate inputs and convert to absolute MDE

- **Relative vs. absolute MDE.** Convert to both forms and state them. A 10% relative MDE on a 5% baseline = a 0.5 percentage point absolute lift. *Most teams confuse these in conversation; surface the conversion explicitly.*
- **One-sided vs. two-sided.** One-sided is rarely defensible in a real test (you almost always care about both directions, even if you only hope for one). Default two-sided. If the user requests one-sided, ask once whether they're sure — the practical cost (less than 20% sample savings) is rarely worth the credibility hit if the lift turns negative.
- **MDE realism check.** If the user's MDE is more than 2× the typical lift on this surface in prior tests (where known), flag it as optimistic. You don't refuse to compute, but you note that the sample assumed here will be insufficient if real lifts are smaller.

### Step 2 — Compute the headline result

For **proportions** (two-sample z, equal allocation), use the standard formula:

```
n per arm = (Z_{α/2} + Z_β)² · [p₁(1−p₁) + p₂(1−p₂)] / (p₂ − p₁)²
```

Where p₁ = baseline, p₂ = baseline ± absolute MDE. For two-sided α = 0.05 and power = 0.80, Z_{α/2} = 1.96 and Z_β = 0.84.

For **continuous means** (two-sample t, equal allocation):

```
n per arm = 2 · σ² · (Z_{α/2} + Z_β)² / δ²
```

Where σ is the within-arm std dev (assumed equal across arms) and δ is the absolute MDE on the mean.

Implementation: use `statsmodels.stats.power.NormalIndPower` (proportions, via arcsine effect size or directly via `proportion_effectsize`) and `statsmodels.stats.power.TTestIndPower` (continuous). State that statsmodels handles slight refinements (arcsine variance-stabilizing transform for proportions, t-vs-z critical values for small n) that the formula above abstracts away.

Report:

- **n per arm** (rounded up)
- **Total n** (n per arm × number of arms, adjusted for non-equal allocation if specified)
- **Duration** = total n / daily traffic, rounded up to whole days
- **Recommended minimum duration**: 7 days for a full weekly cycle; 14 if the surface is consumer-facing with strong weekday effects

If both required sample and available traffic are given, report **both** the time needed for the requested MDE *and* the MDE achievable in the available time window. Users almost always want both even when they only ask for one.

### Step 3 — Translate MDE to business units

This is non-optional. A relative percent is not actionable on its own.

Examples:

- *"+0.4 pp on signup conversion = ~2,300 additional signups per quarter at current traffic = $X expected lifetime value."*
- *"+$1.20 in revenue per user per month = ~$14M/year at current MAU."*
- *"+2% relative on email click rate = ~18,000 additional clicks per send = ~210 additional accounts funded per send at current click-to-fund."*

If the user hasn't given you the goal-metric translation factor (conversion-to-funded rate, click-to-revenue, etc.), ask, or use a stated assumption clearly labeled. *"At an assumed conversion-to-funded rate of 50%, +0.4 pp signup lift translates to roughly X funded accounts."*

The point of this step: if the answer is "the smallest detectable lift is worth less than the engineering cost of running the test," the test is not worth running. Surfacing this here saves the team six weeks.

### Step 4 — Build a two-direction sensitivity table

Most teams want this and don't realize it until they see it. Build **both** tables:

**Table A: Sample size at multiple MDEs** (the original skill's table)

| Relative MDE | Absolute MDE | n per arm | Total n | Duration (days) | MDE in business units |
|---|---|---|---|---|---|
| 1% | … | … | … | … | … |
| 2% | … | … | … | … | … |
| 5% | … | … | … | … | … |
| 10% | … | … | … | … | … |
| 20% | … | … | … | … | … |

**Table B: MDE at multiple durations** (the inverse, often more useful)

| Duration (days) | Total n at current traffic | Detectable MDE (relative) | Detectable MDE (absolute) | MDE in business units |
|---|---|---|---|---|
| 7 | … | … | … | … |
| 14 | … | … | … | … |
| 21 | … | … | … | … |
| 28 | … | … | … | … |
| 42 | … | … | … | … |

Together these give the user the full feasibility map: *here's what we can detect in each candidate test window, and here's how long we'd have to run to detect each candidate effect size.*

### Step 5 — Apply adjustments

Apply these in order and show the running sample size at each step.

**CUPED variance reduction** (if a pre-period covariate is expected with correlation ρ):

```
n_adjusted ≈ n_unadjusted · (1 − ρ²)
```

- ρ = 0.3 → ~9% sample reduction
- ρ = 0.5 → 25% reduction
- ρ = 0.7 → ~50% reduction
- ρ = 0.9 → ~80% reduction

Report unadjusted n alongside CUPED-adjusted n. The unadjusted is the worst case; the adjusted is the expected case if the covariate behaves as predicted. State that the CUPED estimate requires verifying ρ on pre-period data — the sample-size skill cannot validate ρ itself.

**Cluster randomization design effect** (if randomization is at cluster level — geo, household, account):

```
DEFF = 1 + (m − 1) · ρ_ICC
n_adjusted = n_unadjusted · DEFF
```

Where m = average cluster size, ρ_ICC = intraclass correlation. For typical geo-experiments at the DMA level with hundreds of users per geo, DEFF can be 5–50×, which dramatically changes feasibility. Cluster designs almost always require **far** more traffic than user-level randomization; if the user is considering cluster randomization, this adjustment is the headline.

**Multiple primary metrics correction.** If the team has K primary metrics, the family-wise α budget is split:

- **Bonferroni:** α_adjusted = α / K. Conservative. Sample inflation factor ≈ (Z_{α/(2K)} + Z_β)² / (Z_{α/2} + Z_β)².
- **Šidák:** α_adjusted = 1 − (1 − α)^(1/K). Slightly less conservative than Bonferroni.
- **BH-FDR:** does not change the per-test α at design time; affects readout interpretation. Skill does not adjust for it at design.

State the inflation factor explicitly. *"With 3 primary metrics and Bonferroni correction, required sample inflates by ~25% (from N to 1.25N)."*

**Multiple variants** (more than two arms). For pairwise-vs-control tests with K arms, **Dunnett's correction** is more powerful than Bonferroni; sample inflation is less. For all-pairs comparisons across K arms, the family is K(K−1)/2 tests; Bonferroni is conservative; Tukey HSD-equivalent is the standard.

**Sequential testing.** If the user is planning to peek with a pre-specified framework:

- **O'Brien-Fleming alpha-spending** with K interim looks: sample inflation ~ 1.05–1.15× for K=2–5 looks. Mostly free.
- **Always-valid CIs (Howard et al.):** inflation ~1.1–1.2× for typical settings.
- **mSPRT:** depends on the mixture variance; ~1.1–1.3×.

Closed-form approximations exist but are involved. For specific framework + look-count combinations, **delegate to `experiment-statistician` with `intent=sequential`** which can compute the inflation factor for the user's actual planned looks.

### Step 6 — Reality checks and warnings

Run these checks and emit warnings as appropriate. Each warning should explain *why* it matters, not just that something is unusual.

- **Very large sample (> 1M / arm).** "The MDE may be smaller than is practically meaningful, or the metric may be noisier than expected. Consider whether a 1%-relative lift is worth running a six-month test."
- **Very short duration (< 7 days).** "The test will not cover a full weekly cycle. Day-of-week effects can dominate the signal. Extend to at least 7, ideally 14 days for consumer surfaces."
- **Very long duration (> 8 weeks).** "Novelty effects may decay over the test window, biasing the average lift. Population composition may also shift. Consider whether the surface is stable enough."
- **Low baseline (< 1% conversion).** "Proportion tests lose power at extreme baselines. Required sample is large and small absolute differences are hard to detect reliably. Consider whether the OEC should be reframed."
- **MDE smaller than typical noise on this surface.** "If the test surface has a typical week-to-week swing of X% absent any change, an MDE smaller than X% is below the noise floor. The result will be hard to interpret as causal."
- **One-sided test requested.** "One-sided tests save modest sample (~15-20%) but lose the ability to detect harmful effects. Two-sided is the convention for a reason; reconsider."
- **Sequential testing with > 5 interim looks.** "Each look spends α. Many interim looks erode the power for the final analysis. Consider fewer, well-placed looks (O'Brien-Fleming) over many."
- **Cluster design with small number of clusters.** "Fewer than ~20 clusters per arm makes the design-effect-adjusted sample sensitive to cluster-level heterogeneity. Consider whether geo-experiment methods (synthetic control, MarketMatch) are more appropriate than user-level n with cluster correction."

### Step 7 — Write the reproducible artifact

Output to:

```
experiments/<slug>/power/        # if experiment dir exists
  inputs.json                    # all parameters used
  results.md                     # the headline + tables + adjustments
  sensitivity.csv                # the two sensitivity tables as data
  power_curve.png                # detectable effect vs. sample size, optional
  analysis.py                    # reproducible code

# or, if no experiment dir
analyses/<YYYY-MM-DD>_<slug>-power/
  (same structure)
```

The `analysis.py` is a runnable script that recomputes every number in the report. Use `statsmodels.stats.power` for the canonical implementations; use closed-form when more transparent.

---

## Output Format

After writing the artifact, return in chat:

```
Test: <slug>
Metric type: <proportion | continuous-mean | continuous-skewed→delegated | ratio→delegated>
Method: <e.g., two-sample z (proportions), Welch (continuous)>
α = 0.05, power = 0.80, two-sided, K = <arms> arms

Headline (unadjusted):
  Baseline:        <value>
  MDE (relative):  <%>   (absolute: <value>; business units: <translation>)
  n per arm:       <number>
  Total n:         <number>
  Duration:        <days> at <daily traffic> per day  (launch <date> → readout <date>)

Adjustments applied:
  CUPED (ρ = <value>):       n per arm → <reduced n>  (−<%>)
  Cluster (DEFF = <value>):  n per arm → <inflated n>  (+<×>)
  Multi-metric (K = <N>):    n per arm → <inflated n>  (+<%>)
  Sequential (<framework>):  n per arm → <inflated n>  (+<%>)

Recommended sample: <final n per arm>
Recommended duration: <days>

Warnings: <count>; see artifact
Artifact: <path>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

Plus a short paragraph naming the one or two assumptions most likely to invalidate this plan (typically: the assumed σ or baseline being too optimistic, the assumed traffic being unstable, the assumed CUPED ρ being unverified).

---

## When to delegate to `experiment-statistician`

This skill handles the common cases inline. Delegate via the Agent tool with `intent=power` when:

- The metric is a **ratio with shared denominator** — needs per-unit data and delta method.
- The metric is a **heavily skewed continuous** outcome (revenue, time-to-event with long tail) — closed-form overstates power; simulation from the empirical distribution is more honest.
- The design is **cluster-randomized** and the user needs an ICC-based simulation rather than a formula approximation.
- The user wants a precise **sequential alpha-spending** inflation factor for a non-standard boundary or look schedule.
- The user wants a **Bayesian-design** sample (e.g., "n such that posterior P(B > A) > 0.95 with high probability under the prior").
- The metric has known **zero-inflation** (lots of zero-revenue users, a few with high revenue) — needs two-part model assumptions.

When you delegate, pass: the metric type, the baseline (and std dev if relevant), the MDE, α, power, allocation, traffic, and any covariate / cluster / sequential parameters. Wait for the response and incorporate it into the artifact.

---

## What this skill does NOT do

- It does not validate the assumed baseline rate or σ against real data. The user is responsible for the inputs; the skill computes against them. If the baseline is wrong, the answer is wrong — and the warnings flag it but cannot fix it.
- It does not validate the assumed CUPED correlation. ρ must be measured on pre-period data; the skill assumes the user has done so or is willing to verify before relying on the CUPED-adjusted sample.
- It does not check whether the MDE is *worth* shipping. It surfaces the business-unit translation; the user decides if it's worth it.
- It does not author the full experiment design — only the power calculation. The design skill is `design-experiment`.
- It does not run the test or analyze results.
- It does not approve launches.

---

## Anti-Patterns

| Pitfall | What the skill does |
|---|---|
| User says "MDE 10%" but doesn't specify relative vs. absolute | Ask once, then convert and show both. |
| User assumes a baseline that's much higher than the surface actually produces | Report the calculation as requested; in warnings, note that overstated baselines underestimate required sample. |
| User wants one-sided to save sample | Comply with a comment; note that the savings (~15-20%) rarely justify the lost ability to detect harm. |
| User asks for power on revenue per user with no mention of skew | Note the skew assumption; recommend the statistician sub-agent's simulation-based estimate for any tail-sensitive metric. |
| User asks for "the MDE" without specifying duration | Compute MDE at the planned duration AND at 1, 2, 4 weeks — let them pick. |
| User wants to detect a lift smaller than the day-of-week noise | Flag it in warnings; recommend reframing the OEC or running long enough to average over multiple weeks. |
| User is planning cluster randomization and quotes user-level traffic | Stop, ask for cluster count and average cluster size, apply DEFF. The user-level numbers are misleading by 5–50×. |
| User wants "α = 0.10" to make the test feasible | Note that this is allowed but documented as a deviation from the org default and reduces credibility of the readout. Don't refuse, do flag. |
| User wants to peek but doesn't say sequential | Note that naive peeking is invalid; offer to plan with sequential α-spending and recompute. |
| User asks "what sample for 99% power" | Compute it; note that the marginal sample to go from 80% → 90% is modest, 90% → 95% is significant, 95% → 99% is large; suggest 80% is the standard floor and 90% is generous. |

---

## Compact worked example

```
User: We're testing a homepage banner. Current signup conversion is 12%.
      We hope to lift it by 5% relative. We get about 80,000 visitors per day.
      How long should we run?

Skill:

Test: homepage-banner-power (no experiment dir on file)
Metric type: proportion
Method: two-sample z, equal allocation
α = 0.05, power = 0.80, two-sided, 2 arms

Headline (unadjusted):
  Baseline:        12.0% conversion
  MDE (relative):  5%  (absolute: +0.6 pp → 12.6% in treatment)
  n per arm:       ~46,800
  Total n:         ~93,600
  Duration:        ~2 days at 80k/day

Recommendation: run for at least 14 days to capture two full weekly cycles,
even though the statistical sample is reached in 2. Day-of-week variance
on consumer signup surfaces typically exceeds the MDE on shorter windows;
a 2-day test will be dominated by day-of-week effects, not by the
treatment.

Sensitivity (Table A — n at multiple MDEs):

| Rel. MDE | Abs. MDE | n per arm | Duration | Business units (assumed 50% sign-to-fund) |
|---|---|---|---|---|
| 1%  | +0.12pp | ~1,160,000 | 29 days  | +120 funded/qtr |
| 2%  | +0.24pp | ~290,000   | 8 days   | +240 funded/qtr |
| 5%  | +0.60pp | ~46,800    | 2 days   | +600 funded/qtr |
| 10% | +1.20pp | ~11,700    | <1 day   | +1,200 funded/qtr |
| 20% | +2.40pp | ~2,900     | <1 day   | +2,400 funded/qtr |

Sensitivity (Table B — MDE at multiple durations):

| Duration | Total n  | Detectable rel. MDE | Detectable abs. MDE |
|---|---|---|---|
|  7 days | 560,000  | ~2.0% | +0.24pp |
| 14 days | 1,120,000| ~1.4% | +0.17pp |
| 21 days | 1,680,000| ~1.2% | +0.14pp |
| 28 days | 2,240,000| ~1.0% | +0.12pp |

Adjustments to consider:

- CUPED on prior-week signup behavior: if ρ ≈ 0.4, expected sample reduction ~16%.
  Would tighten the 14-day MDE from 1.4% to ~1.3% — modest gain on this volume.
- Multiple metrics: if signup is one of 3 primary metrics with Bonferroni,
  required n inflates ~25%. 14-day MDE rises to ~1.6%.

Warnings:
- The "2 days at MDE 5%" headline is statistically valid but operationally
  meaningless on a consumer surface. Do not actually run a 2-day test.
- Hoped-for 5% relative lift is large for a homepage CTA test; historical
  lifts on this surface average ~3%. If the real lift is 3%, the 14-day
  test will fail to reach significance with high probability. Consider
  budgeting for at least 21 days, sized for MDE ≈ 2%.

Artifact: analyses/2026-05-12_homepage-banner-power/

Highest-risk assumption: the hoped-for 5% relative lift is well above the
historical average for homepage CTA tests on this surface. The 14-day
test as sized assumes the lift is real and at-or-above 5%; if the true
lift is 3%, the test is underpowered and the null is uninterpretable.
Recommend re-sizing for MDE = 2% (21 days) before launch.
```

That highest-risk-assumption paragraph is the most useful single output of the skill. It connects "the math says 14 days is enough" to "the realistic lift on this surface means 14 days is *not* enough" — and saves the team from a planned-to-fail test.

---

## Style

- Two-direction sensitivity, every time. Sample-vs-MDE *and* MDE-vs-duration.
- MDE in business units. Always.
- Adjustments shown step by step — unadjusted → CUPED → cluster → multi-metric → sequential → recommended.
- Warnings explain *why*, not just *that*.
- Closed-form when transparent; delegate to the statistician when honest.
- The chat output is a pointer to the artifact, not a replacement for it.

---

## Completion status

End every run with one explicit status line, alongside the pointer to the sample-size artifact:

- **DONE** — sample-size artifact written to `experiments/<slug>/power/` or `analyses/<date>_<slug>-power/`; required inputs were clear, the metric type matched an inline method, and sample, MDE, duration, sensitivities, and business-unit translation are present.
- **DONE_WITH_CONCERNS** — delivered, but feasibility is qualified: short/long duration risk, optimistic MDE, unverified baseline or CUPED correlation, one-sided test request, or a design adjustment that materially changes the headline n. List each concern.
- **BLOCKED** — a defensible calculation cannot be produced inline because required numeric inputs are absent or the metric/design requires delegation and no usable data/parameters were provided.
- **NEEDS_CONTEXT** — baseline, MDE direction/units, available traffic, time window, or metric type is ambiguous after one clarification pass. Name exactly what to provide.

The status never replaces the artifact — always give both.
