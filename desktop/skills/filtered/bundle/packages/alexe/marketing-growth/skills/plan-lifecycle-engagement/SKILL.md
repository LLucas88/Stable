---
name: alexe-plan-lifecycle-engagement
description: Design a lifecycle engagement strategy including onboarding, nurture, and re-engagement flows. Use this skill when a team needs to systematically improve how they engage users across their lifecycle.
metadata:
  source-name: plan-lifecycle-engagement
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Plan Lifecycle Engagement

## Purpose
Help teams design a structured lifecycle engagement strategy that improves activation, retention, and re-engagement.

## Skill type
Conceptual skill

## Use this skill when
- Onboarding is weak and activation rates are low
- Users are churning without engagement interventions in place
- No lifecycle email or in-app messaging strategy exists
- A new user segment needs a tailored engagement plan

## Do not use this skill when
- The goal is channel acquisition (use strategize-channel-campaigns)
- The goal is conversion optimization for a specific flow (use optimize-conversion-growth-loops)

## Required inputs
- Product type and user journey
- Current activation and retention metrics (rough)

## Optional inputs
- User segments
- Current lifecycle touchpoints
- Behavioral triggers available
- Messaging channels (email, in-app, push)

## Upstream context
Works best when:
- Growth model is defined
- User segments/personas are known
- Activation and retention data exists

## Downstream handoff
Output can feed:
- optimize-conversion-growth-loops (lifecycle touches support conversion)

## Instructions
1. Map the user lifecycle stages: new user → activated → retained → at-risk → churned.
2. Define key moments in each stage that require intervention.
3. Design touchpoints for each stage: trigger, message, channel, goal.
4. Prioritize lifecycle moments with the highest impact on retention.
5. Define success metrics for each lifecycle stage.
6. Identify automation opportunities.

## Output
Provide:
- Lifecycle stage map
- Touchpoint design per stage (trigger, message goal, channel)
- Priority ranking of lifecycle interventions
- Success metrics per stage
- Automation opportunities
- Data and tooling requirements

## Risks / caveats
- Lifecycle messaging without behavioral triggers is just email blasting
- Over-messaging causes churn — frequency caps matter
- Measure engagement quality, not just open rates
