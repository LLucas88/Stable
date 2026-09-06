---
name: weisberg-dashboard-audit
description: Use this skill to review an existing dashboard for decision usefulness, metric definition quality, freshness, misleading charts, broken filters, stale data, alert thresholds, and governance. Trigger on phrases like dashboard audit, review this dashboard, can execs trust this dashboard, dashboard QA, misleading chart, stale dashboard, KPI scorecard review, or dashboard health check.
metadata:
  source-name: dashboard-audit
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Dashboard Audit

## Contract

You are the dashboard auditor. Your job is to decide whether the dashboard helps
the audience make the right decision, or whether it creates false confidence.

This skill reviews an existing dashboard or scorecard; it is read-only and does
not redesign it. Use `dashboard-spec` when the answer is "rebuild it from the
decision", `metric-lineage` when a specific number must be traced upstream,
`metric-contract` when a KPI lacks a canonical definition, and `data-quality-audit`
when the underlying data trust is the core problem.

Read `references/data-quality-checklist.md` for the trust lens applied here.

## Workflow

### Phase 1: Gather the Evidence

Collect what the dashboard actually shows before judging it: the tiles and their
metrics, the queries or data sources behind them (search `sql/`, `dbt/`,
BI-export files, or the dashboard config the user provides), the last-refresh
signals, and the applied filters/date ranges. If you can only see a screenshot,
say so — you can audit what is visible but not the hidden query logic.

### Phase 2: Audience and Decision

Identify who uses this dashboard and what decision or action it drives. **If the
dashboard has no clear decision or action, that is itself a finding** and often
the most important one — a decorative wall of charts.

### Phase 3: Audit Metric Trust

For each load-bearing tile: source of truth, numerator, denominator, grain,
filters, time windows, and ownership. A chart without a denominator or a clear
time window cannot be trusted regardless of how polished it looks.

### Phase 4: Audit Freshness and Visual Truthfulness

1. **Freshness.** Is last refresh visible? Are partial periods, failed loads, and
   stale data obvious to the reader, or silently rendered as a decline?
2. **Visual truthfulness.** Truncated/zeroed axes, dual axes, misleading stacking,
   inconsistent color semantics, ranking without denominators, over-smoothing,
   and charts that imply causation from correlation.

### Phase 5: Audit Interactions and Operating Usefulness

Filters, drilldowns, exports, and date ranges must preserve metric meaning (a
filter that silently changes the denominator is a critical bug). Check whether the
dashboard shows action thresholds, owners, annotations, guardrails, and the next
diagnostic path.

### Phase 6: Decision Gate — Verdict Threshold

Findings range from decision-blocking to cosmetic. When the review turns up at
least one issue that could reverse a decision, do not bury it among polish notes.
Ask with `AskUserQuestion` when the fix scope is a real fork:

- **Response** — issue a corrective note against the existing dashboard vs
  recommend a full rebuild via `dashboard-spec`.
- **Depth** — trust/decision audit only vs also trace a suspect number via
  `metric-lineage`.

Hard STOP rule: if any load-bearing metric is **misleading** (wrong denominator,
truncated axis that inverts the story, or silently stale beyond its decision
cadence), mark the dashboard **Not Reliable** and lead with that — do not average
it away against tiles that happen to be fine.

## Output Format

```markdown
# Dashboard Audit: <dashboard>

**Verdict:** Reliable / Conditional / Not Reliable / Not Decision-Useful
**Audience fit:** Good / Mixed / Poor
**Decision it serves:** ...

## Findings
| Severity | Issue | Evidence | Decision Impact | Fix |
|----------|-------|----------|-----------------|-----|

## What Works
## Definition And Lineage Gaps
## Recommended Fix Order
```

Severity: **Critical** (could reverse a decision), **Major** (misleads
confidence), **Minor** (polish), **Strength** (preserve).

Save a durable audit to `workspace/analysis/lead-analyst/dashboard-audits/` if
`workspace/` exists, otherwise `analysis/lead-analyst/dashboard-audits/`, using:

```text
YYYYMMDD-HHMMSS-dashboard-audit-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Verdict: <reliable | conditional | not reliable | not decision-useful>
Next skill: /lead-analyst:dashboard-spec | metric-lineage | data-quality-audit
Open concerns: <none or list>
```

Use `DONE_WITH_CONCERNS` for a Conditional verdict with fixable issues; `BLOCKED`
when only a screenshot is available and trust cannot be established; `NEEDS_CONTEXT`
when the audience/decision the dashboard serves is unknown.

## Anti-Patterns

- Reviewing dashboard aesthetics while ignoring metric trust.
- Accepting a chart without denominator and time-window clarity.
- Missing filters that silently change metric meaning.
- Averaging a misleading load-bearing tile away against fine ones.
- Treating stale-data warnings as nice-to-have.
- Recommending more charts instead of sharper decisions.
