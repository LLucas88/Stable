---
name: weisberg-audience-segmentation
description: Use when the user mentions segmentation, customer segments, cohort analysis, RFM analysis, behavioral clustering, K-Means, DBSCAN, customer personas, segment profiles, retention curves, cohort retention, segment migration, customer tiers, high-value customers, at-risk segment, churn cohort, acquisition cohort, engagement tiers, or audience definition. Also trigger on 'group our customers' or 'which customers should we target.' For predicting a single customer's future value use clv-modeling; for conversion-step drop-off use funnel-analysis; this skill groups customers and tracks cohorts. If transaction data is not yet in the workspace, run data-extraction first.
metadata:
  source-name: audience-segmentation
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Audience Segmentation

RFM scoring, behavioral K-Means/DBSCAN clustering, and cohort retention analysis
that produce interpretable segments, migration matrices, and targeting-ready
profiles.

## Contract

**Role:** Advisory analyst. Produces segment assignments and profiles; does not
launch campaigns. Clustering and scoring run in deterministic Python scripts.

**Mode:**
- `quick` — RFM scoring + named segments only.
- `standard` (default) — RFM + behavioral clustering + segment profiles.
- `deep` — add cohort retention and period-over-period migration tracking.

**When to use:** grouping customers, RFM tiers, behavioral clusters, cohort
retention curves, segment migration.

**When NOT to use:** to predict one customer's future revenue use `clv-modeling`;
for funnel-step conversion use `funnel-analysis`; for sales-lead ranking use
`crm-lead-scoring`. See `../../references/skill-index.md` for the portfolio map.

**Evidence required (inputs):**
- `workspace/raw/transactions.csv` — `customer_id`, `date`, `amount`, `product`
  (required). If absent, STOP and run **data-extraction** first.
- `workspace/raw/behavioral_events.csv` — `user_id`, `event`, `timestamp`,
  `properties` (optional; enables behavioral clustering).
- `workspace/analysis/clv_predictions.json` — CLV scores from clv-modeling
  (optional; enriches profiles).

**Depends on:** data-extraction; clv-modeling (optional value enrichment).
**Feeds into:** experimentation, email-analytics, paid-media, reporting. Builder
detail in `references/authoring-notes.md`.

**Hard STOP (FS mode):** if operating in financial services, stop before emitting
segments if any segmentation feature is a prohibited characteristic (race,
religion, national origin) or a direct proxy. Prohibited-basis targeting is a
fair-lending violation, not a modeling choice.

Parse `$ARGUMENTS` for inline paths, cohort dimension, or algorithm overrides.

## Workflow

1. **Validate inputs.** Load transactions (and behavioral events if present).
   Confirm required columns and a usable date range. Apply the FS Hard STOP gate.

2. **RFM scoring.** Run `scripts/rfm_scoring.py`: compute recency, frequency,
   monetary; assign quintile scores 1–5 (5 = best); derive composite score; map to
   named segments (Champions, Loyal, Potential Loyalists, At-Risk, Hibernating,
   Lost) using `references/rfm_methodology.md`.

3. **Method gate (AskUserQuestion).** When the user hasn't specified an approach,
   ask before clustering:
   - **Question:** "Which segmentation output do you want?"
   - **Options:** (a) *RFM named segments* — business-interpretable, stable;
     (b) *Behavioral clusters* — data-driven K-Means/DBSCAN on engagement
     features; (c) *Both* — produce and reconcile. Default to RFM if the user just
     says "segment our customers" and no behavioral data exists.

4. **Behavioral clustering** (if chosen and events exist). Run
   `scripts/behavioral_clustering.py`: `StandardScaler`, optional PCA (≥95%
   variance), sweep k∈[2,10], select k by elbow confirmed by silhouette (>0.3),
   `random_state=42`. DBSCAN alternative: k-distance epsilon, `min_samples` = max(5,
   1% of rows). See `references/clustering_guide.md`.

5. **Cohort retention** (deep mode). Run `scripts/cohort_retention.py`: assign
   customers to cohorts (acquisition month / first product / first channel), build
   the retention matrix, compute retention/churn and revenue-per-user. Validate no
   cell exceeds 100%.

6. **Profile segments.** For each segment record size (count + %), top
   distinguishing behavioral features, value metrics (avg CLV, AOV, revenue
   contribution), and recommended action. Write to
   `workspace/analysis/segment_profiles.json`.

7. **Migration tracking** (deep mode). Run `scripts/segment_migration.py` across
   consecutive periods; build a transition matrix (rows sum to 100%); flag notable
   moves (Champions→At-Risk, Hibernating→Loyal).

8. **Report.** Write outputs and the HTML segment explorer.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/processed/segments.json` | Customer-level assignments (rfm_segment, rfm_scores, cluster_id/label, cohort, clv_score) |
| `workspace/analysis/segment_profiles.json` | Aggregate statistics per segment |
| `workspace/analysis/cohort_retention.json` | Retention matrices by cohort definition |
| `workspace/analysis/segment_migration.json` | Transition matrices |
| `workspace/reports/segmentation_report.html` | Interactive segment explorer |

**Financial services mode:** keep an audit trail of segmentation logic and manual
overrides; align AUM tiering with the firm's stated service model; handle investor
accreditation under Reg D. If segment definitions feed customer-facing targeting
copy, route that copy through **compliance-review** before use.

**Completion status:**
- `DONE` — segments, profiles, and any requested cohort/migration artifacts written.
- `DONE_WITH_CONCERNS` — e.g., silhouette below 0.3, thin behavioral data, or
  clustering skipped for lack of events.
- `BLOCKED` — missing transactions or FS Hard STOP tripped; state the fix.
- `NEEDS_CONTEXT` — method choice unresolved by the user.

## Anti-Patterns

- Segmenting on prohibited characteristics or proxies in financial services.
- Reporting clusters with silhouette below 0.3 as if they were stable segments.
- Skipping `StandardScaler` before distance-based clustering.
- Non-deterministic clustering (missing `random_state`) so runs aren't
  reproducible.
- Retention matrices exceeding 100% or migration rows not summing to 100% —
  always validate.
- Delivering only statistical clusters with no business-interpretable RFM view.
- Stale quintile boundaries — recompute monthly against current distributions.
