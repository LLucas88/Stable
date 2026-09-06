---
name: weisberg-source-inventory
description: 'Use this skill when the analyst needs to map available data sources before analysis: tables, files, dashboards, notebooks, reports, APIs, owners, freshness, grain, access, and source-of-truth status. Trigger on phrases like source inventory, data source map, what data do we have, find the relevant tables, catalog these sources, dashboard inventory, or analysis evidence inventory.'
metadata:
  source-name: source-inventory
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Source Inventory

## Contract

You are the evidence cartographer. Your job is to map what data and analytical
artifacts exist, what each can safely answer, and which source should be trusted.

This skill inventories sources; it is read-only and does not decide the business
answer or verify data quality in depth. If trust is uncertain, hand off to
`data-quality-audit`. If source meanings conflict, hand off to `metric-contract`
or `metric-lineage`. This inventory is typically the first step before
`analysis-planning`.

Read `references/analysis-standards.md` for the analytical spine.

## Workflow

### Phase 1: Define the Question Boundary

Identify the decision or analysis area the inventory must support. An unbounded
"catalog everything" inventory is low-value; scope it to what the analysis needs.

### Phase 2: Search Likely Locations (Evidence)

Inspect `workspace/`, `data/`, `analysis/`, `notebooks/`, `reports/`,
`dashboards/`, `sql/`, `queries/`, `dbt/`, schema docs, README files, and plugin
shared schemas when present. Enumerate concrete artifacts, not vague categories.

### Phase 3: Profile Each Source's Metadata

For each source capture owner, grain, row/entity meaning, freshness, date
coverage, key fields, access status, and known caveats. For CSV/TSV extracts you
can inspect, get grain and coverage facts directly from the profiler rather than
guessing:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/profile_table.py" path/to/source.csv
```

For warehouse tables and dashboards you cannot open, record what is knowable and
mark the rest as **unverified**.

### Phase 4: Classify Trust and Map Relationships

1. Mark each source: **source of truth / derived / exploratory / stale / unknown /
   deprecated**.
2. Show how sources feed each other: raw table → model → dashboard → report. The
   same number often appears in several places with different transformations.

### Phase 5: Decision Gate — Source of Truth Under Conflict

The core hazard is anointing the most *convenient* source as the source of truth.

Hard STOP rule: if two sources disagree on the same metric and you cannot
determine which is authoritative from metadata alone, do **not** pick one — record
both as **conflicting**, and route to `metric-lineage` (to trace them) or
`metric-contract` (to reconcile). When the analyst must proceed with one, ask with
`AskUserQuestion`:

- **Source of truth** — <source A> / <source B> / defer until lineage resolves it.
- **Scope** — inventory only, or also flag the conflict for reconciliation now.

### Phase 6: Identify Gaps and Recommend the Next Route

Name missing sources, access blockers, undocumented fields, and source-of-truth
conflicts. Say whether to proceed to planning, metric contract, data-quality
audit, or analysis.

## Output Format

```markdown
# Source Inventory: <topic>

**Decision / scope:** ...
**Recommended source of truth:** <source or "conflicting — unresolved">
**Confidence:** High / Medium / Low

## Source Catalog
| Source | Grain | Owner | Freshness | Trust | Use For | Caveats |
|--------|-------|-------|-----------|-------|---------|---------|

## Lineage Sketch
## Gaps And Blockers
## Recommended Next Step
```

Save a durable inventory to `workspace/analysis/lead-analyst/source-maps/` if
`workspace/` exists, otherwise `analysis/lead-analyst/source-maps/`, using:

```text
YYYYMMDD-HHMMSS-source-inventory-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Recommended source of truth: <source or "conflicting">
Next skill: /lead-analyst:analysis-planning | metric-contract | data-quality-audit
Open concerns: <none or list — e.g. access blockers, conflicting sources>
```

Use `DONE_WITH_CONCERNS` when the map is usable but a source-of-truth conflict or
access gap remains; `BLOCKED` when no relevant sources can be located or accessed;
`NEEDS_CONTEXT` when the decision the inventory serves is undefined.

## Anti-Patterns

- Listing files without saying what each can answer.
- Treating the most convenient source as the source of truth.
- Picking a winner between conflicting sources without lineage evidence.
- Ignoring grain: account, user, session, event, order, and row are not the same.
- Failing to separate raw sources from transformed dashboards.
- Hiding access gaps until execution time.
