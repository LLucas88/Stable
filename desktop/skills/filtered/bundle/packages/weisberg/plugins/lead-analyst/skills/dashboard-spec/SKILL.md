---
name: weisberg-dashboard-spec
description: 'Use this skill to design a dashboard specification from an operating decision: audience, cadence, metrics, definitions, source of truth, layout, alerts, drilldowns, states, and governance. Trigger on phrases like dashboard spec, design a dashboard, KPI dashboard requirements, operating dashboard, scorecard spec, dashboard PRD, what should this dashboard show, or dashboard wireframe.'
metadata:
  source-name: dashboard-spec
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Dashboard Spec

## Contract

You are the analytics product lead for dashboards. Your job is to design a
dashboard that supports an operating decision, not a decorative wall of charts.

This skill produces a dashboard specification; it does not build the dashboard and
does not mutate data. If metrics are undefined, route to `metric-contract`. If
source trust is unclear, route to `source-inventory` or `data-quality-audit`. If
the task is to judge an existing dashboard rather than design a new one, use
`dashboard-audit`.

Read `references/analysis-standards.md` for the analytical spine.

## Workflow

### Phase 1: Evidence — the Decision and the Available Sources

1. Name the operating decision the dashboard serves: the audience, the recurring
   meeting/cadence, the decision owner, and the action threshold. A dashboard with
   no recurring decision is a report, not an operating surface — say so.
2. Inventory what data actually exists to power it: check `workspace/`, `data/`,
   schema docs, `dbt/`, existing dashboards, and prior specs. Do not spec a tile
   whose data does not exist; mark such tiles as **blocked on new instrumentation**.

### Phase 2: Choose the Metric Set From the Decision Down

Include only: the **primary metric** the decision turns on, **guardrails** (what
must not break while optimizing it), **diagnostic** metrics that explain the
primary, the **segments** that matter, and **freshness** indicators. Exclude any
chart with no action attached — every tile must answer "what would a reader do
differently based on this?"

### Phase 3: Define Every Load-Bearing Metric

Link or create a `metric-contract` for each load-bearing KPI: numerator,
denominator, grain, source of truth. Undefined metrics on a recurring dashboard
guarantee the "why do the numbers disagree" problem later.

### Phase 4: Information Hierarchy, States, Interactions

1. **Hierarchy.** Top row = the answer (primary + status), second row = drivers,
   drilldowns = diagnosis, appendix = analyst detail.
2. **States.** Specify loading, empty, stale, partial-data, data-quality-warning,
   access-denied, and metric-definition-changed states. Omitted states are where
   dashboards silently mislead.
3. **Interactions.** Filters, drilldowns, cohort/segment toggles, annotations,
   export, alerts — each must preserve metric meaning.

### Phase 5: Decision Gate — Audience Split and Scope

The classic dashboard failure is cramming executive monitoring and analyst
exploration onto one surface. When the audience or scope is not fixed, ask with
`AskUserQuestion`:

- **Audience** — a single executive monitoring surface, a single analyst
  exploration surface, or an explicitly two-tier design (monitor + drill).
- **Scope** — a tight decision scorecard vs a broad operating overview (broader
  means more tiles earning their place under more scrutiny).

Hard STOP rule: do not spec a single dashboard that serves both a "glance in 30
seconds" executive and a "slice for an hour" analyst — split it or pick one, and
say which.

### Phase 6: Governance

Owner, refresh cadence, data tests, review cadence, and change control for the
definitions. Without change control, the spec decays the first time a metric
definition shifts.

## Output Format

```markdown
# Dashboard Spec: <name>

**Audience:** ...
**Operating decision:** ...
**Cadence / meeting:** ...
**Owner:** ...

## Metrics (primary / guardrail / diagnostic)
## Layout And Hierarchy
## Filters And Drilldowns
## Alerts And Thresholds
## Data Sources (and any blocked on instrumentation)
## States And Edge Cases
## Governance
## Build Notes
```

Save the spec to `workspace/analysis/lead-analyst/dashboard-specs/` if
`workspace/` exists, otherwise `analysis/lead-analyst/dashboard-specs/`, using:

```text
YYYYMMDD-HHMMSS-dashboard-spec-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Primary metric: <the one the decision turns on>
Next skill: /lead-analyst:metric-contract | source-inventory | dashboard-audit
Open concerns: <none or list — e.g. tiles blocked on new instrumentation>
```

Use `DONE_WITH_CONCERNS` when the spec is usable but some tiles depend on data
that does not yet exist; `BLOCKED` when no operating decision can be identified;
`NEEDS_CONTEXT` when the audience or load-bearing metric definitions are unknown.

## Anti-Patterns

- Designing from available charts instead of operating decisions.
- Mixing executive monitoring and analyst exploration in one crowded surface.
- Including a tile with no action attached.
- Omitting stale-data and partial-data states.
- Adding filters that invalidate metric definitions.
- Speccing tiles whose backing data does not exist without flagging it.
- Forgetting owner, cadence, and change control.
