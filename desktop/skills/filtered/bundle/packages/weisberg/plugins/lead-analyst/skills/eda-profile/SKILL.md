---
name: weisberg-eda-profile
description: 'Use this skill for exploratory data analysis profiling before deeper analysis: row counts, date coverage, schema, missingness, duplicates, distributions, outliers, categorical levels, grain, and first-cut anomalies. Trigger on phrases like EDA, exploratory data analysis, profile this dataset, inspect this CSV, understand this table, data profiling, distribution check, or what is in this data.'
metadata:
  source-name: eda-profile
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# EDA Profile

## Contract

You are the exploratory data profiler. Your job is to make the dataset legible
before analysis: what it contains, what shape it has, what looks risky, and what
questions it can support.

This skill produces a profile, not a business conclusion, and is read-only over
the data. It does not issue a trust verdict — if the user needs "can we rely on
this for a decision", route to `data-quality-audit`. If they need a recommendation
from the data, route to `analysis-brief`. If the data is event-level and the goal
is retention/lifecycle, hand off to `cohort-analysis`.

Read `references/data-quality-checklist.md` for the risk lens applied here.

## Workflow

### Phase 1: State Intended Context

Note what the user hopes to learn and whether the profile is exploratory or
decision-bound. A profile that will feed an executive metric earns more scrutiny
than one that will guide the next exploratory cut. Locate the file(s) under
`workspace/`, `data/`, `analysis/`, or the path the user gives.

### Phase 2: Run the Profiler (Evidence Before Interpretation)

For any CSV/TSV, run the bundled standard-library profiler first, then layer
analyst interpretation on top of its output:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/profile_table.py" path/to/file.csv
```

It reports row count, column count, columns, duplicate full rows, per-column
missing counts, distinct-count (capped at 1001), and example values — a
dependency-free evidence pack. For non-CSV sources (warehouse tables, parquet,
notebooks), gather the equivalent facts with the tools available and state which
you could not compute.

### Phase 3: Profile Structure and Grain

1. From the distinct counts and examples, propose the **likely grain** (one row
   per what: event, session, user, order, account-day?). Grain is the single most
   load-bearing fact — every later cut depends on it.
2. Identify candidate keys (columns whose distinct count ≈ row count) and date
   columns, and confirm the date coverage window.

### Phase 4: Completeness, Distributions, Time

1. **Completeness.** Missingness by column, obvious sentinel/default values
   (`0`, `-1`, `1900-01-01`, `unknown`), blank categories, and fields needed for
   joins. Flag missingness that clusters by time or segment, not just overall.
2. **Distributions.** Numeric ranges, quantiles, categorical cardinality, top and
   rare values, and outliers. Check outliers against business reality before
   calling them errors.
3. **Time coverage.** Coverage by date, partial or trailing periods, gaps, and
   spikes. A partial final day masquerades as a decline.

### Phase 5: Decision Gate — Grain and Decision-Readiness

If the likely grain is ambiguous (e.g. duplicate keys suggest either a fanned-out
join or a legitimately finer grain), STOP and confirm with `AskUserQuestion`
before you recommend any cut:

- **Grain** — one row per <entity A> / <entity B> / genuinely event-level.
- **Next move** — proceed to a data-quality verdict, start an analysis, or gather
  more source context.

Hard STOP rule: if duplicates at the apparent key are >1% and unexplained, do not
label the dataset "ready for analysis" — surface it as a blocking anomaly and
route to `data-quality-audit`.

### Phase 6: Name Useful Next Cuts

Suggest the first 3-5 analyses worth doing given what the data supports, and
explicitly name the cuts that would be **misleading** with this data (post-hoc
segments, immature periods, missing denominators).

## Output Format

```markdown
# EDA Profile: <dataset>

**Likely grain:** ...
**Rows / columns:** ...
**Date coverage:** ...
**Decision readiness:** Exploration only / Conditional / Ready for next audit

## Structure And Grain
## Completeness
## Distributions
## Time Coverage
## Anomalies And Risks
## Useful Next Cuts
## Cuts To Avoid
```

Save the profile to `workspace/analysis/lead-analyst/profiles/` if `workspace/`
exists, otherwise `analysis/lead-analyst/profiles/`, using:

```text
YYYYMMDD-HHMMSS-eda-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Likely grain: <one line>
Next skill: /lead-analyst:data-quality-audit | cohort-analysis | analysis-brief
Open concerns: <none or list — e.g. unexplained duplicates, partial final period>
```

Use `DONE_WITH_CONCERNS` when the profile is complete but anomalies limit what
the data can support; `BLOCKED` when the file cannot be read or parsed;
`NEEDS_CONTEXT` when grain must be confirmed before recommending cuts.

## Anti-Patterns

- Turning EDA into a recommendation without decision framing.
- Reporting distributions without naming the likely grain.
- Ignoring missingness patterns by time or segment.
- Treating outliers as errors without checking business reality.
- Reading a partial trailing period as a real decline.
- Producing dozens of observations with no next analytical move.
