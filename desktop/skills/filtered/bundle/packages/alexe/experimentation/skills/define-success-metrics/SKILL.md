---
name: alexe-define-success-metrics
description: Define the primary metric, secondary metrics, guardrails, and success criteria for a product experiment. Use this skill when the user has a hypothesis or planned test but has not yet defined how success should be measured.
metadata:
  source-name: define-success-metrics
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Define Success Metrics

## Purpose
Turn a hypothesis into a measurable evaluation framework.

## Skill type
Conceptual skill with quantitative decision thresholds

## Use this skill when
- The user has a hypothesis but no clear success metric
- The user wants to define experiment KPIs
- The user needs primary, secondary, and guardrail metrics

## Required inputs
- Hypothesis
- Business or user goal

## Optional inputs
- Product metric tree
- Funnel structure
- Baseline metrics
- Known trade-offs
- Segment context
- Risk tolerance

## Additional resources

### Use examples/ when
- you need to see what good input/output looks like
- you need to match the expected output structure
- you need to see how this skill behaves under rich, light, or poor context

### Use REFERENCE.md when
- this skill includes one and you need additional decision rules
- you need deeper context-handling guidance
- you need edge cases or caveats not included in the main instructions

### Resource priority
1. Read this Skill.md first
2. Use examples/ for behavior patterns and output structure
3. Use REFERENCE.md for deeper rules, caveats, and edge cases

## Upstream context
This skill works best when the following already exist:
- a reasonably clear hypothesis
- a known user or business goal
- at least a rough idea of where the effect should appear in the funnel

## If upstream context is missing
If the user goal, funnel stage, or intended outcome is unclear, do not lock a single metric as if it were obviously correct.
Offer provisional metric options and explicitly say what must be confirmed before sample size estimation or experiment planning.

## Downstream handoff
A strong output from this skill should be usable by:
- estimate-sample-size
- design-experiment-plan
- later result analysis

A good handoff includes:
- primary metric
- secondary metrics
- guardrails
- minimum meaningful effect or note that it is missing
- success / neutral / failure thresholds

## Context collection rules
### Context-rich
Choose metrics directly from the real funnel, metric tree, and known business trade-offs.

### Context-light
Choose a likely metric structure, but explicitly mark anything that is provisional.

### Context-poor
Do not commit to a single “correct” metric unless the hypothesis makes it obvious.
Offer metric options tied to different possible goals and say what must be confirmed.

## Minimum context to collect before locking the primary metric
- What user outcome is the change meant to improve?
- At what funnel stage should the effect appear?
- Is the goal activation, conversion, retention, revenue, or something else?
- What side effects are most risky in this product?

## Instructions
1. Identify the single best primary metric aligned with the hypothesis.
2. Identify useful secondary or diagnostic metrics.
3. Identify guardrail metrics that should not worsen materially.
4. Define what would count as success, neutral, or failure.
5. If possible, define:
   - minimum meaningful effect
   - success threshold
   - neutral zone
   - failure threshold
6. Ensure the chosen metrics reflect the real expected impact of the change.
7. If metrics are ambiguous, explain the trade-offs and choose the most decision-useful option.

## Output
Provide:
- Primary metric
- Why it is primary
- Secondary metrics
- Guardrail metrics
- Minimum meaningful effect
- Success threshold
- Neutral zone
- Failure threshold
- Interpretation notes
- Which parts are provisional due to missing context

## Risks / caveats
- Do not choose a metric that is too far from the hypothesis
- Do not skip guardrails for changes that can create side effects
- If no minimum meaningful effect is defined, say the experiment is not yet fully ready for sample size estimation
- Do not default to conversion or revenue just because they are common
