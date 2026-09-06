---
name: alexe-formulate-experiment-hypothesis
description: Turn a product problem, idea, observation, or business goal into a clear testable experiment hypothesis. Use this skill when the user has an idea or problem but not yet a properly structured hypothesis for an A/B test or product experiment.
metadata:
  source-name: formulate-experiment-hypothesis
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Formulate Experiment Hypothesis

## Purpose
Convert rough product thinking into a testable hypothesis that can later be validated, quantified, and turned into an experiment plan.

## Skill type
Conceptual skill

## Use this skill when
- The user has a product idea but no formal hypothesis
- The user describes a problem or opportunity and wants to test something
- The user wants to move from intuition to a measurable experiment setup
- The user has a behavioral observation and wants to turn it into a causal hypothesis

## Do not use this skill when
- The user already has a complete experiment-ready hypothesis
- The user needs sample size, p-value, or result analysis
- The user wants final rollout recommendations after a completed test

## Required inputs
- Product context or rough idea
- Problem statement, opportunity, observation, or desired outcome

## Optional inputs
- Target segment
- Current metrics
- Business goal
- Funnel context
- Prior research
- Qualitative insights
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
This skill works best when at least some of the following already exist:
- a known product area
- a known user problem or opportunity
- a target segment
- a likely outcome metric
- a business or product goal

## If upstream context is missing
If the product area, segment, or target outcome is unclear, do not invent a fully confident hypothesis.
Return a provisional hypothesis and clearly list what must be confirmed before moving to validation or metric definition.

## Downstream handoff
A strong output from this skill should be usable by:
- validate-hypothesis-quality
- define-success-metrics
- design-experiment-plan

A good handoff includes:
- one clear hypothesis
- likely target segment
- likely primary metric
- expected direction of impact
- missing context list

## Context collection rules
Before writing the hypothesis, determine context level.

### Context-rich
Use the real product flow, segment, metric, and business goal from the input.

### Context-light
Use available details, but do not invent the missing parts.
If segment, funnel stage, or metric is unclear, state that explicitly.

### Context-poor
Switch to discovery mode first.
Ask or infer only the minimum structure needed:
- what is changing
- for whom
- what outcome matters most
If key context is missing, produce only a provisional hypothesis and label it as such.

## Discovery questions to resolve missing context
Collect, when missing:
- What product area is changing?
- Who is affected?
- What user or business problem are we trying to improve?
- What outcome matters most here?
- Is there any known funnel stage or metric already used by the team?

In context-poor or context-light situations, explicitly address at least 2–3 of these before writing the hypothesis. Do not invent answers to questions you did not ask — list unresolved items under Missing information instead.

## Instructions
1. Identify the core problem, opportunity, or assumption.
2. Extract the proposed product change or intervention.
3. Identify the likely target segment.
4. Identify the likely primary metric affected by the change.
5. Explain the causal mechanism in plain language.
6. Rewrite the user input into a testable hypothesis.
7. If the input is too vague, explicitly say what is missing.
8. If multiple changes are mixed together, split them into separate hypotheses.
9. Do not force numerical uplift assumptions at this stage unless the user already has them.
10. Add an optional field called `expected impact hypothesis` only if a reasonable directional or quantitative assumption is available — meaning the user cites prior test results, industry benchmarks, or a documented rationale. If the user asserts a number without evidence (e.g. "this should lift conversion by 30%"), do not adopt it. Instead, flag it under Missing information as: "impact assumption needs validation — no evidence basis provided."

## Hypothesis format
Use the following structure:

If we change [specific element] for [specific segment],
we expect [primary metric] to [increase/decrease],
because [causal reason].

## Output
Provide:
- Hypothesis statement
- Target segment
- Likely primary metric
- Expected direction of impact
- Why this might work
- Expected impact hypothesis (optional)
- Missing information, if any
- Confidence level of the hypothesis framing:
  - **provisional** — product area, segment, or primary metric is unclear or unconfirmed; the hypothesis is a starting structure, not a validated one
  - **context-informed** — core inputs are present (change, segment, metric, direction) but some details remain uncertain; hypothesis can move to validation with caveats
  - **execution-ready candidate** — the specific element being changed is named, the target segment is confirmed, the primary metric is defined and measurable, no critical missing information remains; ready to hand off to validate-hypothesis-quality or design-experiment-plan

## Risks / caveats
- Do not present the hypothesis as fact
- Do not fabricate quantitative impact if the user has no basis for it
- Do not bundle several unrelated changes into one hypothesis
- Do not choose a metric just because it is common in other products
- Do not include experiment design elements — sample size, p-values, test duration, significance thresholds, rollout plans, or traffic splits are out of scope here; those belong in design-experiment-plan
