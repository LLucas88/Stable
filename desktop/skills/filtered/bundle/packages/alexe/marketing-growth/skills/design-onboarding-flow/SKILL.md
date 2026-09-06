---
name: alexe-design-onboarding-flow
description: Design a user onboarding flow that gets new users to the activation moment as quickly as possible. Use this skill when onboarding is too long, confusing, or failing to deliver early value.
metadata:
  source-name: design-onboarding-flow
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Onboarding Flow

## Purpose
Help teams design or improve user onboarding flows that minimize time-to-value, reduce early churn, and establish habits that drive long-term retention.

## Skill type
Conceptual skill

## Use this skill when
- New user activation rates are low
- Users sign up but don't complete onboarding
- Onboarding takes too long or asks users for too much upfront
- A new product or feature needs an onboarding experience designed from scratch

## Do not use this skill when
- The activation metric itself hasn't been defined (define it first with design-product-metrics)
- The goal is lifecycle engagement after activation (use plan-lifecycle-engagement)

## Required inputs
- Product description and target user
- Activation event (what does it mean for a user to have experienced core value?)
- Current onboarding steps (if any)

## Optional inputs
- Drop-off data by onboarding step
- User research on early confusion or friction
- Competitive onboarding benchmarks
- Time-to-activation data

## Upstream context
Works best when:
- Activation metric is defined
- Acquisition funnel is mapped
- User journey is understood

## Downstream handoff
Output can feed:
- optimize-conversion-growth-loops (onboarding redesign → test via experiment)
- plan-lifecycle-engagement (post-activation engagement begins where onboarding ends)
- run-usability-testing (new onboarding flow → usability test)

## Instructions
1. Define the activation moment: what specific action signals the user has experienced core value?
2. Map the critical path: minimum steps needed to reach activation.
3. Identify steps that can be deferred until after activation.
4. Design the onboarding sequence: welcome → context → first key action → value delivery → next step.
5. Identify personalization opportunities (role, use case, goal).
6. Design empty states and progressive disclosure.
7. Plan follow-up touchpoints (email, in-app) for users who don't activate in session 1.

## Output
Provide:
- Activation event definition
- Critical path to activation (minimum steps)
- Steps to defer post-activation
- Onboarding flow structure with rationale per step
- Personalization hooks
- Empty state design guidance
- Follow-up touchpoint plan
- Success criteria for the new onboarding

## Risks / caveats
- Asking for information before delivering value kills activation — defer data collection
- Onboarding length is not the only problem — wrong job framing kills retention even with short flows
- Test onboarding with real new users, not internal team members who already know the product
