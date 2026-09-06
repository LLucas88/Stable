---
name: weisberg-reporting
description: Use when the user mentions dashboard, report, executive summary, performance summary, weekly report, monthly report, data visualization, chart, graph, KPI dashboard, marketing scorecard, insight generation, report automation, stakeholder update, board deck, or performance review. Also trigger on 'summarize our marketing performance' or 'create a deck for leadership.' This skill synthesizes the outputs other marketing-analytics skills already wrote to workspace/analysis/ into deliverables. It does not vet metric correctness or data quality — for reviewing whether a dashboard can be relied on, use lead-analyst:dashboard-audit; to land raw data use data-extraction. In financial services mode, reports with performance claims route through compliance-review before distribution.
metadata:
  source-name: reporting
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Dashboard & Reporting Automation

**Role:** Fix-allowed within `workspace/reports/`. You are the **terminal
synthesis layer** — you aggregate analysis other skills already produced and
translate it into executive narrative. **Hard gate: you do not compute new
statistics. If a metric is missing, report the gap and name the skill that
produces it — do not invent the number.**

## Contract

**When to use**
- Aggregating finished `workspace/analysis/*.json` outputs into an executive
  dashboard, weekly/monthly summary, board deck, or narrative report.
- Cross-skill KPI synthesis (blended ROAS, portfolio conversion rate, weighted CLV)
  and priority-ranked natural-language insights.

**When NOT to use** (route instead)
- Auditing whether a dashboard's numbers are *trustworthy* (freshness, metric
  definitions, misleading charts) → `lead-analyst:dashboard-audit`.
- Producing the underlying analysis (no analysis files exist yet) → run the
  matching analytics skill first.
- Landing/normalizing raw data → `data-extraction`.

**Mode classification** (declare which)

| Mode | Trigger | Scope |
|---|---|---|
| **Quick** | "what's the headline this week" | Aggregate + top-3 insights, no full dashboard. |
| **Standard** | Weekly/monthly report | Aggregate → insights → charts → HTML dashboard. |
| **Deep** | QBR / board deck | Standard + multi-format (XLSX/PPTX/DOCX) and FS compliance gate. |

**Cross-skill synthesis inputs** — this is the explicit consumption loop. Reporting
discovers every `workspace/analysis/*.json`; the table names what each source
contributes so the narrative attributes correctly and flags what is missing.

| Source skill | Consumed from `workspace/analysis/` | Contributes to the report |
|---|---|---|
| attribution-analysis | `mmm_channel_contributions.json`, `mmm_budget_optimization.json`, `mmm_diagnostics.json` | Channel contribution, budget reallocation, blended ROAS. |
| experimentation | `experiment_results.json`, `incrementality_results.json` | Lift, significance, confidence intervals. |
| paid-media | `media_anomalies.json`, `creative_fatigue.json`, `negative_keywords.json` (+ `processed/unified_media_performance.csv`) | Media ROAS/CPA, spend efficiency, anomalies. |
| audience-segmentation | segment profiles / migration matrices | Segment mix and movement. |
| clv-modeling | CLV distributions / cohort retention | Weighted CLV, retention curves. |
| funnel-analysis | funnel conversion / drop-off | Conversion rates, bottlenecks. |
| email-analytics | campaign performance / deliverability | Engagement, deliverability. |
| web-analytics | session / page performance | Traffic and journeys. |
| seo-content | keyword rankings / organic traffic | Organic trends. |
| crm-lead-scoring | pipeline / win-rate | Pipeline health. |
| social-analytics | engagement / sentiment | Share of voice, sentiment. |
| competitive-intel | market-share / competitor benchmarks | Competitive context. |
| voc-analytics | NPS / CSAT / theme clusters | Voice-of-customer. |
| compliance-review | `workspace/compliance/review_report.json` | Required disclaimers / flags (FS mode). |

**Contract references:** `references/report_templates.md`,
`references/insight_patterns.md`, `references/visualization_guide.md`,
`shared/schemas/data_contracts.md`.

**Outputs**

| Path | Description |
|---|---|
| `workspace/reports/executive_dashboard.html` | Interactive cross-skill dashboard. |
| `workspace/reports/weekly_summary.html` | Weekly snapshot with insights. |
| `workspace/reports/data_export.xlsx` | Underlying data tables (via `xlsx` skill). |
| `workspace/reports/leadership_deck.pptx` | Slide deck (via `pptx` skill). |

## Workflow

1. **Aggregate (evidence gate).** Run `scripts/aggregate_outputs.py` to discover and
   merge every `workspace/analysis/*.json`. Validate incoming data against
   `shared/schemas/data_contracts.md`. Align dates across skills into one KPI frame and
   compute derived cross-skill metrics (blended ROAS, portfolio conversion rate, weighted
   CLV). **Log which skills produced outputs and which are missing** — proceed with what
   exists; never fabricate a missing skill's numbers.

2. **Coverage gate — decide scope on partial data.** If fewer than the expected sources
   are present (e.g. a "full portfolio" report but only 2 of the analysis files exist),
   use **AskUserQuestion**: proceed with a partial report (clearly labeled), or pause
   until the missing skills run? Name exactly which sources are absent.

3. **Insights.** Run `scripts/generate_insights.py` to detect top movers, trend
   reversals, and anomalies (flag deviations beyond 2σ of trailing averages). Translate
   effect sizes and p-values into plain-English recommendations using
   `references/insight_patterns.md`. Every insight cites the specific metric, magnitude,
   and time period, and attributes it to its source skill — no vague claims.

4. **Charts.** Run `scripts/generate_charts.py` with automated type selection (time series
   → line/area; categorical → bar; part-to-whole → stacked/treemap; flows → funnel;
   correlation → scatter/heatmap; distribution → histogram/box). All charts use
   colorblind-safe palettes and include alt text (`references/visualization_guide.md`).

5. **Assemble.** Run `scripts/build_dashboard.py` to produce self-contained HTML (inlined
   CSS/JS, base64 images) at `workspace/reports/executive_dashboard.html` and/or
   `weekly_summary.html`.

6. **Multi-format (Deep mode).** For XLSX/PPTX/DOCX, delegate to the `xlsx`, `pptx`, and
   `docx` skills via their SKILL.md conventions — do not generate those formats directly.

7. **FS-mode gate (HARD STOP for distribution).** If the workspace is tagged financial
   services and the report contains performance or return data, route it through
   **compliance-review** before distribution. Apply GIPS where applicable, put
   disclaimers on every page/slide with performance data, never present back-tested
   results without clear labeling, and add the regulatory footer. Do not mark a
   customer-facing FS report DONE until compliance-review has run.

## Output Format

```
## Marketing Report — <period / audience>
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Mode: Quick | Standard | Deep

Sources synthesized: <n> of <expected> (missing: <skill list>)
Top movers:
- <metric> <delta> (<period>) — source: <skill>
Artifacts: workspace/reports/executive_dashboard.html [+ xlsx/pptx if requested]
FS gate: N/A | routed through compliance-review (<status>)
```

Completion status:
- `DONE` — aggregated ≥ the requested sources, insights + dashboard written (FS
  gate cleared where applicable).
- `DONE_WITH_CONCERNS` — partial-source or stale-data report, clearly labeled;
  state which sources were missing.
- `BLOCKED` — no analysis outputs exist to synthesize, or the FS compliance gate
  returned FAIL; name the blocker.
- `NEEDS_CONTEXT` — missing the audience, period, or format choice (state what).

## Anti-Patterns

- **Do not** compute new statistics — synthesize what other skills produced.
- **Do not** invent a missing skill's numbers; report the gap and name the source.
- **Do not** emit vague insights; cite metric, magnitude, period, and source skill.
- **Do not** generate XLSX/PPTX/DOCX directly; delegate to those skills.
- **Do not** ship charts without alt text or colorblind-safe palettes.
- **Do not** distribute an FS performance report before compliance-review clears it.

Builder-facing acceptance criteria and engineering conventions live in the
plugin's `references/authoring-notes.md`, not in this runtime body.
