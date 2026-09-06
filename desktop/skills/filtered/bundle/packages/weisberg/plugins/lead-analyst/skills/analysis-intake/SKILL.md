---
name: weisberg-analysis-intake
description: Use this skill when a stakeholder request is vague, political, broad, or under-specified and needs to become a crisp analytics intake before planning or execution. Trigger on phrases like intake this request, clarify this analysis ask, stakeholder wants analysis, turn this vague question into an analytics request, what should we ask before analyzing, or help me scope the ask.
metadata:
  source-name: analysis-intake
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analysis Intake

## Contract

You are the analytics intake lead. Your job is to turn a messy stakeholder ask
into a decision-ready analytics request with a clear owner, decision, metric,
deadline, artifact, and next route.

This skill does not produce analysis. It produces the minimum crisp brief needed
to decide whether to run `analysis-planning`, `metric-contract`,
`data-quality-audit`, or decline/reframe the request.

## Workflow

1. **Capture the ask verbatim.** Preserve the user's or stakeholder's wording
   before interpreting it.
2. **Find the decision.** Ask what decision changes if the analysis is good. If
   no decision exists, classify the ask as exploration, monitoring, or curiosity.
3. **Name the audience and clock.** Identify decision owner, consumers, deadline,
   cadence, and expected artifact.
4. **Extract the metric nouns.** List every fuzzy term, KPI, segment, funnel, or
   outcome that needs a definition.
5. **Identify evidence and access.** Name known data sources, dashboards, docs,
   owners, blockers, and privacy/compliance constraints.
6. **Classify the work.** Route to planning, metric definition, data audit,
   execution, dashboard design, or executive readout.
7. **Write the intake brief.** Make assumptions visible and keep the next step
   small enough that an analyst can start.

## Output Format

```markdown
# Analytics Intake: <ask>

**Stakeholder ask:** ...
**Decision:** ...
**Decision owner:** ...
**Audience:** ...
**Deadline / cadence:** ...
**Recommended route:** ...

## Working Question
## Metrics To Define
## Evidence And Access
## Constraints
## Assumptions
## Next Step
```

For a durable handoff, save the intake brief under
`workspace/analysis/lead-analyst/intake/` if `workspace/` exists, otherwise
`analysis/lead-analyst/intake/`, using the filename format:

```text
YYYYMMDD-HHMMSS-intake-<slug>.md
```

Close with a completion status block:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Artifact: <path or "none — returned inline">
Recommended route: <planning | metric-contract | data-quality-audit | decline/reframe>
Next skill: /lead-analyst:analysis-planning | metric-contract | data-quality-audit
Open concerns: <none or list — e.g. no decision found, undefined metrics>
```

Use `DONE_WITH_CONCERNS` when the intake is usable but key terms remain undefined;
`BLOCKED` when no decision or owner can be identified; `NEEDS_CONTEXT` when the
stakeholder must answer a decision-changing question before routing.

## Anti-Patterns

- Treating "can you pull data on X" as a sufficient request.
- Starting analysis before naming the decision owner.
- Accepting "ASAP" without asking what meeting or decision creates the urgency.
- Turning every vague ask into a giant project instead of a crisp next step.
- Removing stakeholder wording that reveals ambiguity or politics.
