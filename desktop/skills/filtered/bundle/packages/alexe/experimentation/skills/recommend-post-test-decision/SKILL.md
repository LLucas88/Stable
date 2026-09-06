---
name: alexe-recommend-post-test-decision
description: Recommend what to do after an experiment based on the result quality, effect size, and business context. Use this skill when the user has a completed experiment and needs a practical product decision such as roll out, rerun, iterate, segment-rollout, or reject.
metadata:
  source-name: recommend-post-test-decision
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Recommend Post-Test Decision

## Purpose
Turn experiment evidence into a practical product action.

## Skill type
Conceptual decision skill informed by quality and analysis outputs

## Required inputs
- Experiment result summary
- Quality / validity assessment

## Optional inputs
- Business context
- Engineering cost
- Strategic priority
- Rollout risk
- Segment-specific effects
- Guardrail performance

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
- experiment result summary
- experiment quality assessment
- effect size or practical result signal
- guardrail review
- at least some business context

## If upstream context is missing
If quality assessment or guardrails are missing, avoid strong rollout recommendations.
If business value, cost, or rollout risk is unclear, make only a conditional recommendation and list what must be confirmed.

## Downstream handoff
A strong output from this skill should be usable as:
- a rollout decision memo
- a rerun recommendation
- an iteration plan
- a segment rollout recommendation

A good handoff includes:
- recommended action
- rationale
- trade-offs
- risks
- next step
- missing business inputs that weaken the recommendation

## Context collection rules
### Context-rich
Make a concrete action recommendation grounded in business value, risk, and implementation cost.

### Context-light
Make a conditional recommendation and state what assumptions it depends on.

### Context-poor
Do not over-recommend.
Choose only a cautious action pattern and list what must be known before a stronger decision.

## Minimum context to collect before a strong rollout recommendation
- trustworthy analysis
- quality verdict
- practical size of the effect
- business relevance of the effect
- side effects or guardrails
- rollout risk or implementation cost

## Decision rules
1. Check whether the result is trustworthy enough for decision-making.
2. Consider effect size, not just significance.
3. Consider business value, implementation cost, and risk.
4. Review guardrails and negative side effects.
5. Recommend one of the following:
   - Full rollout
   - Partial rollout
   - Segment rollout
   - Iterate and retest
   - Rerun
   - Reject
6. Explain trade-offs clearly.
7. If the evidence is weak or invalid, say so directly.

## Output
Provide:
- Recommended action
- Why this action is appropriate
- Risks
- What should happen next
- Which missing business inputs limit recommendation strength

## Risks / caveats
- Do not recommend rollout solely because p < threshold
- Do not ignore negative guardrails
- Do not present neutral results as wins
- Do not hide validity issues in the recommendation