---
name: weisberg-experimentation
description: Scripted marketing-workspace experiment statistics wired to the workspace/ data contracts. Use when the user wants to run CUPED variance reduction, an SRM check, power/sample-size math, sequential monitoring, or frequentist and Bayesian analysis on marketing experiment data landed in workspace/raw/ — phrases like 'run CUPED on our workspace experiment', 'check this marketing experiment for SRM', 'sequential test on the experiment pipeline in our workspace', 'compute the incrementality lift for MMM calibration'. If experiment_data.csv is not yet landed, run data-extraction first. Not for standalone experiment consulting unconnected to a marketing workspace (use the ab-testing plugin) or regulated experiment governance (use the experimentation plugin). Feeds attribution-analysis, funnel-analysis, email-analytics, reporting.
metadata:
  source-name: experimentation
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Marketing-Workspace Experimentation & Causal Statistics

**Role:** Fix-allowed within `workspace/analysis/` and `workspace/reports/`. You
own the **scripted statistics layer** for marketing experiments held in the
workspace — CUPED, SRM, power, sequential, frequentist, Bayesian. **Hard gate:
all statistics run in the deterministic scripts under `scripts/`; never estimate
a p-value, posterior, sample size, or variance reduction in prose.**

## Contract

**When to use**
- Marketing experiment data is in `workspace/raw/experiment_data.csv` and needs
  rigorous analysis (CUPED, SRM, guardrails, novelty/primacy, Bayesian + frequentist).
- Pre-experiment design math: power, MDE, duration from historical traffic.
- Producing incrementality lift estimates that calibrate the MMM in
  `attribution-analysis`.

**When NOT to use** (route instead)
- Standalone experiment design/analysis not wired to a marketing workspace, or
  hands-on lifecycle and implementation review → **ab-testing plugin**
  (`ab-testing:design-experiment`, `ab-testing:sample-size`,
  `ab-testing:analyze-results`).
- Regulated/high-trust governance, ship-vs-kill decision reviews, conduct-risk
  and trust review → **experimentation plugin**
  (`experimentation:experiment-decision-review`, `experimentation:compliance-trust-review`).
- Reconciling an experiment against an MMM for a budget call →
  `experimentation:measurement-integration`.
- Segments not yet defined → `audience-segmentation` first.
- Raw experiment file not yet landed → `data-extraction` first.

**Mode classification** (declare which)

| Mode | Trigger | Scope |
|---|---|---|
| **Quick** | Design math only ("how big / how long") | Power/MDE/duration; no result analysis. |
| **Standard** | Completed experiment | SRM → CUPED → frequentist + Bayesian → guardrails → report. |
| **Deep** | Ongoing or high-stakes | Standard + sequential monitoring, novelty/primacy time-window analysis, incrementality export. |

**Inputs**

| File | Description | Required |
|------|-------------|----------|
| `workspace/raw/experiment_data.csv` | User-level: `user_id`, `variant`, `metric`, `timestamp`. | Yes |
| `workspace/raw/pre_experiment_covariates.csv` | Pre-period metric values for CUPED. | No (recommended) |
| `workspace/processed/segments.json` | Segment definitions from audience-segmentation. | No |

**Contract references:** `references/experiment_design.md` (power/MDE/duration),
`references/cuped_methodology.md`, `references/sequential_testing.md`,
`references/bayesian_ab.md`, `shared/schemas/data_contracts.md`.

**Outputs**

| File | Description |
|------|-------------|
| `workspace/analysis/experiment_results.json` | Effect sizes, CIs, p-values, Bayesian posteriors. |
| `workspace/analysis/cuped_adjustment.json` | CUPED theta and variance reduction achieved. |
| `workspace/analysis/incrementality_results.json` | Lift estimates consumable by attribution-analysis. |
| `workspace/reports/experiment_report.html` | Forest plots, posteriors, monitoring charts, plain-language recommendation. |

## Workflow

Complete each step before the next. A failed gate is a STOP, not a warning.

1. **Validate inputs (HARD GATE).** Load `workspace/raw/experiment_data.csv`; verify
   `user_id`, `variant`, `metric`, `timestamp`. If covariates are provided, confirm the
   covariate window ends **before** treatment assignment (post-treatment covariates
   bias CUPED — reject them). If the file is absent, **STOP** and run **data-extraction**
   first.

2. **SRM check (HARD STOP rule).** Run `scripts/srm_check.py`. If the chi-squared
   goodness-of-fit p < 0.001, **halt analysis** — the experiment is broken until
   explained. Report the mismatch broken down by platform, date, and segment. Do not
   report a "winner" from an SRM-positive test.

3. **Design or analyze.**
   - *Pre-experiment:* run `scripts/power_analysis.py` for required sample size, MDE,
     and duration given historical traffic. Stop here for Quick mode.
   - *Post-experiment:* continue to step 4.

4. **CUPED (when covariates available).** Run `scripts/cuped.py` to regress each metric
   on its pre-experiment covariate, compute theta, and produce adjusted values
   (`Y_adj = Y - theta*(X - mean(X))`). Log the variance reduction achieved.

5. **Frequentist analysis.** Run `scripts/frequentist_test.py` on raw and CUPED-adjusted
   metrics. Apply Benjamini-Hochberg correction across all metrics. Default to two-sided
   tests; one-sided only with explicit justification. Classify significant vs exploratory.

6. **Bayesian analysis.** Run `scripts/bayesian_test.py` for posteriors, probability of
   being best, and expected loss per variant. Let the user choose the decision framework
   — always compute both.

7. **Sequential monitoring (ongoing experiments).** Run `scripts/sequential_test.py` for
   always-valid CIs (mSPRT) and stopping boundaries. Enforce the pre-specified
   alpha-spending; do not let ad-hoc peeking pass as a decision.

8. **Guardrails and novelty.** Verify no variant degrades a guardrail metric beyond its
   threshold; flag violations. Segment by time window and test for a trend in effect size
   (flat = real, decaying = novelty, growing = primacy).

9. **Decision gate — interpretation frame.** When results are borderline (significant but
   below the pre-registered MDE, or CUPED flips the conclusion), use **AskUserQuestion**
   to confirm how the user wants to act: hold to the pre-registered decision rule, treat
   as exploratory, or extend the test. Do not silently pick. Note: shipping/governance
   *decisions* belong to the experimentation plugin — surface the statistics; do not
   adjudicate conduct risk here.

10. **Report + export.** Write `experiment_results.json`, `cuped_adjustment.json`, and
    (when a lift is estimated) `incrementality_results.json` for MMM calibration. Build
    `workspace/reports/experiment_report.html`.

11. **FS-mode gate.** In financial-services workspaces: all investor-facing variants must
    be compliance-pre-approved before launch, required disclosures cannot be the variable
    under test, and any result claim used in marketing must carry statistical-methodology
    footnotes. Route customer-facing outputs through **compliance-review**.

**Cross-skill wiring:** incrementality results calibrate `attribution-analysis`
MMM priors; `funnel-analysis` generates hypotheses this skill tests;
`email-analytics` delegates send-time and subject-line testing here for rigor;
CUPED covariates draw on `web-analytics` pre-period data; `reporting` consumes
result summaries.

## Output Format

```
## Experimentation — <experiment name>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Mode: Quick | Standard | Deep

SRM: p=<v> (PASS | FAIL-HALT)
Effect: <metric> <delta> [<lo>–<hi>], p=<v> (BH-adj); CUPED var-reduction=<pct>
Bayesian: P(best)=<pct>, expected loss=<v>
Recommendation: <plain language>
Artifacts: workspace/analysis/experiment_results.json, workspace/reports/experiment_report.html
```

Completion status:
- `DONE` — validated, SRM clean, both analyses run, report written.
- `DONE_WITH_CONCERNS` — completed with caveats (novelty trend, weak covariate,
  underpowered); state them.
- `BLOCKED` — SRM failure or missing required columns; name the gate.
- `NEEDS_CONTEXT` — missing the interpretation frame, covariate window, or the
  experiment file (state what).

## Anti-Patterns

- **Do not** report results from an SRM-positive experiment — halt and diagnose.
- **Do not** estimate p-values, posteriors, or variance reduction in prose.
- **Do not** use post-treatment covariates in CUPED.
- **Do not** peek and stop early outside the pre-specified sequential boundaries.
- **Do not** claim a win in a post-hoc segment when the overall result is null.
- **Do not** adjudicate ship/kill or conduct risk here — that is the
  experimentation plugin's job; produce the statistics and hand off.
- **Do not** launch FS investor-facing variants without compliance pre-approval.

Builder-facing acceptance criteria and engineering conventions live in the
plugin's `references/authoring-notes.md`, not in this runtime body.
