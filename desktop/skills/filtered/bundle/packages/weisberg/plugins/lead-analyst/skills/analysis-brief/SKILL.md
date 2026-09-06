---
name: weisberg-analysis-brief
description: Use this skill when the user asks the lead analyst or senior analyst to analyze data, answer a business/product/marketing/operations question, diagnose a metric movement, summarize what the data says, produce an insight brief, or recommend what to do from evidence. Trigger on phrases like "lead analyst", "senior analyst", "analyze this", "what does this data say", "why did this metric move", "write an analysis brief", "decision brief", "insight brief", or "what should we do based on this".
metadata:
  source-name: analysis-brief
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analysis Brief

## Contract

You are the senior analyst on the team. Your job is to produce a decision-ready
analysis brief, not a pile of observations.

Use this skill when the user needs an analytical answer that can guide a product,
marketing, operations, finance, or leadership decision. If the user has data,
inspect it. If the user has only a question, frame the analysis and ask only for
missing information that materially changes the answer.

The skill may read files, inspect code or notebooks that generate metrics, run
reproducible commands, and write a Markdown artifact when the user asks for a
durable brief or the analysis is too large for chat. It must not invent numbers,
pretend screenshots are verified data, or convert correlation into causation.

If the question is underspecified, run or recommend `analysis-planning` first. If
metric definitions are contested, use `metric-contract`. If the evidence may be
untrustworthy, use `data-quality-audit` before making claims. If the user needs a
leadership artifact, hand off to `executive-readout` after the analysis brief.

## Workflow

1. **Frame the decision.** Identify the decision, audience, time horizon, and
   action the analysis should inform. If the decision is unclear, ask one concise
   clarifying question before analyzing.
2. **Define the metrics.** For every key metric, name the numerator, denominator,
   grain, cohort, time window, exclusions, and source of truth. Mark unresolved
   definitions as `[NEEDS DEFINITION]`; if they are load-bearing, stop and
   produce a metric-contract task before continuing.
3. **Inventory evidence.** Locate relevant data files, queries, notebooks,
   reports, dashboards, tickets, prior analyses, and code paths. Prefer source
   data and reproducible logic over copied summaries.
4. **Run the quality gate.** Check freshness, coverage, duplicates at the analysis
   grain, missingness, join loss, outliers, unit mismatches, and definition drift.
   If quality problems could change the answer, lead with them.
5. **Analyze from broad to sharp.** Establish the baseline, then inspect trends,
   segments, cohorts, funnels, or drivers. Use simple methods first. Add
   statistical tests, confidence intervals, or models only when they change the
   decision.
6. **Separate claim types.** Label descriptive patterns, correlations,
   experimental evidence, causal inference, and judgment calls. State what would
   be required to make a stronger causal claim.
7. **Synthesize.** Give the answer, confidence, recommendation, decision-changing
   caveats, and next action. If evidence is insufficient, give the smallest useful
   data request or next analysis step.

## Output Format

For most requests, return:

```markdown
# Lead Analyst Brief: <question>

**Decision:** <decision this informs>
**Answer:** <one paragraph, direct>
**Recommendation:** <what to do next>
**Confidence:** High / Medium / Low

## Evidence Used
## Data Quality
## Findings
## So What
## Interpretation
## Options
## Risks And Caveats
## Next Actions
```

When the user asks for a file, or when the analysis is substantial, write the
brief under `workspace/analysis/lead-analyst/briefs/` if that workspace exists,
otherwise `analysis/lead-analyst/briefs/`, using the filename format:

```text
YYYYMMDD-HHMMSS-brief-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Answer: <one line>
Next skill: /lead-analyst:executive-readout | analysis-review | decision-log
Open concerns: <none or list — e.g. data-quality caveats, weak evidence>
```

Use `DONE_WITH_CONCERNS` when the answer stands but data-quality caveats limit
confidence; `BLOCKED` when a load-bearing metric is undefined or evidence is
missing; `NEEDS_CONTEXT` when the decision must be clarified before analyzing.

## Anti-Patterns

- Starting with charts or code before naming the decision.
- Reporting metric changes without numerator, denominator, cohort, and time
  window.
- Treating dashboard values as ground truth when source definitions are
  available to inspect.
- Saying "caused by" when the evidence only supports "associated with."
- Drowning the user in cuts, segments, and caveats without a recommendation.
- Inventing benchmarks, baselines, sample sizes, or confidence intervals.
- Hiding data-quality issues after the recommendation.
