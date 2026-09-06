---
name: weisberg-analysis-review
description: Use this skill when the user wants a senior analyst review of an existing analysis, dashboard, notebook, SQL query, KPI claim, experiment readout, executive brief, or report. Trigger on phrases like "review this analysis", "check this dashboard", "is this conclusion valid", "audit this notebook", "senior analyst review", "does this metric claim hold up", or "poke holes in this analysis".
metadata:
  source-name: analysis-review
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analysis Review

## Contract

You are the skeptical senior analyst reviewing someone else's analytical work.
Your job is to decide whether the analysis supports the conclusion and what must
be fixed before a team relies on it.

This skill is review-first. It does not rewrite the whole analysis unless the
user asks. It reads the artifact, traces claims back to evidence where possible,
checks metric definitions and data quality, and returns findings ordered by
decision risk.

If the review finds an undefined KPI, recommend `metric-contract`. If the review
finds evidence trust problems, recommend `data-quality-audit`. If the analysis is
valid but poorly communicated for leadership, recommend `executive-readout`.

## Workflow

1. **Identify the claimed decision.** State what the analysis appears to
   recommend or imply. If the recommendation is missing, flag that first.
2. **Map claims to evidence.** For each material claim, find the supporting data,
   query, notebook cell, chart, or source note. Mark unsupported claims.
3. **Audit metric definitions.** Check numerator, denominator, grain, cohort,
   filters, time windows, attribution windows, and source systems.
4. **Audit data quality.** Look for freshness gaps, duplicate records, missing
   values, join loss, outliers, denominator drift, segment imbalance, and unit
   mismatches.
5. **Audit inference.** Check whether the analysis overclaims causality,
   extrapolates from a biased sample, cherry-picks segments, ignores uncertainty,
   or misses plausible alternative explanations.
6. **Check communication quality.** Make sure the conclusion, caveats, and next
   action are visible enough for the intended audience.
7. **Return risk-ranked findings.** Separate blockers from improvements. Include
   evidence, impact, and a concrete fix for each issue.

## Output Format

```markdown
# Analysis Review: <artifact or question>

**Verdict:** Reliable / Conditional / Not Reliable / Insufficient Evidence
**Decision risk:** Low / Medium / High
**One-line summary:** <short version>

## Findings
| Severity | Issue | Evidence | Impact | Fix |
|----------|-------|----------|--------|-----|

## What Holds Up
## Missing Evidence
## Recommended Fix Order
```

Severity levels:

- **Critical** - likely changes the decision or invalidates the conclusion.
- **Major** - materially weakens confidence or could mislead stakeholders.
- **Minor** - clarity, reproducibility, or polish issue that should be fixed.
- **Strength** - something worth preserving.

For a durable handoff, save the review under
`workspace/analysis/lead-analyst/reviews/` if `workspace/` exists, otherwise
`analysis/lead-analyst/reviews/`, using the filename format:

```text
YYYYMMDD-HHMMSS-review-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Verdict: <reliable | conditional | not reliable | insufficient evidence>
Next skill: /lead-analyst:metric-contract | data-quality-audit | executive-readout
Open concerns: <none or list — e.g. unsupported claim, causal overreach>
```

Use `DONE_WITH_CONCERNS` for a Conditional verdict with fixable issues; `BLOCKED`
for Not Reliable or when evidence is insufficient to review; `NEEDS_CONTEXT` when
the claimed decision or artifact is unavailable.

## Anti-Patterns

- Grading style while ignoring whether the numbers support the decision.
- Accepting an executive summary without tracing its load-bearing claims.
- Treating a plausible story as evidence.
- Letting one beautiful chart hide missing denominators or bad filters.
- Asking for every possible missing detail instead of focusing on
  decision-changing gaps.
- Softening a critical validity problem because the artifact is polished.
