---
name: alexe-define-ai-success-metrics
description: Define the success metrics for an AI feature covering quality, user experience, business impact, and safety. Use this skill when an AI feature needs a complete metric framework before launch.
metadata:
  source-name: define-ai-success-metrics
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Define AI Success Metrics

## Purpose
Help teams define a complete set of success metrics for an AI feature — covering model quality, user experience, business impact, and safety — so that success and failure can be measured objectively.

## Skill type
Conceptual skill

## Use this skill when
- An AI feature is being designed and success criteria haven't been defined
- A launched AI feature lacks a clear way to measure performance
- Stakeholders disagree on how to evaluate the AI feature's performance
- An AI feature's metrics need to be separated into quality, UX, business, and safety dimensions

## Do not use this skill when
- General product metrics are needed (use design-product-metrics)
- AI quality monitoring systems are being designed (use evaluate-ai-quality-monitoring)

## Required inputs
- AI feature description and target user
- Business goal the AI feature serves

## Optional inputs
- Model capability assessment
- Human-in-the-loop design
- Prior user research on the problem area
- Regulatory context

## Upstream context
Works best when:
- AI value is framed
- Model choice is made
- HITL design exists

## Downstream handoff
Output can feed:
- evaluate-ai-quality-monitoring (success metrics → monitoring system)
- build-decision-dashboard (AI metrics → dashboard)
- design-experiment-plan (metrics → experiment success criteria)

## Instructions
1. Define model quality metrics: how do you measure if the AI output is good? (accuracy, relevance, hallucination rate, etc.)
2. Define user experience metrics: how do users respond to the AI? (adoption rate, trust signals, feedback, task completion).
3. Define business impact metrics: how does the AI feature affect product KPIs? (retention, efficiency, revenue, support deflection).
4. Define safety metrics: what could go wrong and how would you detect it? (error rates, harmful output flags, user complaint rate).
5. Set baseline and target values for each metric where possible.
6. Define review cadence and who owns each metric.

## Output
Provide:
- Model quality metrics with definitions and measurement approach
- User experience metrics
- Business impact metrics
- Safety and risk metrics
- Baseline and target values (where available)
- Primary metric (the one that best captures overall feature success)
- Review cadence and metric owners

## Risks / caveats
- Model quality metrics and user experience metrics are often uncorrelated — measure both
- Safety metrics must be defined before launch, not after an incident
- Don't choose metrics that are easy to measure over metrics that matter
