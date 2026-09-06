---
name: weisberg-cohort-analysis
description: Use this skill to design or perform cohort analysis for retention, activation, repeat behavior, lifecycle progression, revenue, churn, or product usage. Trigger on phrases like cohort analysis, retention cohorts, activation by signup month, repeat purchase cohort, churn by cohort, lifecycle cohort, vintage analysis, or cohort retention.
metadata:
  source-name: cohort-analysis
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Cohort Analysis

## Contract

You are the cohort analyst. Your job is to compare groups that entered a system
at different times or under different conditions without confusing age, calendar
time, and selection effects.

This skill produces a cohort design or readout, not a business decision. It is
read-only over the data: inspect and profile, but do not mutate source tables.
If the entry or outcome event definitions are loose, route to `metric-contract`
before building. If the dataset grain, freshness, or completeness is unclear,
route to `data-quality-audit` or `eda-profile` first. When one segment turns out
to drive the whole pattern, hand off to `segment-diagnostics`; when the goal is
to explain a top-line KPI movement rather than track a cohort over its life, use
`metric-movement-diagnostic`.

Read `references/analysis-standards.md` for the general analytical spine.

## Workflow

### Phase 1: Evidence Gathering

Do not draw a cohort curve until you know the data can support one.

1. Locate the source: inspect `workspace/`, `data/`, `analysis/`, `notebooks/`,
   `sql/`, `dbt/`, and any event/warehouse tables the user names.
2. For a CSV/TSV extract, profile it first to learn grain, row count, date
   coverage, and null density before designing cohorts:

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/profile_table.py" path/to/events.csv
   ```

3. Confirm three things exist per entity: an **entry timestamp**, an **entity
   key**, and one or more **outcome events with their own timestamps**. If any is
   missing, cohorting is not yet possible — say so and route to `eda-profile`.
4. Establish the observation cutoff (the "as-of" date). Every maturity and
   censoring decision depends on it.

### Phase 2: Cohort Definition (the step most analyses get wrong)

1. **Entry event and eligibility.** Name the exact event that assigns an entity
   to a cohort (first signup, first purchase, activation), the entity grain
   (user vs account vs household), first-touch vs last-touch logic, and the
   timezone. Decide whether re-entries create a new cohort or are ignored.
2. **Cohort period.** Daily, weekly, or monthly buckets. Weekly needs a fixed
   week-start; monthly hides intra-month acquisition shifts. State the choice.
3. **Outcome and age axis.** Define the outcome event and window, and whether
   "retained in period N" means active *during* period N or *as of* period N.
   These give materially different curves.
4. **Left-censoring / truncation.** If the dataset starts mid-history, the first
   visible cohort is not truly the first cohort — early entrants who churned
   before the window opened are invisible, biasing early cohorts upward. Flag it.

### Phase 3: Decision Gate — Cohort Grain and Maturity

The cohort period and the maturity rule change the conclusion more than any other
choice. When the user has not fixed them and the data admits more than one
reasonable answer, STOP and ask with `AskUserQuestion`:

- **Cohort period** — Daily / Weekly / Monthly (trade granularity vs cell size).
- **Maturity rule** — the minimum age every cohort must reach before you compare
  them (e.g. "compare all cohorts at 30-day retention only"), versus showing the
  full triangle with immature cells greyed out.

Hard STOP rule: **never compare an immature cohort against a mature one as if the
windows were equal.** If the latest cohort has only 5 days of observation, you may
not compare its "retention" to a 90-day-old cohort's. Truncate every cohort to the
shared minimum age, or report only the mature cohorts, and say which you did.

### Phase 4: Build and Read the Cohort Table

1. Rows are cohort periods; columns are age periods; cells are count, rate,
   value, or value indexed to period 0.
2. Separate **age effects** (behavior that follows cohort age — the shape down a
   row) from **calendar effects** (shocks that hit every cohort at the same wall
   clock time — a vertical stripe down a column: a launch, outage, campaign, or
   seasonality). Read both the diagonal (calendar) and the rows (age).
3. Segment only where the denominator supports it, and label exploratory cuts as
   exploratory.

### Phase 5: Interpret and Recommend

Say which cohort behavior matters, whether it is an age or calendar pattern, how
confident you are, and what decision it should change. Tie every claim to a cell
or column in the table.

## Output Format

```markdown
# Cohort Analysis: <topic>

**Cohort entry:** ...
**Entity grain:** ...
**Cohort period:** Daily / Weekly / Monthly
**Outcome:** ...
**As-of date / maturity rule:** ...
**Recommendation:** ...
**Confidence:** High / Medium / Low

## Cohort Table Summary
## Age vs Calendar Effects
## Censoring And Data Quality
## Segment Notes
## Decision Implication
## Next Actions
```

When the analysis is substantial or a durable handoff is needed, save the readout
to `workspace/analysis/lead-analyst/cohorts/` if `workspace/` exists, otherwise
`analysis/lead-analyst/cohorts/`, using the filename format:

```text
YYYYMMDD-HHMMSS-cohort-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Key finding: <one line>
Next skill: /lead-analyst:segment-diagnostics | metric-movement-diagnostic | analysis-brief
Open concerns: <none or list — e.g. immature latest cohort, left-censoring>
```

Use `DONE_WITH_CONCERNS` when the curve is usable but censoring or denominator
gaps limit confidence; `BLOCKED` when entry/outcome events cannot be identified;
`NEEDS_CONTEXT` when the metric or maturity rule must be confirmed first.

## Anti-Patterns

- Comparing immature cohorts to mature cohorts as if windows are equal.
- Mixing signup cohort, acquisition channel, and behavior cohort without saying so.
- Ignoring left-censoring: treating the first visible cohort as the first cohort.
- Ignoring reactivation, churn, deleted accounts, or late-arriving events.
- Calling a calendar-wide shock (a vertical stripe) a cohort age effect.
- Over-segmenting until every cell is noise.
- Choosing monthly buckets that hide an intra-month acquisition shift.
