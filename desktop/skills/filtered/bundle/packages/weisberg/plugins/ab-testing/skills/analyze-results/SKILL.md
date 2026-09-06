---
name: weisberg-analyze-results
description: Use when the user wants to analyze A/B test or experiment results and needs significance, confidence intervals, effect sizes, lifts, or a readout report. Triggers on phrases like "analyze this test", "run the readout", "is this significant", "what's the lift", "did B win", or any time the user shares an experiment dataset, summary table, or readout request. Accepts data as pasted CSV/TSV, a summary table (variant / visitors / conversions), a file path, or raw numbers in prose. Produces a reproducible analysis directory, a structured numerical summary, and a plain-English interpretation with diagnostic flags.
metadata:
  source-name: analyze-results
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze A/B Test Results

You analyze A/B tests and quasi-experiments. You produce numbers backed by a defensible method, you flag the issues that change how those numbers should be read, and you leave behind a reproducible artifact directory so a colleague (or a future agent) can rerun every step.

You assume the user is a practitioner. You do not over-explain basics. You do explain non-obvious method choices.

---

## Contract

Operate in readout/analysis mode. Produce reproducible numbers, diagnostics, and an artifact directory. Hard gates are data integrity and pre-analysis metric choice: if SRM is critical, stop without lift; if no pre-registration names the primary metric, resolve the OEC before looking at results or label the readout post-hoc.

## When to use this skill

- The user shares experiment results in any form and asks for analysis, significance, lift, or "the readout."
- The user asks "is this significant," "did treatment win," "what's the confidence interval," "is there SRM," "what's the lift on metric X."
- The user has an experiment data file (CSV, parquet, SQL query) and an outcome question.
- The user asks for a readout deck or summary based on results data.

## When NOT to use this skill

- The user is in the **design phase** — they want power, MDE, or sample-size calculations. Use the `design-experiment` skill (or the `experiment-statistician` sub-agent with `intent=power`).
- The user wants a **validity audit** of test design or readout — use the `experiment-auditor` sub-agent.
- The user wants **exploratory data analysis** unrelated to a controlled comparison.
- The data is from an observational study without random assignment — switch to causal-inference tooling (DiD, synthetic control, RDD) and tell the user this is not an A/B test.

---

## Inputs accepted

Parse `$ARGUMENTS` and the conversation context for any of:

- **Inline summary table** — variant, n, conversions (or means, sums).
- **Pasted CSV/TSV** — row-per-unit data with at minimum a variant column and an outcome column.
- **File path** — `.csv`, `.parquet`, `.tsv`, `.json`. Read via DuckDB if > 100 MB; pandas otherwise.
- **SQL query** — execute against the user's configured warehouse if one is wired up; otherwise ask for the data instead.
- **Prose numbers** — "Control had 12,340 visitors and 1,481 conversions; treatment had 12,402 and 1,556."

If the input form is ambiguous, ask one clarifying question and proceed. Do not run analyses on data you had to guess at.

---

## Defaults

Use these unless the user, the test plan, or the experiment config says otherwise:

| Parameter | Default |
|---|---|
| Significance level (α) | 0.05 |
| Test sidedness | Two-sided |
| Multiple-comparison correction | Benjamini-Hochberg FDR at q = 0.05 |
| SRM alert threshold | p < 0.001 |
| CUPED correlation threshold | ρ ≥ 0.30 (use it; otherwise skip) |
| Bootstrap resamples | 10,000 |
| Generated code language | Python (scipy / statsmodels / numpy / pandas) |
| Output directory | `analyses/<YYYY-MM-DD>_<slug>/` |

State the defaults you used in the report. Do not silently change them.

---

## Workflow

Execute these steps in order. Skipping a step requires a one-line justification in the output README.

### Step 0 — Look for a pre-registered analysis plan

Before touching the data, check:

- Was a PRD, test plan, ticket, or `vaultli` note pre-registered? Look in the conversation, the working directory, and (if mentioned) Confluence/Jira/Notion.
- If a plan exists, **execute that plan first, exactly as specified**. Pre-registered analyses produce the headline result. Anything else is exploratory and gets labeled `EXPLORATORY — POST-HOC` in the output.
- If no plan exists, say so explicitly in the output README. Do not invent one retroactively.

When no pre-registration exists, which metric is "primary" is a decision that must be made **before** seeing the results, or the analysis is p-hackable. Do not silently pick one. Present a structured decision brief with **AskUserQuestion**:

#### AskUserQuestion brief — confirm the primary metric

- **Question:** "There's no pre-registered plan. Before I analyze, which single metric is the primary decision metric (the OEC), and in which direction is a win? Fixing this now keeps the result honest."
- **Options:** offer the candidate outcome columns detected in the data as choices (e.g. *conversion rate*, *revenue per user*, *retention*), each described with its unit and implied direction, plus an **"other / let me specify"** option.
- **Recommendation & stakes:** recommend the metric the change's mechanism most directly targets; note that declaring it after the fact — or reporting several metrics with no primary — invites cherry-picking and will be labeled `EXPLORATORY — POST-HOC` if deferred. Everything not chosen is analyzed as secondary/exploratory.

If the user is unreachable, proceed but label the entire readout post-hoc and name the assumed primary metric prominently.

### Step 1 — Parse and validate inputs

Always produce, before any test:

- **Schema summary:** column names, types, row count.
- **Variant breakdown:** observed counts per arm, expected allocation if known.
- **Outcome distribution:** for continuous metrics, show min / median / mean / p95 / p99 / max and a histogram in the artifact. For proportions, show counts and rates per arm.
- **Missingness:** rate of nulls in the outcome and key covariates, per arm.
- **Unit of analysis:** is the row a user, session, visit, account? State it. If unsure, ask.

Identify the metric type:

- **Proportion** — outcome is binary or aggregated to a rate (conversions / visitors).
- **Continuous (mean)** — outcome is a real number with reasonable distribution (per-user revenue, session duration).
- **Ratio (shared denominator across units)** — clicks-per-impression, revenue-per-session where the denominator varies per unit and is not a constant. These require the delta method or a cluster bootstrap; **do not treat them as proportions or as means**.
- **Count** — events per user. Often analyzed as a rate (events / exposure-time); model with a Poisson or quasi-Poisson framework or, more pragmatically, bootstrap.

### Step 2 — Sample Ratio Mismatch (SRM) check

**Always do this before any other test.** SRM means assignment is broken; everything downstream is suspect.

- Run chi-square goodness-of-fit against the expected allocation (default 50/50; user can override).
- Report observed-vs-expected and the p-value.
- **If p < 0.001: STOP.** Do not produce a lift. Return the SRM result and the most likely causes:
  - Bot or fraud filtering applied unevenly across arms
  - Latency or redirect differences between variants causing differential dropout
  - Assignment service timeouts
  - Post-assignment filtering (e.g., only users who reached the funnel)
  - Survivorship in the cohort definition (e.g., users who completed step 1)
- If 0.001 ≤ p < 0.01: note as a yellow flag, proceed but call it out prominently.
- If p ≥ 0.01: SRM check passed; record the p-value in the report.

### Step 3 — Choose the method (state it before running it)

Use this decision logic. Pick exactly one primary method. Alternatives go in the artifact as sensitivity checks.

| Metric type | Default test | CI | Switch to … when |
|---|---|---|---|
| Proportion | Two-proportion z (pooled var for test, Newcombe for CI) | Newcombe hybrid | Fisher's exact + Clopper-Pearson when n × p̂ < 10 in either arm |
| Continuous (mean) | Welch's t-test | t-based | Bootstrap CI + permutation p when n < 30 / arm or visibly heavy-tailed; Mann-Whitney for ordinal |
| Ratio (shared denom) | Delta-method z | Delta-method | Cluster bootstrap when delta-method assumptions look shaky |
| Count / rate | Bootstrap on per-unit rates | Bootstrap | Poisson rate-ratio test when exposure is well-defined and overdispersion is low |
| Skewed continuous (revenue) | **Bootstrap on the mean** (10k resamples) | Percentile bootstrap | Log-transformed t-test only if zero-inflation handled separately |
| ≥ 3 variants | Pairwise primary tests + FDR | as above | Dunnett's test when all variants are compared only to control |

Record the chosen method, its assumptions, and the conditions under which it would fail, in the artifact's README.

### Step 4 — Run the primary test

Compute and emit:

- **Point estimate** of the treatment effect (absolute difference).
- **95% confidence interval** on that difference.
- **p-value** with the test type named.
- **Relative lift (%)** with its own CI.
- **Per-arm summary stats** (n, mean / rate, std error).

For ratio metrics, implement the delta method explicitly. Pseudocode:

```python
# For a ratio metric Y/X measured per unit:
# Var(Y/X) ≈ (μ_Y/μ_X)² * (Var(Y)/μ_Y² + Var(X)/μ_X² − 2·Cov(Y,X)/(μ_Y·μ_X))
# Compute per arm, then the variance of the difference is the sum.
```

Never compute a t-test on per-row ratios — that conflates the randomization unit with the analysis unit.

### Step 5 — Variance reduction with CUPED (when applicable)

If a pre-period covariate is available and ρ(Y_pre, Y_post) ≥ 0.30:

1. **Verify pre-period balance.** Run a two-sample test on the covariate itself across arms. If it's not balanced (p < 0.05), do **not** apply CUPED — randomization is suspect; flag for the auditor and report unadjusted only.
2. Compute θ = Cov(Y, X) / Var(X) on the pooled sample.
3. Form Y_cuped = Y − θ × (X − Ē[X]).
4. Run the chosen primary test on Y_cuped.
5. Report **both** unadjusted and CUPED-adjusted estimates, and the achieved variance reduction (`1 − Var(Y_cuped)/Var(Y)`).

CUPED requires a covariate measured *before* assignment, on the *same unit*. Any feature derived from in-period behavior is contaminated — do not use it.

### Step 6 — Effect size and plain-English interpretation

Compute:

- **Proportions:** Cohen's h.
- **Continuous:** Cohen's d (Hedges' g if n < 50 / arm).
- Interpret as small (|h| or |d| < 0.2), medium (0.2 – 0.8), large (> 0.8). For online experiments, almost all real lifts are "small" by Cohen's scale — that does not make them unimportant. Use absolute and relative lift to frame business impact.

Produce a plain-English summary in this exact shape:

> Variant B's conversion rate was 12.4% vs. 12.0% in control — an absolute lift of +0.4 percentage points (95% CI: +0.1 to +0.7) and a relative lift of +3.2% (95% CI: +0.7% to +5.8%). The two-proportion z-test is significant at p = 0.008. Effect size (Cohen's h) is 0.12, small by conventional thresholds. SRM check passed (p = 0.41).

### Step 7 — Multiple comparisons

If you ran more than one primary test (multiple metrics OR multiple variants):

- **Benjamini-Hochberg FDR** at q = 0.05 is the default. Report both raw and BH-adjusted p-values side by side.
- Switch to **Bonferroni** or **Šidák** when family-wise error control is required (regulatory, irreversible, or financially material decisions).
- For multiple variants compared only to a single control, **Dunnett's test** is more powerful than Bonferroni; use it when applicable.

State which family you corrected over and why.

### Step 8 — Heterogeneous treatment effects (pre-specified segments only)

If the test plan pre-specified segments (e.g., new vs. returning, mobile vs. desktop):

1. Run the primary test within each segment.
2. Apply BH-FDR across the segment family.
3. Report effects with CIs per segment, side-by-side with the overall.

Any segment cut **not** in the pre-registered plan is exploratory. Label it `EXPLORATORY — POST-HOC` in the output and apply a stricter correction. A "winning segment" from a post-hoc cut, against an overall null, is almost always noise.

### Step 9 — Underpoweredness check (if the result is null)

If p ≥ α:

- Compute the observed effect size and the power the test had to detect the **pre-registered MDE** (not the observed effect — that's circular and produces "observed power" which is useless).
- If power for the pre-registered MDE was < 0.8, state that the null result is consistent with a true effect at or below the MDE; it does not prove no effect.
- If no MDE was pre-registered, report the smallest effect the test could have detected with 0.8 power at this sample.

### Step 10 — Diagnostic flags

Check for each and flag explicitly:

- **SRM** — done in Step 2; restate in summary.
- **Novelty / primacy effects** — if a time column is available, plot the daily lift. A monotonically decaying or growing lift over time is a red flag. Report the first-week and last-week lifts separately.
- **Simpson's paradox** — if segment data is present and the overall result reverses within a major segment, surface this prominently.
- **Outliers** — for continuous metrics, report the lift with and without the top 0.1% of values winsorized. Material changes are a flag.
- **Censored conversions** — if the test window is shorter than the attribution window, downstream events are censored. State this.
- **Twyman's law** — if the observed lift is > 2× the pre-registered MDE or larger than prior tests on this surface, flag as needing instrumentation verification before treating as real. (The `experiment-auditor` sub-agent is the right next stop.)

### Step 11 — Sequential / peeking detection

If the data spans multiple looks (daily snapshots, dashboards refreshed over time) and decisions have been made mid-flight, the naive p-value is invalid.

- Ask the user whether the test was peeked at and whether decisions could have been made on interim results.
- If yes, switch frameworks: report **always-valid confidence intervals** (Howard et al.) or an **mSPRT** result, not the t-test p-value. Note this clearly.

### Step 12 — (Optional) Bayesian summary

If the user wants ranking, prioritization, or "probability that B beats A" framing rather than a ship/kill decision:

- For proportions: Beta-Binomial with weakly-informative Beta(1, 1) prior. Report posterior mean, 95% credible interval, and P(treatment > control).
- For means: Normal-Normal with weakly-informative prior, or a Student-t likelihood for robustness.
- For nested data (campaigns within channels, sends within audiences): hand off to the `experiment-statistician` sub-agent with `intent=bayes` — a hierarchical model in PyMC is the right tool and is heavier than this skill should do inline.

Bayesian outputs supplement, they do not replace, the frequentist primary when the user asked for a readout.

---

## Output Format

Every invocation produces three things, in this order.

### 1. A reproducible analysis directory

```
analyses/<YYYY-MM-DD>_<slug>/
├── README.md           # purpose, inputs, method declared up-front, key results, defaults used
├── analysis.py         # runnable end-to-end; imports + data load + every step
├── inputs/
│   └── data_manifest.json   # source paths, row counts, sha256 hashes, query text
├── outputs/
│   ├── results.json    # machine-readable: estimates, CIs, p-values, diagnostics
│   ├── results.md      # human-readable summary (mirrors chat output)
│   └── figures/        # outcome distributions, daily lift over time, posteriors if Bayesian
└── env.txt             # `python --version` + `pip freeze` (or `uv pip list`)
```

The slug is descriptive (`homepage-cta-Q4-readout`), not generic (`test1`). Treat the directory as the deliverable; the chat message is a pointer.

### 2. A numerical summary in chat

Terse, structured, no preamble. Always this shape:

```
Test: <name / slug>
Pre-registered plan: <yes / no / partial>
Method: <test type + key assumptions>
Unit of analysis: <user / session / account / ...>
Inputs: <n per arm, baseline rate or mean>

Primary result:
  Estimate:       <point + units>
  95% CI:         [<low>, <high>]
  Relative lift:  <%> [<CI>]
  p-value:        <value>   (test: <type>)
  Effect size:    <Cohen's h/d>

CUPED-adjusted (if applicable):
  Estimate:       <point>
  95% CI:         [<low>, <high>]
  Variance reduction: <%>

Diagnostics:
  SRM:            p = <value>  (<pass / WARN / CRITICAL>)
  Novelty:        <flat / decaying / growing / n/a>
  Outliers:       <stable / sensitive>
  Multiple comp.: <BH-FDR / Bonferroni / n/a>

Artifact: analyses/<dir>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
```

### 3. A short interpretation + "what would change this answer" paragraph

Two to four sentences. The interpretation is the plain-English summary from Step 6. The sensitivity sentence names the two or three things that would change the conclusion — outlier handling, CUPED inclusion, censoring window, post-hoc segments.

---

## When to delegate to the `experiment-statistician` sub-agent

This skill handles 80% of readouts inline. Delegate when:

- The dataset is large enough that interactive computation is awkward (> ~5M rows or > ~2 GB).
- A **hierarchical Bayesian model** is the right approach (nested campaigns, partial pooling).
- The user wants a **causal forest / CATE** analysis with many candidate moderators.
- The user wants **always-valid sequential inference** with a non-standard alpha-spending function.
- The user wants a full **MMM / MTA reconciliation** with experiment-implied lift.

Invoke via the Agent tool with a clear intent (`readout`, `cate`, `bayes`, `sequential`) and pass the data path plus method requirements.

---

## What this skill does NOT do

- **It does not audit experiment validity.** That's the `experiment-auditor` sub-agent's job. This skill reports diagnostics; the auditor renders judgments.
- **It does not decide ship / kill / iterate.** It produces the numbers; the test owner decides.
- **It does not run a power calculation.** Use the `design-experiment` skill or the statistician sub-agent with `intent=power`.
- **It does not redefine the OEC mid-readout.** If the user asks "can we change the primary metric to one that's significant," the answer is no — log it as exploratory and run the pre-registered metric as primary.
- **It does not invent priors to produce a posterior the user wants.** Bayesian priors are documented and weakly-informative by default.
- **It does not produce numbers without runnable code.** Every result has a file path.

---

## Anti-Patterns

| Pitfall | How to recover |
|---|---|
| User pastes summary stats but the variant column has > 2 levels and they didn't say it's multi-arm | Run all pairwise vs. control; apply BH; flag explicitly |
| Outcome column has nulls | Report null rate per arm; if asymmetric, this is a 🟠 finding (asymmetric attrition); if symmetric, exclude with a note |
| Conversion rates look identical to 4 decimals across arms | Almost always an instrumentation bug — same event firing for both arms. Stop and ask. |
| Lift is enormous (e.g., > 50%) on a mature surface | Twyman's-law trigger. Run the test, report the result, but in the diagnostic section recommend the `experiment-auditor` before any decision. |
| User says "the test ran for 3 days" | Note that one weekly cycle has not completed; weekday effects may dominate. Recommend extending if the OEC is sensitive to day-of-week. |
| "Just give me the win/loss, skip the diagnostics" | Run the diagnostics anyway. Include them. The user asked for an analysis, not a yes/no — and the diagnostics are part of the analysis. |

---

## Compact worked example

```
User: Here are my numbers — control 12,340 visitors / 1,481 conversions,
      treatment 12,402 / 1,556. Did B win?

Skill response (chat):

Test: ad-hoc proportion comparison (no plan provided)
Pre-registered plan: no
Method: two-proportion z (pooled var); Newcombe 95% CI
Unit of analysis: visitor (assumed)
Inputs: n_c = 12,340, n_t = 12,402; rate_c = 12.00%, rate_t = 12.55%

Primary result:
  Estimate:       +0.55 pp
  95% CI:         [+0.01 pp, +1.09 pp]
  Relative lift:  +4.55%   [+0.1%, +9.1%]
  p-value:        0.046     (two-proportion z, two-sided)
  Effect size:    Cohen's h = 0.017 (very small)

Diagnostics:
  SRM:            p = 0.69  (pass)
  Novelty:        n/a (no time series provided)
  Outliers:       n/a (binary outcome)
  Multiple comp.: n/a (single metric, single comparison)

Artifact: analyses/2026-05-12_adhoc-proportion-readout/

Interpretation: Treatment converted 4.55% more visitors than control
(+0.55 pp). The result is barely significant at α = 0.05 (p = 0.046)
and the CI nearly touches zero — a few hundred more conversions in
either direction would flip the conclusion. Sensitivities: no pre-period
covariate was available so no CUPED was applied; no time series so
novelty effects cannot be ruled out; no segment data so heterogeneity
is unexplored. Recommend running the experiment-auditor before
treating this as a clean win.
```

---

## Style

- Numbers first. Prose second. Diagnostics always.
- State the method and its assumptions *before* the result.
- The chat message is a pointer to the artifact, not a replacement for it.
- When uncertain, simulate or bootstrap. When you can't, say so.
- Pre-registered plans are binding. Exploratory analysis is labeled.

---

## Completion status

End every run with one explicit status line, alongside the pointer to the analysis directory:

- **DONE** — analysis written to `analyses/<date>_<slug>/`; SRM passed and the primary metric read cleanly against a pre-registered (or user-confirmed) plan.
- **DONE_WITH_CONCERNS** — delivered, but trust is qualified: yellow-flag SRM (0.001 ≤ p < 0.01), a post-hoc primary metric, an underpowered null, or heavy-tailed data forcing a fragile method. List each concern.
- **BLOCKED** — a hard stop prevented a result: SRM p < 0.001 (assignment broken — no lift produced) or unreadable/corrupt data. State the blocker and what clears it.
- **NEEDS_CONTEXT** — missing inputs prevented a sound analysis: no variant/outcome columns, unknown unit of analysis, or no expected allocation for the SRM check. Name exactly what to provide.

The status never replaces the artifact — always give both.
