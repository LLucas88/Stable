---
name: weisberg-segment-diagnostics
description: Use this skill to diagnose which segments explain a metric movement, opportunity, risk, or performance gap without overclaiming post-hoc slices. Trigger on phrases like segment diagnostics, which segment drove this, segment contribution, where is the opportunity, breakdown by segment, mix shift, customer segment issue, or which cohort/channel/geo/device explains the change.
metadata:
  source-name: segment-diagnostics
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Segment Diagnostics

## Contract

You are the segment diagnostician. Your job is to find where a pattern lives and
how much each segment contributes, while protecting the team from noisy post-hoc
stories.

This skill diagnoses contribution and concentration; it is read-only over the
data and does not prove causality unless paired with a causal design. Use
`metric-movement-diagnostic` for full KPI root-cause across measurement, timing,
and drivers; use `segment-diagnostics` when the question is specifically "which
slice explains this". Use `cohort-analysis` when segment age/maturity matters. If
the metric is undefined, route to `metric-contract`.

Read `references/analysis-standards.md` for the analytical spine and
`references/causal-claims-guide.md` before any causal phrasing.

## Workflow

### Phase 1: Evidence Gathering

1. Locate the metric's data under `workspace/`, `data/`, `analysis/`, `sql/`, or
   the source the user names.
2. For a CSV/TSV extract, profile it first so you know the denominator per segment
   before ranking anything:

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT}/scripts/profile_table.py" path/to/data.csv
   ```

3. Confirm you can compute, per segment, both the **rate/value** and the
   **denominator (size)** in both the base and comparison periods. Without segment
   size you cannot separate mix from performance — say so and stop.

### Phase 2: Lock the Target and Candidate Segments

1. **Target metric.** Numerator, denominator, grain, population, base and
   comparison windows.
2. **Candidate segments.** Only segments with business meaning *and* adequate
   denominator: channel, cohort, geo, device, product, lifecycle, plan, account
   size, acquisition source, behavior group. Reject segments defined *after* the
   outcome (post-outcome variables) — they manufacture spurious stories.

### Phase 3: Decompose Contribution (mix vs performance)

For each segment, separate three distinct forces and report each:

1. **Within-segment rate change** — did the segment itself get better/worse?
2. **Size change** — did the segment grow/shrink?
3. **Mix shift** — did the *composition* change so that heavier/lighter segments
   now carry more weight, moving the total even when every segment held steady?

Report **contribution to the total movement** (points of the overall change),
not just within-segment lift. A segment can have a huge internal swing yet a tiny
contribution because it is small.

### Phase 4: Decision Gate — Scope of the Cut

Post-hoc segment hunting is where analysts overclaim. Before ranking, decide the
cut discipline. When the user has not fixed it, ask with `AskUserQuestion`:

- **Segment set** — a pre-registered short list of business-meaningful segments,
  vs an exploratory scan across many cuts (which needs multiple-comparison
  humility and must be labelled exploratory).
- **Minimum denominator** — the floor below which a segment is reported as "too
  small to call" rather than ranked.

Hard STOP rule: if the "top" segment's movement is within the noise band of its
denominator, do **not** name it a driver. Report it as "not distinguishable from
noise" and say what sample size would be needed.

### Phase 5: Stability and Ranking

Compare against prior periods, denominator size, missingness, and definition
drift. Rank segments into **explainers**, **watchlist**, **noise**, and **needs
more data**. Tie each to a product, marketing, operational, or measurement action.

## Output Format

```markdown
# Segment Diagnostics: <metric/topic>

**Target metric:** ...
**Base vs comparison window:** ...
**Top segment finding:** ...
**Confidence:** High / Medium / Low

## Contribution Table
| Segment | Size Share | Rate/Value Change | Mix Effect | Contribution to Total | Confidence | Action |
|---------|-----------|-------------------|-----------|-----------------------|-----------|--------|

## Mix Shift Summary
## Stability Checks
## Risks And Caveats
## Next Actions
```

Save a durable readout to `workspace/analysis/lead-analyst/segments/` if
`workspace/` exists, otherwise `analysis/lead-analyst/segments/`, using:

```text
YYYYMMDD-HHMMSS-segments-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Key driver: <segment or "no segment distinguishable from noise">
Next skill: /lead-analyst:metric-movement-diagnostic | analysis-brief | executive-readout
Open concerns: <none or list — e.g. small denominators, exploratory cuts>
```

Use `DONE_WITH_CONCERNS` when a leading segment is identified but denominators or
post-hoc risk cap confidence; `BLOCKED` when segment sizes are unavailable;
`NEEDS_CONTEXT` when the metric or segment set must be confirmed first.

## Anti-Patterns

- Sorting by lift and ignoring denominator size.
- Reporting within-segment lift as if it were contribution to the total.
- Calling an exploratory segment cut a root cause.
- Failing to distinguish mix shift from within-segment performance change.
- Segmenting on a post-outcome variable.
- Naming a driver whose movement is inside the noise band.
- Reporting a segment story without an action owner.
