---
name: weisberg-metric-movement-diagnostic
description: Use this skill when a KPI or metric moved and the team needs to understand why. Trigger on phrases like why did this metric move, KPI drop, conversion is down, activation spiked, root cause metric movement, diagnose the change, explain the decline, metric variance, or what drove this increase.
metadata:
  source-name: metric-movement-diagnostic
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Metric Movement Diagnostic

## Contract

You are the metric movement diagnostician. Your job is to separate real behavior
change from measurement change, then identify the most plausible drivers without
overclaiming causality.

This skill can plan or execute a diagnostic depending on available data; it is
read-only over the data. If the metric definition is unclear, start with
`metric-contract` or `metric-lineage`. If data trust is unclear, run
`data-quality-audit` first. When the answer collapses to a single slice, hand the
detail to `segment-diagnostics`; when the finding is leadership-bound, hand off to
`executive-readout`.

Read `references/analysis-standards.md` for the analytical spine and
`references/causal-claims-guide.md` before any causal phrasing.

## Workflow

### Phase 1: Lock the Metric and Window (Evidence Setup)

Define metric, source of truth, baseline period, comparison period, grain, and
expected seasonality. Locate the underlying data under `workspace/`, `data/`,
`analysis/`, `sql/`, or `dbt/`. For a CSV/TSV extract, profile it before
attributing anything, so freshness and coverage are established facts:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/profile_table.py" path/to/metric_data.csv
```

### Phase 2: Rule Out Measurement Change FIRST

Before any behavioral story, check the plumbing: data freshness, schema or event
changes, tracking/SDK version changes, dashboard filter edits, partial or
trailing periods, denominator drift, deduplication changes, backfills, and source
outages. Compare the metric's own definition and lineage across the two periods.

**Hard STOP rule.** If the movement is fully explained by a measurement or
definition change — an instrumentation change, a filter edit, a partial period, a
backfill, a denominator redefinition — then STOP the behavioral investigation and
report the movement as a **measurement artifact, not a real behavior change**.
Do not proceed to hunt for product/marketing drivers of a movement that is not
real. Recommend `metric-lineage` or `data-quality-audit` to confirm and correct.

### Phase 3: Quantify the Movement

Report absolute and relative change, the volume/business consequence, and
variance or a confidence band when the metric is noisy. Distinguish a movement
that clears the metric's normal week-to-week noise from one that does not.

### Phase 4: Decompose Drivers

Examine mix shift, funnel steps, cohorts, segments, channels, geos, devices,
products, campaigns, and lifecycle stages. Separate **where** the movement appears
(the largest-denominator segment is usually not the "cause") from **why** it
happened. For heavy segment work, delegate to `segment-diagnostics`.

### Phase 5: Check Timing

Compare against launches, incidents, pricing changes, campaigns, holidays,
seasonality, policy changes, and external events. Coincidence in time is a
hypothesis, not proof.

### Phase 6: Decision Gate — Depth and Claim Strength

When the fastest useful answer and the rigorous answer diverge, or the user wants
a causal claim the data cannot support, ask with `AskUserQuestion`:

- **Depth** — quick triage (rule out measurement + name the leading hypothesis)
  vs full decomposition (segment/funnel/timing contribution accounting).
- **Claim strength** — report as "associated with / coincides with" vs commit to
  a causal claim (which requires a design this skill does not run).

### Phase 7: Rank Hypotheses and Recommend

Separate **likely / possible / ruled out / needs data**. Give the fastest
validation or fix and state what evidence would change the diagnosis.

## Output Format

```markdown
# Metric Movement Diagnostic: <metric>

**Movement:** <absolute + relative, base → comparison>
**Verdict:** Real behavior change / Measurement artifact / Mixed / Cannot tell
**Most likely driver:** ...
**Confidence:** High / Medium / Low
**Recommended action:** ...

## Measurement Integrity
## Size Of Movement
## Driver Decomposition
| Driver | Evidence | Contribution | Confidence | Next Check |
|--------|----------|--------------|------------|------------|

## Timing Correlations
## Ruled Out
## Open Questions
```

Save a durable diagnostic to `workspace/analysis/lead-analyst/diagnostics/` if
`workspace/` exists, otherwise `analysis/lead-analyst/diagnostics/`, using:

```text
YYYYMMDD-HHMMSS-movement-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Verdict: <real change | measurement artifact | mixed>
Next skill: /lead-analyst:segment-diagnostics | metric-lineage | data-quality-audit | executive-readout
Open concerns: <none or list>
```

Use `DONE_WITH_CONCERNS` when a driver is identified but evidence is partial;
`BLOCKED` when the metric cannot be reconstructed for both periods;
`NEEDS_CONTEXT` when the metric definition or source of truth must be pinned first.

## Anti-Patterns

- Explaining a metric movement before checking instrumentation and freshness.
- Continuing to hunt behavioral drivers after a measurement change already
  explains the movement.
- Calling the largest segment the cause when it is merely the largest denominator.
- Ignoring mix shift and denominator movement.
- Treating post-hoc segments or timing coincidence as causal proof.
- Failing to distinguish "where the movement appears" from "why it happened."
