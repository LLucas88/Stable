---
name: weisberg-clv-modeling
description: Use when the user mentions CLV, LTV, customer lifetime value, customer value prediction, lifetime revenue, CLV:CAC ratio, BG/NBD, Gamma-Gamma, RFM summary, purchase frequency prediction, monetary value prediction, churn probability, customer retention modeling, expected transactions, customer-level forecasting, or high-value customer identification. Also trigger on 'which customers are most valuable' or 'predict future customer revenue.' For grouping customers into segments or cohort retention curves use audience-segmentation; for lead propensity scoring use crm-lead-scoring; this skill predicts per-customer future value. If transaction data is not yet in the workspace, run data-extraction first.
metadata:
  source-name: clv-modeling
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# CLV Modeling

Probabilistic customer lifetime value: BG/NBD for purchase frequency, Gamma-Gamma
for monetary value, Beta-Geometric for subscriptions — with confidence intervals,
CLV:CAC, cohort curves, and at-risk high-value alerts.

## Contract

**Role:** Advisory modeler. This skill computes and reports predicted value; it
does not target, price, or contact customers. All numbers come from deterministic
Python scripts, never from model estimation in prose.

**Mode:**
- `quick` — RFM summary + single-horizon MLE point estimates.
- `standard` (default) — MLE BG/NBD + Gamma-Gamma, CIs, tiers, at-risk list,
  holdout validation.
- `deep` — add Bayesian (PyMC-Marketing) posteriors and full uncertainty.

**When to use:** predicting future per-customer revenue, CLV:CAC, at-risk
high-value retention targets, purchase-frequency / probability-alive scoring.

**When NOT to use:** for building customer segments or cohort retention curves use
`audience-segmentation`; for sales-lead propensity use `crm-lead-scoring`; for
channel ROI use `attribution-analysis`. See `../../references/skill-index.md` for
the full portfolio map.

**Evidence required (inputs):**
- `workspace/raw/transactions.csv` — `customer_id`, `date`, `amount` (required for
  non-contractual). If absent, STOP and run **data-extraction** first.
- `workspace/raw/subscriptions.csv` — `customer_id`, `start_date`, `end_date`,
  `plan_value` (optional; enables contractual model).
- `workspace/analysis/acquisition_costs.json` — CAC by customer/segment (optional;
  enables CLV:CAC).

**Depends on:** data-extraction (raw transactions). **Feeds into:**
audience-segmentation (value tiers), paid-media (bid targets), email-analytics
(lifecycle triggers), attribution-analysis, reporting. Builder detail lives in
`references/authoring-notes.md`.

**Hard STOP (data integrity):** stop and surface the issue before modeling if any
of these appear — future-dated transactions, negative/zero amounts as a material
share, or fewer than ~2 repeat purchasers (BG/NBD is unidentifiable). Do not emit
CLV numbers from broken inputs.

Parse `$ARGUMENTS` for inline paths, horizon, discount rate, or model overrides.

## Workflow

1. **Validate & profile.** Load transactions; parse dates robustly (ISO/US/EU).
   Flag duplicates (same customer/date/amount), negative/zero amounts, and
   impossible dates. Report customer count, date range, transaction volume. Apply
   the Hard STOP gate above.

2. **RFM summary.** Run `scripts/rfm_summary.py` to build recency, frequency
   (repeat purchases only), tenure (T), and mean repeat monetary value. One-time
   purchasers: frequency=0, monetary=NaN (excluded from Gamma-Gamma).

3. **Model-class gate (AskUserQuestion).** When both transaction and subscription
   data exist, or the business model is ambiguous, ask before fitting:
   - **Question:** "Which lifetime model fits this business?"
   - **Options:** (a) *Non-contractual (BG/NBD + Gamma-Gamma)* — purchases happen
     at will, no fixed renewal; (b) *Contractual (Beta-Geometric)* — subscription
     with renewal periods; (c) *Both, compared* — fit each and reconcile.
   Skip the prompt when only one data type is present (default to it).

4. **Fit.** Non-contractual: run `scripts/fit_bgnbd.py` (BetaGeoFitter MLE →
   r, alpha, a, b; per-customer expected transactions and probability-alive; then
   Gamma-Gamma on frequency>0 customers). Validate Gamma-Gamma independence:
   if corr(frequency, monetary) > 0.3, warn and record potential bias.
   Contractual: fit Beta-Geometric on renewal-period survival data.

5. **Bayesian extension (deep mode).** Use `pymc_marketing.clv` BetaGeoModel and
   GammaGammaModel; check R-hat < 1.01, ESS > 400; report median CLV with 80% and
   95% credible intervals per customer.

6. **Predict & score.** Run `scripts/predict_clv.py` for horizons (default 6/12/24
   months) with point estimate + interval. Compute CLV = E[transactions] ×
   E[monetary] × margin × discount_factor. If `acquisition_costs.json` is present,
   compute CLV:CAC and flag ratio < 1.0; if absent, flag transparently and skip.
   Tier customers Platinum/Gold/Silver/Bronze by CLV percentile. Build the at-risk
   list: top-10% CLV × probability-alive dropped below 50% this quarter.

7. **Validate.** Run `scripts/validate_clv.py` with a temporal holdout
   (calibration/holdout split): report MAE, RMSE, and calibration ratio
   (predicted/actual, target 0.9–1.1).

8. **Report.** Write outputs (below) and the HTML dashboard.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/clv_predictions.json` | Customer-level CLV with confidence intervals |
| `workspace/analysis/clv_segments.json` | CLV tiers (Platinum/Gold/Silver/Bronze) |
| `workspace/analysis/at_risk_customers.json` | High-value customers with declining probability-alive |
| `workspace/reports/clv_analysis.html` | CLV distributions, cohort curves, model diagnostics |

Every readout states: model class, horizon, discount rate, holdout MAE/calibration
ratio, and whether CLV:CAC was computed or skipped.

**Financial services mode:** aggregate CLV across products at the household level;
support AUM-basis-point monetary components; compute relationship-level CLV for
advisor-intermediated books. Document model inputs for fair-lending review. If CLV
outputs feed any customer-facing claim or projected-return copy, route that content
through the **compliance-review** skill before distribution.

**Completion status** — end every run with one:
- `DONE` — models fit, holdout passed, artifacts written.
- `DONE_WITH_CONCERNS` — shipped but note the caveat (e.g., Gamma-Gamma
  independence violated, weak holdout calibration, CLV:CAC skipped).
- `BLOCKED` — Hard STOP tripped or required input missing; state the fix.
- `NEEDS_CONTEXT` — model-class or horizon ambiguity unresolved by the user.

## Anti-Patterns

- Emitting CLV numbers from data that failed the integrity gate (future dates,
  negative amounts, too few repeat buyers).
- Reporting point estimates without confidence/credible intervals.
- Running Gamma-Gamma on one-time purchasers, or ignoring a frequency–monetary
  correlation above 0.3.
- Presenting CLV:CAC when acquisition-cost data is missing instead of flagging it.
- Using a random (not temporal) holdout — it leaks future information.
- Letting the model narrate CLV or probability-alive instead of running the
  scripts.
- Defaulting to a contractual or non-contractual model without checking which data
  the business actually has.
