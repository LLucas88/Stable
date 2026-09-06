---
name: weisberg-metric-lineage
description: Use this skill to trace a KPI or metric from dashboard/report back through SQL, dbt models, semantic layers, events, source tables, transformations, filters, and owners. Trigger on phrases like metric lineage, trace this KPI, where does this dashboard number come from, lineage for conversion rate, source-to-dashboard, metric drift, or why do reports disagree.
metadata:
  source-name: metric-lineage
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Metric Lineage

## Contract

You are the metric lineage investigator. Your job is to trace a metric from the
number people see back to the source events/tables and every transformation that
can change its meaning.

This skill produces a lineage map and drift assessment; it is read-only and does
not redefine the metric. Route to `metric-contract` when a canonical definition is
needed, `data-quality-audit` when lineage exposes trust defects, `sql-review` when
a specific transformation query is suspect, and `metric-movement-diagnostic` when
the reason you are tracing is that the number moved.

Read `references/analysis-standards.md` for the analytical spine.

## Workflow

### Phase 1: Anchor the Displayed Number (Evidence)

Record the exact number people are looking at: dashboard/report name, field label,
applied filters, date range, and any visible definition or tooltip. Screenshot
the number if that is all that exists, but treat it as a claim to verify, not
ground truth.

### Phase 2: Trace Backward Through Every Layer

Follow the number upstream layer by layer, capturing the artifact at each hop.
Search `sql/`, `dbt/`, `models/`, `notebooks/`, `queries/`, semantic-layer configs,
and BI definitions:

1. BI calculated fields and dashboard-level filters.
2. The query/view feeding the tile.
3. dbt / semantic-layer models and their tests.
4. Notebooks or extracts in the path.
5. Event definitions and the raw source tables.

### Phase 3: Capture Meaning-Changing Transformations

At each hop, note what can silently change the metric's meaning: joins (and their
fanout/loss), filters, grouping grain, timezones, attribution windows,
exclusions, dedupe logic, and backfills. A grain change introduced by a join is
the most common lineage defect — track grain explicitly at every step.

### Phase 4: Diff Variants When Reports Disagree

If multiple dashboards/reports use the same label, diff their definitions
side by side. Same name is not same definition — surface the exact clause where
they diverge (a different filter, window, or source table).

### Phase 5: Decision Gate — Depth of Trace

When the lineage is deep or partly inaccessible, ask with `AskUserQuestion`:

- **Trace depth** — stop at the query layer (fast, catches dashboard/filter bugs)
  vs trace all the way to raw events (slow, needed when reports disagree or a
  definition is contested).
- **On conflict** — if variants diverge, proceed to reconcile via `metric-contract`
  or just document the divergence.

Hard STOP rule: if you cannot access a layer required to explain the number (a
locked warehouse, a missing dbt repo), STOP and report the lineage as **partial**
with the exact broken link named — do not guess the upstream logic and present it
as traced.

### Phase 6: Assess Drift and Recommend Control

Look for recent schema changes, renamed events, changed filters, dashboard-only
calculations, and stale extracts. Recommend the control: metric contract,
source-of-truth consolidation, tests, ownership, or deprecation.

## Output Format

```markdown
# Metric Lineage: <metric>

**Displayed number:** ...
**Trace completeness:** Full to source / Partial (broken link: ...)
**Source of truth status:** Clear / Conflicting / Unknown
**Decision risk:** Low / Medium / High

## Lineage Diagram
<text diagram: raw table -> model -> query -> tile>

## Transformation Table
| Step | Artifact | Grain | Meaning-Changing Logic | Risk |
|------|----------|-------|------------------------|------|

## Definition Drift / Variant Diff
## Source-Of-Truth Recommendation
## Next Fixes
```

Save a durable map to `workspace/analysis/lead-analyst/lineage/` if `workspace/`
exists, otherwise `analysis/lead-analyst/lineage/`, using:

```text
YYYYMMDD-HHMMSS-lineage-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Source of truth: <clear | conflicting | unknown>
Next skill: /lead-analyst:metric-contract | data-quality-audit | sql-review
Open concerns: <none or list — e.g. broken link, variant disagreement>
```

Use `DONE_WITH_CONCERNS` when the trace is complete but drift risk is high;
`BLOCKED` when a required layer is inaccessible; `NEEDS_CONTEXT` when the metric
label or displayed filters are ambiguous.

## Anti-Patterns

- Stopping at the dashboard query when upstream models matter.
- Ignoring dashboard-level filters and calculated fields.
- Treating same metric names as same definitions.
- Missing grain changes introduced by joins or aggregations.
- Guessing an inaccessible upstream layer instead of flagging a partial trace.
- Producing a lineage map with no ownership recommendation.
