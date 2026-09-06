---
name: alexe-design-experiment-plan
description: Build a complete product experiment plan from a validated hypothesis, metrics, and testing assumptions. Use this skill when the user is ready to prepare an A/B test or structured product experiment for execution.
metadata:
  source-name: design-experiment-plan
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Experiment Plan

## Purpose
Turn experiment inputs into a complete execution-ready test design.

## Skill type
Conceptual orchestration skill

## Use this skill when
- The user is ready to run a test
- The hypothesis has already been validated
- Metrics and decision rules are known
- A team-ready experiment brief is needed

## Required inputs
- Validated hypothesis
- Primary metric
- Success criteria

## Optional inputs
- Secondary metrics
- Guardrails
- Sample size
- Estimated duration
- Target segment
- Eligibility rules
- Randomization logic
- Traffic constraints
- Rollout constraints

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
- a validated hypothesis
- a primary metric
- success criteria
- target segment
- at least rough threshold logic
- sample size and duration, if launch planning needs them

## If upstream context is missing
If the hypothesis, primary metric, threshold logic, or stopping logic is missing, do not generate a fake-ready experiment brief.
Return a partial planning skeleton and clearly mark which gaps block launch readiness.

## Downstream handoff
A complete output from this skill should be usable by:
- experiment launch preparation
- implementation handoff
- later result analysis
- later post-test decision-making

A good handoff includes:
- objective
- variants
- audience
- metrics
- thresholds
- stopping logic
- risks
- launch blockers if any

## Context collection rules
### Context-rich
Produce an execution-ready plan using the real audience, funnel, metric, constraints, and risks.

### Context-light
Produce a partial plan, but clearly mark missing fields as unresolved.

### Context-poor
Do not generate a fake-ready experiment brief.
Switch to planning skeleton mode and show what must be defined first.

## Minimum context to collect before calling the plan execution-ready
- exact change being tested
- target segment
- primary metric
- success threshold
- stopping logic
- basic rollout risk or guardrail logic

## Instructions
1. Restate the hypothesis clearly.
2. Define control and test variants.
3. Define target segment and eligibility rules.
4. Define primary, secondary, and guardrail metrics.
5. Include minimum meaningful effect and success threshold if available.
6. Include sample size and expected duration if available.
7. Define stopping logic.
8. Define analysis plan at a high level.
9. Define success, neutral, and failure outcomes.
10. Define what action should follow each outcome.
11. Flag operational or validity risks.

## Output
Provide a structured experiment brief with:
- Objective
- Hypothesis
- Variants
- Target audience
- Metrics
- Thresholds
- Sample size and duration
- Stopping logic
- Launch notes
- Risks
- Decision rules
- Missing fields that block launch readiness

## Risks / caveats
- Do not produce a fake-complete brief if core decisions are still missing
- Do not recommend running a test without knowing how the result will be interpreted
- Do not allow flexible stopping without calling it out as a validity risk
