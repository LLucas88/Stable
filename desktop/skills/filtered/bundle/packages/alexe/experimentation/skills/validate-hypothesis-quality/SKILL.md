---
name: alexe-validate-hypothesis-quality
description: Evaluate whether a product experiment hypothesis is specific, measurable, and suitable for testing. Use this skill when the user already has a draft hypothesis and wants to know if it is strong enough for an A/B test or other product experiment.
metadata:
  source-name: validate-hypothesis-quality
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Validate Hypothesis Quality

## Purpose
Assess whether a hypothesis is good enough to support experiment design.

## Skill type
Conceptual skill with readiness checks for downstream calculation-aware skills

## Use this skill when
- The user already has a draft hypothesis
- The user wants to know whether a hypothesis is testable
- The user wants to improve a vague or weak experiment idea
- Another skill has produced a first-pass hypothesis and it needs validation

## Required inputs
- Hypothesis statement

## Optional inputs
- Product context
- Business goal
- Target segment
- Metric tree
- Funnel context
- Constraints

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
This skill works best when at least some upstream framing already exists:
- a draft hypothesis
- a rough product area
- a target segment or likely audience
- a likely outcome metric
- some reason the change should work

## If upstream context is missing
If the hypothesis is too abstract or the product context is absent, validate it only at exploration level.
Do not mark it as ready for experiment design if segment, metric, or causal logic are still unknown.

## Downstream handoff
A strong output from this skill should be usable by:
- define-success-metrics
- estimate-sample-size
- design-experiment-plan

A good handoff includes:
- verdict
- improved hypothesis
- readiness state
- missing inputs for next step

## Context collection rules
### Context-rich
Evaluate the hypothesis against the real product flow, real segment, and real metric vocabulary.

### Context-light
Validate the structure of the hypothesis, but explicitly flag missing context that blocks experiment design.

### Context-poor
Do not pretend the hypothesis is experiment-ready.
Validate only at exploration level and say what minimum context is needed before approval for design.

## Minimum context to collect before declaring "valid for experiment design"
- target segment
- likely primary metric
- clear product area or change
- plausible causal mechanism
- basic business relevance

## Instructions
1. Check whether the hypothesis contains a specific change.
2. Check whether it names or strongly implies a measurable outcome.
3. Check whether the target segment is clear.
4. Check whether there is a plausible causal mechanism.
5. Check whether success can be evaluated objectively.
6. Check whether multiple changes are mixed into one hypothesis.
7. Check whether expected effect magnitude or minimum meaningful effect is defined.
8. Classify the hypothesis into one of these states using the criteria below.
9. If weak or invalid, rewrite it into a stronger version.
10. If it is valid for exploration but not yet valid for experiment design, list what is still needed.

## Verdict criteria

Use these criteria strictly. The verdict is the most important part of the output — downstream skills depend on it to decide whether to proceed.

**Valid for experiment design** — all of the following must be true:
- One specific, isolated change is described
- Target segment is bounded and testable
- Primary metric is clearly named and objectively measurable
- A plausible causal mechanism is stated
- Expected effect size or minimum meaningful effect is defined (even a rough threshold like "at least 5%" is enough)
- Effect size claim is not wildly implausible given the context (a 40%+ uplift on a mature product metric with no supporting data is a red flag)

**Valid for exploration** — the direction is promising and worth investigating, but at least one of the following is missing or too vague:
- Change is described but too broad to isolate in an experiment
- Metric exists but definition is ambiguous
- Effect size is missing or stated with no basis
- Segment is implied but not bounded
- Effect size looks implausibly high without prior evidence

**Weak** — the hypothesis has the right shape but major elements are undefined or contradictory:
- Key terms are vague to the point of being untestable (e.g., "improve UX", "enhance activation")
- Multiple changes are bundled together
- No measurable outcome is named
- Causal logic is circular or missing

**Invalid** — the hypothesis cannot be tested as stated:
- It is a strategy or goal, not a testable change
- There is no mechanism to attribute observed change to the specific intervention
- The metric cannot be observed or is not under the team's control

## Output
Provide:
- **Verdict** — one of the four states above, stated explicitly at the top
- **Main weaknesses** — be specific; name the exact terms or elements that are vague or missing
- **Improved version** — a rewritten hypothesis that resolves the main weaknesses; for weak/invalid hypotheses this is a narrower, more specific reformulation; for valid-for-exploration hypotheses this means filling in the blanks; for valid-for-experiment hypotheses this means minor additions (guardrails, clearer thresholds)
- **Missing information** — list what context would be needed to upgrade the verdict
- **Readiness statement** — a single sentence that explicitly states whether this hypothesis is ready or not ready for experiment design (e.g. "This hypothesis is NOT ready for experiment design — it requires X before proceeding" or "This hypothesis is ready to hand off to define-success-metrics and estimate-sample-size")

## Scope discipline — critical

The purpose of this skill is to validate readiness, not to design the experiment. Do not include:
- Sample size calculations or estimates
- Statistical significance thresholds
- Traffic split ratios
- Test duration recommendations
- Full experiment frameworks (RCT designs, holdout structures, power analyses)

These belong in estimate-sample-size and design-experiment-plan. Adding them here gives a false impression of experiment readiness and dilutes the validation signal. If the hypothesis is weak, providing experiment scaffolding alongside the rejection sends a contradictory message.

## Risks / caveats
- Do not require exact numbers at ideation stage
- Do require measurement logic before passing to sample size estimation
- Do not approve hypotheses that cannot produce a clear success/failure decision
- Do not upgrade a "valid for exploration" verdict to "valid for experiment design" just because the general direction is sound — the structural requirements above must all be met
