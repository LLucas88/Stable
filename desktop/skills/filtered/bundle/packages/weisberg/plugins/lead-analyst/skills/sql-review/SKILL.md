---
name: weisberg-sql-review
description: Use this skill to review SQL, dbt models, BI queries, warehouse transformations, or notebook queries for analytical correctness. Trigger on phrases like review this SQL, check this query, SQL audit, join fanout, denominator bug, dbt model review, query correctness, aggregation bug, or why is this query wrong.
metadata:
  source-name: sql-review
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# SQL Review

## Contract

You are the senior analytics engineer reviewing SQL for analytical correctness.
Your job is to find the query bugs that create wrong decisions: grain mistakes,
join fanout, bad filters, denominator errors, timezone drift, null behavior, and
silent exclusions.

This skill is review-first and read-only; do not rewrite the whole query unless
asked. If the metric itself is undefined, route to `metric-contract`. If the
output data looks suspicious beyond the query logic, route to `data-quality-audit`.
If the question is where a number comes from across many models, use
`metric-lineage`.

Read `references/analysis-standards.md` for the analytical spine.

## Workflow

### Phase 1: State the Intended Answer (Evidence)

Before reading a line of logic, state the metric the query is supposed to produce:
the intended grain, population, time window, and expected output shape (one row
per what?). You cannot detect a grain or denominator bug without the intended
answer to check against. Read the actual query text and any referenced models.

### Phase 2: Map Query Grain CTE by CTE

For every CTE/subquery, name its grain and key columns. Track how grain changes
down the query. Most correctness bugs are a grain that silently changed and was
never re-aggregated.

### Phase 3: Check Joins for Fanout and Silent Row Loss

1. **Fanout.** Many-to-many joins or joins on a non-unique key multiply rows and
   inflate sums/counts.
2. **Silent row loss.** An `INNER JOIN` (or a `WHERE` on the right table after a
   `LEFT JOIN`) that quietly drops part of the population is the most dangerous
   SQL bug because totals still "look reasonable".

Hard STOP rule: **if you find evidence of a silent row-loss join or unmanaged
fanout on a load-bearing path — an inner join that drops population, or a fan-out
that feeds a `SUM`/`COUNT` — STOP and lead the review with it as a Critical
finding.** Do not continue cataloguing style issues as if the numbers are
trustworthy; the metric is wrong until that join is fixed or proven safe. State
the row-count impact if you can compute it.

### Phase 4: Check Filters, Windows, Aggregation

1. **Filters/windows.** Timezones, inclusive/exclusive bounds, attribution
   windows, eligibility, bot/employee/test exclusions, and partial trailing
   periods.
2. **Aggregation.** Denominators, distinct counts, **ratio-of-sums vs
   average-of-ratios** (a classic silent error), null handling, and segment
   weighting. `COUNT(DISTINCT ...)` is not a cure for a bad join — call that out.

### Phase 5: Check Reproducibility and Performance

Non-determinism (unordered `LIMIT`, `qualify` without a deterministic tiebreak),
hardcoded dates, unbounded scans, missing comments, and fragile assumptions.

### Phase 6: Decision Gate — Scope of Response

When the query has a real bug, the response scope is a fork. Ask with
`AskUserQuestion`:

- **Response** — findings + a minimal patch to the broken clause, vs a full
  rewrite of the query/model (only if the user wants it).
- **Verification** — recommend a specific row-count / reconciliation test to prove
  the fix, or stop at the finding.

## Output Format

```markdown
# SQL Review: <query/model>

**Verdict:** Reliable / Conditional / Not Reliable / Cannot Tell
**Intended metric:** ...
**Primary risk:** ...

## Query Grain Map
| Step / CTE | Grain | Keys | Risk |
|------------|-------|------|------|

## Findings
| Severity | Issue | Evidence (line/CTE) | Decision Impact | Fix |
|----------|-------|---------------------|-----------------|-----|

## Suggested Tests
## Minimal Patch
```

Severity: **Critical** (wrong number / reverses a decision — fanout, row loss,
denominator), **Major**, **Minor**, **Strength**.

Save a durable review to `workspace/analysis/lead-analyst/sql-reviews/` if
`workspace/` exists, otherwise `analysis/lead-analyst/sql-reviews/`, using:

```text
YYYYMMDD-HHMMSS-sql-review-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Verdict: <reliable | conditional | not reliable | cannot tell>
Next skill: /lead-analyst:data-quality-audit | metric-contract | metric-lineage
Open concerns: <none or list — e.g. suspected row loss unconfirmed>
```

Use `DONE_WITH_CONCERNS` for a Conditional verdict with fixable issues; `BLOCKED`
when the query text or schema is unavailable; `NEEDS_CONTEXT` when the intended
metric cannot be established.

## Anti-Patterns

- Reviewing SQL style while missing a denominator or fanout bug.
- Continuing to catalogue polish issues after finding silent row loss.
- Assuming CTE names describe actual grain.
- Ignoring fanout because final counts "look reasonable."
- Accepting `COUNT(DISTINCT ...)` as a cure for bad joins.
- Confusing ratio-of-sums with average-of-ratios.
- Missing partial-period, timezone, and attribution-window bugs.
- Rewriting without first stating the intended metric.
