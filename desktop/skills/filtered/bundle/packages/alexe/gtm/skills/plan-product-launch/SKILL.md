---
name: alexe-plan-product-launch
description: Build a launch plan including readiness criteria, timeline, channels, and stakeholder coordination. Use this skill when a team is preparing to launch a product, feature, or major update.
metadata:
  source-name: plan-product-launch
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Plan Product Launch

## Purpose
Help teams structure a comprehensive launch plan that coordinates readiness, channels, stakeholders, and success criteria.

## Skill type
Conceptual skill

## Use this skill when
- A product or feature is approaching launch and needs a coordinated plan
- A launch is happening without clear readiness criteria or coordination
- A team needs to align on what "ready to launch" means
- Post-launch monitoring and rollback criteria need to be defined

## Do not use this skill when
- The product isn't close to launch yet (use product-planning skills first)
- The goal is positioning and messaging definition (use develop-positioning-messaging)

## Required inputs
- Product or feature being launched
- Target launch timeline
- Target audience

## Optional inputs
- Readiness criteria list
- Stakeholder list
- Channel options
- Success metrics

## Upstream context
Works best when:
- Feature is built and in testing
- Positioning and messaging are defined
- Success metrics are defined

## If upstream context is missing
Produce a launch readiness assessment framework and flag what is still needed.

## Downstream handoff
Output can feed:
- enable-sales-cs (sales and CS enablement for the launch)
- analyze-experiment-results (if launch includes an A/B test or phased rollout)

## Instructions
1. Define launch readiness criteria across: product, quality, support, marketing, sales, legal/compliance.
2. Identify the launch audience: internal, beta, soft launch, full launch.
3. Define channels and messaging for each audience.
4. Build a pre-launch, launch day, and post-launch checklist.
5. Define success metrics and when to measure them.
6. Define rollback criteria and process.
7. Map stakeholders and communication plan.

## Output
Provide:
- Launch readiness criteria by area
- Launch audience and rollout strategy
- Channel plan and messaging brief
- Pre-launch / launch day / post-launch checklist
- Success metrics and measurement plan
- Rollback criteria and process
- Stakeholder communication plan

## Risks / caveats
- A launch without rollback criteria is a gamble
- Support and sales must be enabled before launch, not after
- Define "done" clearly — "feature is live" is not the same as "launch is successful"
