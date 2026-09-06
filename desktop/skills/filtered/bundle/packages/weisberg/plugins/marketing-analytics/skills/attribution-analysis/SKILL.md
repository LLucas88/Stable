---
name: weisberg-attribution-analysis
description: Use when the user mentions attribution, ROAS optimization, channel contribution, marketing mix model, MMM, media mix, budget allocation, budget optimization, incrementality, adstock, saturation curves, diminishing returns, channel effectiveness, media effectiveness, cross-channel attribution, multi-touch attribution, MTA, Shapley value attribution, or marketing ROI measurement. Also trigger on 'which channel is driving results' or 'where should we spend more.' If campaign spend data is not yet extracted, run data-extraction first. For within-platform ad performance (pacing, creative fatigue, CPC) use paid-media; to reconcile an MMM against a geo experiment use experimentation:measurement-integration. Results feed reporting and paid-media.
metadata:
  source-name: attribution-analysis
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Marketing Mix Modeling & Attribution

**Role:** Fix-allowed within `workspace/analysis/` and `workspace/reports/`. You
run a deterministic Bayesian MMM pipeline and interpret its output. **Hard gate:
every statistical quantity is computed by a script — never estimate a
contribution, ROAS, posterior, or credible interval in prose.** Every number you
report must trace to a script output file.

## Contract

**When to use**
- The user wants to know which channels drive outcomes, how to reallocate budget,
  or the marginal ROAS of the next dollar per channel.
- Adstock/saturation modeling, incrementality calibration, or MMM scenario
  planning ("shift 10% from display to search").

**When NOT to use** (route instead)
- Within-platform ad diagnostics — pacing, creative fatigue, CPC, negative
  keywords → `paid-media`.
- Reconciling an MMM against a geo/lift experiment for a budget decision →
  `experimentation:measurement-integration`.
- Designing or analyzing the lift test itself → `marketing-analytics:experimentation`.
- Assembling the executive deck from finished analysis → `reporting`.
- Raw spend/conversion files not yet landed → `data-extraction` first.

**Mode classification** (declare which at the top of your run)

| Mode | Trigger | Scope |
|---|---|---|
| **Quick** | "which channel is winning" on already-fit model | Read existing `mmm_channel_contributions.json`, summarize, no refit. |
| **Standard** | New MMM request with clean inputs | Full fit → validate → decompose → optimize → report. |
| **Deep** | Calibration against lift tests, scenario suites, prior-sensitivity emphasis | Standard + informative priors from incrementality, multi-scenario optimization, expanded diagnostics. |

**Inputs**

| File | Description | Required |
|------|-------------|----------|
| `workspace/raw/campaign_spend_{platform}.csv` | Daily/weekly spend by channel (`date`, `channel`, `spend`, `impressions`, `clicks`). | Yes |
| `workspace/raw/conversions.csv` | Outcome at matching grain (`date`, `conversions`, `revenue`). | Yes |
| `workspace/raw/external_factors.csv` | Seasonality, competitor spend, macro (`date`, `factor_name`, `value`). | No |
| `workspace/analysis/incrementality_results.json` | Lift priors from experimentation (`{channel, lift, ci_lower, ci_upper}`). | No |

**Contract references**
- `references/mmm_methodology.md` — adstock/saturation math, prior guidance.
- `references/pymc_marketing_api.md` — PyMC-Marketing MMM usage.
- `references/incrementality_calibration.md` — lift results → informative priors.
- `shared/schemas/data_contracts.md` — canonical field definitions.

**Outputs**

| File | Description |
|------|-------------|
| `workspace/analysis/mmm_channel_contributions.json` | Posterior mean + credible intervals per channel. |
| `workspace/analysis/mmm_budget_optimization.json` | Optimal allocation under current and scenario budgets. |
| `workspace/analysis/mmm_diagnostics.json` | MCMC convergence + fit statistics, framework/version, seeds. |
| `workspace/reports/mmm_executive_summary.html` | Contribution waterfall, reallocation table, marginal ROAS curves — all with uncertainty bands. |

## Workflow

Complete each step before the next. If a gate fails, STOP and report — do not
proceed with a poorly converged model or unvalidated data.

1. **Validate inputs (HARD GATE).** Confirm `workspace/raw/campaign_spend_{platform}.csv`
   and `workspace/raw/conversions.csv` exist. If either is missing, **STOP** and run
   the **data-extraction** skill first. Then run `scripts/fit_mmm.py --validate` to
   check date alignment across inputs, detect/impute missing windows (flagging
   confidence adjustments), and normalize to a unified grain. Default to **weekly**
   grain; use daily only when the dataset spans 2+ years.

2. **Specify priors.** Check for `workspace/analysis/incrementality_results.json`.
   If lift results exist, run `scripts/fit_mmm.py --calibrate` to translate them into
   informative priors (see `references/incrementality_calibration.md`). Otherwise use
   weakly informative priors from `references/mmm_methodology.md`. Always run a prior
   sensitivity analysis (vague vs informative) and report the degree of prior
   influence.

3. **Fit.** Run `scripts/fit_mmm.py` (PyMC-Marketing `MMM`, NUTS/MCMC; geometric or
   Weibull adstock, Hill saturation per channel). If MCMC is impractical, fall back to
   the ridge model in `scripts/_lightweight_mmm.py` and document the tradeoff in
   diagnostics.

4. **Validate the model (HARD GATE).** Run `scripts/validate_model.py`. Require R-hat
   < 1.05 and effective sample size > 400 for all parameters, and posterior predictive
   coverage of 90%+ of observed data within the 90% credible interval. **If diagnostics
   fail, STOP** — reparameterize, add samples, or tighten priors and refit. Do not
   decompose or optimize on a non-converged model.

5. **Decompose.** Run `scripts/compute_contributions.py`. Verify contributions sum to
   the total observed outcome within 2%; separate base (intercept + controls) from
   media-driven components. Write `workspace/analysis/mmm_channel_contributions.json`.

6. **Decision gate — optimization scope.** Before reallocating budget, use
   **AskUserQuestion** to confirm the decision frame when it is not already specified:
   - *Total budget:* hold constant / increase / decrease (by how much)?
   - *Constraints:* per-channel min/max spend, or channels that must not be cut?
   - *Objective:* maximize conversions or revenue?
   Then run `scripts/optimize_budget.py`, propagating posterior uncertainty (use
   posterior samples, not point estimates). Produce marginal ROAS curves and flag
   channels approaching saturation ceilings. Write
   `workspace/analysis/mmm_budget_optimization.json`.

7. **Report.** Write `workspace/analysis/mmm_diagnostics.json` and
   `workspace/reports/mmm_executive_summary.html` (contribution waterfall with
   uncertainty bands, reallocation table with expected-lift estimates, diagnostics,
   marginal ROAS curves). Never present a point estimate without its interval.

8. **FS-mode gate.** If the workspace is tagged financial services and the summary
   contains performance claims or customer-facing language, route the HTML through the
   **compliance-review** skill before distribution. Ask gross vs net of fees; for long
   (12–36 month) financial sales cycles, use longer adstock windows and separate
   lead-gen from AUM-conversion attribution.

**Cross-skill wiring:** upstream `data-extraction` lands raw inputs; `paid-media`
supplies normalized spend and consumes budget targets; `experimentation`
incrementality calibrates priors and MMM in turn flags channels needing new lift
tests; `reporting` consumes all outputs; `compliance-review` gates FS distribution.
Always write outputs in the canonical JSON schemas with metadata (timestamp, model
version, data range) so downstream skills can parse them.

## Output Format

Report to the user in this shape:

```
## Attribution / MMM — <outcome>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Mode: Quick | Standard | Deep   Grain: weekly | daily

Model health: R-hat max=<v>, min ESS=<v>, PPC coverage=<pct>
Top contributions (posterior mean [90% CI]):
- <channel>: <share>% [<lo>–<hi>]
Budget move: <from → to>, expected lift <v> [<lo>–<hi>]
Artifacts: workspace/analysis/mmm_*.json, workspace/reports/mmm_executive_summary.html
```

Completion status:
- `DONE` — inputs validated, model converged, contributions + optimization written.
- `DONE_WITH_CONCERNS` — completed but caveats remain (weak priors, imputed
  windows, borderline diagnostics); state them.
- `BLOCKED` — a hard gate failed (missing inputs, non-convergence); name the file
  or diagnostic.
- `NEEDS_CONTEXT` — cannot proceed without the decision frame, budget constraints,
  or gross/net choice (state exactly what is missing).

## Anti-Patterns

- **Do not** estimate contributions, ROAS, or intervals in prose — a script
  computes every number.
- **Do not** decompose or optimize on a model that failed convergence diagnostics.
- **Do not** present point estimates without uncertainty bands.
- **Do not** skip prior sensitivity — an MMM whose posterior is driven by the prior
  is a prior, not a measurement.
- **Do not** optimize budget without confirming the objective and constraints.
- **Do not** silently impute missing spend windows; flag confidence adjustments.
- **Do not** distribute FS performance claims without routing through
  `compliance-review`.

Builder-facing acceptance criteria and engineering conventions live in the
plugin's `references/authoring-notes.md`, not in this runtime body.
