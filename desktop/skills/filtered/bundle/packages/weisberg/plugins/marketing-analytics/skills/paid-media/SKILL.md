---
name: weisberg-paid-media
description: Use when the user mentions paid media, ad performance, Google Ads, Meta Ads, Facebook Ads, LinkedIn Ads, TikTok Ads, DV360, SEM, PPC, display advertising, programmatic, ROAS, CPA, CPM, CPC, CTR, ad spend, budget pacing, creative fatigue, ad creative, quality score, search terms, negative keywords, bid strategy, campaign optimization, ad copy analysis, or audience targeting performance. Also trigger on 'how are our ads performing' or 'are we on track with ad spend.' If campaign spend data is not yet extracted, run data-extraction first. For cross-channel media mix and budget-reallocation modeling use attribution-analysis; for executive rollups use reporting. Normalized spend feeds attribution-analysis; results feed reporting and funnel-analysis.
metadata:
  source-name: paid-media
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Paid Media Analytics

**Role:** Fix-allowed within `workspace/processed/`, `workspace/analysis/`, and
`workspace/reports/`. You normalize cross-platform ad data and run deterministic
diagnostics on it. **Hard gate: anomaly scores, fatigue curves, and pacing
projections come from the scripts — never eyeball a z-score or a projection in
prose.** Monetary math uses `decimal.Decimal`.

## Contract

**When to use**
- Cross-platform ad performance (ROAS/CPA/CPM/CPC) comparison, spend anomaly
  detection, creative fatigue, budget pacing, search-term/negative-keyword mining.
- "How are our ads performing" / "are we pacing to plan" within one or more ad platforms.

**When NOT to use** (route instead)
- Cross-channel media mix, marginal ROAS, budget reallocation across channels →
  `attribution-analysis` (this skill supplies its normalized spend).
- Executive/cross-skill rollup deck → `reporting`.
- Landing-page/funnel conversion after the click → `funnel-analysis`.
- Raw platform exports not yet landed → `data-extraction` first.

**Mode classification** (declare which)

| Mode | Trigger | Scope |
|---|---|---|
| **Quick** | "how are we pacing / performing today" | Normalize + one diagnostic (pacing or efficiency snapshot). |
| **Standard** | Weekly performance review | Normalize → efficiency matrix → anomalies → fatigue → pacing → snapshot. |
| **Deep** | Full audit / optimization | Standard + search-term waste mining, root-cause drill-down, negative-keyword export. |

**Inputs**

| File pattern | Description |
|---|---|
| `workspace/raw/campaign_spend_{platform}.csv` | Platform campaign data from data-extraction. |
| `workspace/raw/search_terms_{platform}.csv` | Search-term reports (Google, Microsoft). |
| `workspace/raw/creative_performance_{platform}.csv` | Creative-level metrics. |

**Contract references:** `references/platform_api_mapping.md` (full metric
taxonomy), `references/anomaly_detection.md`, `references/creative_fatigue.md`,
`shared/schemas/data_contracts.md`.

**Outputs**

| File | Description |
|---|---|
| `workspace/processed/unified_media_performance.csv` | Normalized cross-platform dataset (schema below). |
| `workspace/analysis/media_anomalies.json` | Flagged anomalies with severity, metric, root cause. |
| `workspace/analysis/creative_fatigue.json` | Creative health scores and rotation recommendations. |
| `workspace/analysis/negative_keywords.json` | Recommended negatives with waste estimates. |
| `workspace/reports/media_performance_snapshot.html` | Cross-platform performance dashboard. |

Normalized `unified_media_performance.csv` schema: `date`, `platform`,
`campaign_id`, `campaign_name`, `ad_group_id`, `impressions`, `clicks`, `spend`,
`conversions`, `revenue`, and derived `cpc`, `ctr`, `cpa`, `roas`.

## Workflow

Complete each step before the next. If a normalization gate fails, STOP and report.

1. **Land + normalize (HARD GATE).** Confirm `workspace/raw/campaign_spend_{platform}.csv`
   exists; if missing, **STOP** and run **data-extraction** first. Run
   `scripts/normalize_platforms.py` to map platform-native metrics to the unified
   taxonomy (Google `Cost`→spend, Meta `spend`, LinkedIn `costInLocalCurrency`, etc.;
   see `references/platform_api_mapping.md`). Apply the normalization rules:
   attribution-window labeling (Meta 7-day click vs Google 30-day click), currency
   conversion to one reporting currency via daily FX, and conversion dedup across
   platforms claiming the same event. Write `workspace/processed/unified_media_performance.csv`.
   If required columns are missing after mapping, STOP — do not fabricate a schema.

2. **Efficiency comparison.** Compare ROAS/CPA/CPM/CPC across platforms against
   client targets, 7-day and 28-day rolling averages, and industry benchmarks. Place
   each campaign in the volume×efficiency matrix (scale winners / efficient niche /
   expensive scale / underperformers) to frame the action.

3. **Anomaly detection.** Run `scripts/detect_anomalies.py` (rolling z-score |z|>2.5 on a
   28-day window, isolation forest for multivariate anomalies, STL seasonal decomposition).
   Account for day-of-week seasonality and known events (Black Friday, quarter-end) to
   suppress false positives. On a fire, drill account → campaign → ad group → keyword and
   name the responsible entity and the metric delta. Write `media_anomalies.json`.

4. **Creative fatigue.** Run `scripts/creative_fatigue.py` on conversion-weighted CTR
   (not raw CTR — protects top-of-funnel creatives). Score 0 (fresh) to 100 (exhausted);
   recommend rotation when projected performance drops below 50% of peak within 3 days.
   Write `creative_fatigue.json`.

5. **Budget pacing.** Run `scripts/budget_pacing.py` using exponential smoothing (not
   linear extrapolation) with weekday/weekend and event awareness. Alert when projected
   month-end spend deviates from plan beyond the threshold (default 10%).

6. **Decision gate — anomaly response.** When a Critical anomaly fires (daily spend >150%
   of plan, CPA >2σ, or a projected pacing overrun), use **AskUserQuestion** before
   recommending an intervention: pause the offending entity, cap budget, or monitor one
   more day? Present the entity, the delta, and the projected waste; do not unilaterally
   prescribe a spend change.

7. **Search-term mining (Deep mode).** Run `scripts/search_term_analysis.py` to flag waste
   (high impressions/zero conversions above a spend threshold, CPA >3× campaign average,
   irrelevant matches), cluster into themes, recommend match type, and estimate monthly
   savings. Write `negative_keywords.json`.

8. **Snapshot + insights.** Assemble `workspace/reports/media_performance_snapshot.html`.
   Every generated insight names direction, magnitude, period, and root cause (e.g.
   "Search CPA +23% WoW driven by broad-match expansion in Campaign X").

9. **FS-mode gate.** For financial-services clients: flag ads missing required risk
   disclosures, avoid prohibited discriminatory targeting (ECOA/fair lending), and route
   new creatives/ad copy through **compliance-review** before distribution (archived per
   SEC Rule 17a-4).

**Cross-skill wiring:** `data-extraction` lands raw files upstream;
`attribution-analysis` consumes `unified_media_performance.csv` for MMM channel
decomposition and its budget optimization informs pacing targets; `reporting`
consumes pacing and creative data; `funnel-analysis` consumes post-click
landing-page conversion. Support incremental appends rather than full reloads.

## Output Format

```
## Paid Media — <account / date range>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Mode: Quick | Standard | Deep   Currency: <reporting ccy>

Efficiency: blended ROAS=<v>, CPA=<v> vs target <v>
Anomalies: <n> flagged (<n> Critical) — top: <entity> <metric> <delta>
Creative: <n> creatives fatigued (score >70)
Pacing: projected month-end <v> vs plan <v> (<variance>%) — <alert level>
Artifacts: workspace/processed/unified_media_performance.csv, workspace/analysis/*.json,
           workspace/reports/media_performance_snapshot.html
```

Completion status:
- `DONE` — normalized and all requested diagnostics written.
- `DONE_WITH_CONCERNS` — completed with caveats (partial platform coverage, FX
  gaps, dedup uncertainty); state them.
- `BLOCKED` — normalization failed (missing columns, unmappable schema); name the file.
- `NEEDS_CONTEXT` — missing plan/targets, currency choice, or the raw export (state what).

## Anti-Patterns

- **Do not** score anomalies, fatigue, or pacing by eye — scripts compute them.
- **Do not** flag creative fatigue on raw CTR; use conversion-weighted CTR.
- **Do not** project pacing with linear extrapolation.
- **Do not** ignore day-of-week/event seasonality — it manufactures false anomalies.
- **Do not** double-count conversions when platforms both claim the same event.
- **Do not** use floats for money; use `decimal.Decimal`.
- **Do not** prescribe a spend cut on a Critical anomaly without confirming the response.
- **Do not** ship FS ad creative without a compliance-review pass.

Builder-facing acceptance criteria and engineering conventions live in the
plugin's `references/authoring-notes.md`, not in this runtime body.
