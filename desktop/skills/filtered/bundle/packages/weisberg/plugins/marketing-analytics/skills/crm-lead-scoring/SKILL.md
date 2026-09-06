---
name: weisberg-crm-lead-scoring
description: Use when the user mentions lead scoring, predictive scoring, lead qualification, MQL, SQL, pipeline analytics, pipeline velocity, win rate, deal velocity, sales funnel, opportunity analysis, win/loss analysis, CRM analytics, lead-to-close, conversion probability, propensity model, account scoring, or sales attribution. Also trigger on 'which leads should sales prioritize' or 'why are we losing deals.' For predicting a customer's lifetime value use clv-modeling; for website conversion funnels use funnel-analysis; this skill scores sales leads and analyzes pipeline. If CRM data is not yet in the workspace, run data-extraction first.
metadata:
  source-name: crm-lead-scoring
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# CRM Analytics & Lead Scoring

Predictive lead scoring with SHAP explanations, pipeline-velocity tracking, and
win/loss analysis over Salesforce/HubSpot-style CRM data.

## Contract

**Role:** Advisory modeler. Scores and diagnoses; does not route leads or update
the CRM. Model training, calibration, and statistics run in deterministic Python
scripts.

**Mode:**
- `quick` — pipeline velocity + win/loss on existing fields.
- `standard` (default) — train and calibrate the scoring model with SHAP.
- `deep` — add account-level scoring, forecasting, and drift analysis.

**When to use:** ranking leads, pipeline velocity/coverage, win/loss drivers, lead
source quality.

**When NOT to use:** customer lifetime value → `clv-modeling`; website conversion
funnels → `funnel-analysis`; customer segmentation → `audience-segmentation`. See
`../../references/skill-index.md`.

**Evidence required (inputs):**
- `workspace/raw/crm_leads.csv` — `lead_id`, `source`, `stage`, `created_date`,
  `close_date`, `amount`, `outcome`. Required.
- `workspace/raw/lead_activities.csv` — `lead_id`, `activity_type`, `timestamp`.
  Required. If either is absent, STOP and run **data-extraction** first.
- `workspace/processed/segments.json` — from audience-segmentation (optional).

**Depends on:** data-extraction, audience-segmentation, clv-modeling. **Feeds
into:** email-analytics, paid-media, reporting. Builder detail in
`references/authoring-notes.md`.

**Hard STOP (leakage & fairness):** STOP before training if (a) the split is not
temporal — random splits leak future outcomes into the score; or (b) in FS mode a
feature is a prohibited characteristic (race, religion, national origin) or a
direct proxy. Neither is a tuning choice.

Parse `$ARGUMENTS` for inline paths, CRM dialect, or model overrides.

## Workflow

1. **Validate inputs.** Load `crm_leads.csv` and `lead_activities.csv`; verify
   required columns; load `segments.json` if present. Apply the fairness half of
   the Hard STOP gate to the feature list.

2. **Engineer features.** Run `scripts/lead_scoring_model.py` to build the feature
   matrix (firmographic: company size, industry, geography; behavioral: page
   views, email opens, content downloads, recency). Abstract CRM fields to
   canonical names first.

3. **Model gate (AskUserQuestion).** Before training, confirm the objective:
   - **Question:** "What should the scoring model optimize for?"
   - **Options:** (a) *Interpretability* — logistic regression baseline sales can
     trust and explain; (b) *Accuracy* — gradient boosting with SHAP for
     explanation; (c) *Both, compared* — train each and reconcile. Always train the
     logistic baseline regardless; this sets the headline model.

4. **Train.** Fit with temporal holdout cross-validation (train past, validate
   future — enforce the leakage half of the Hard STOP gate here).

5. **Calibrate.** Apply isotonic regression or Platt scaling; validate predicted
   vs observed within 5 pp across decile bins.

6. **Explain.** Compute SHAP values per scored lead; document top predictive
   features. See `references/lead_scoring_methodology.md`.

7. **Pipeline velocity.** Run `scripts/pipeline_velocity.py`: stage conversion
   rates, deal-cycle time, time-in-stage distributions, coverage vs quota,
   period-over-period. See `references/pipeline_metrics.md`.

8. **Win/loss.** Run `scripts/win_loss_analysis.py`: statistical comparison of
   won vs lost (t-test continuous, chi-squared categorical), divergence-stage
   identification, competitive win/loss when a competitor is named.

9. **Forecast** (deep mode). Weighted, probability-adjusted pipeline vs quota with
   gap analysis.

10. **Report.** Write outputs and the HTML CRM dashboard.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/lead_scores.json` | Lead-level propensity scores with SHAP explanations |
| `workspace/analysis/pipeline_metrics.json` | Velocity, conversion rates, coverage ratio |
| `workspace/analysis/win_loss_factors.json` | Win/loss analysis with ranked feature importance |
| `workspace/reports/crm_dashboard.html` | Lead scoring and pipeline dashboard |

Report states: model class, holdout AUC, calibration error, and the temporal split
boundary.

**Financial services mode:** lead scoring for financial products must meet fair-
lending requirements (no prohibited features/proxies); advisor-mediated channels
need relationship-level scoring aggregated at household/advisor-book level; track
regulatory approval stages (compliance, legal) separately so they don't penalize
velocity; scoring claims used in marketing materials need methodology footnotes and
route through **compliance-review**.

**Completion status:**
- `DONE` — model trained, calibrated, explained; pipeline + win/loss written.
- `DONE_WITH_CONCERNS` — e.g., AUC below 0.75, weak calibration, thin win/loss
  sample.
- `BLOCKED` — Hard STOP tripped (leakage risk or prohibited feature) or missing
  inputs; state the fix.
- `NEEDS_CONTEXT` — model objective unresolved by the user.

## Anti-Patterns

- Random train/test splits on time-series lead data — they leak the future.
- Deploying a score with no SHAP/feature-importance documentation.
- Using prohibited characteristics or proxies as features in financial services.
- Reporting uncalibrated probabilities as if they were reliable conversion rates.
- Penalizing pipeline velocity for mandatory regulatory approval stages.
- Letting the model estimate scores or win/loss p-values instead of the scripts.
