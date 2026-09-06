---
name: alexe-build-launch-readiness-checklist
description: Build a launch readiness checklist that covers all cross-functional dependencies before a product or feature goes live. Use this skill to ensure no critical launch step is missed.
metadata:
  source-name: build-launch-readiness-checklist
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Launch Readiness Checklist

## Purpose
Help teams build a comprehensive, role-specific launch readiness checklist that surfaces all dependencies, approvals, and preparation steps needed before shipping.

## Skill type
Conceptual skill

## Use this skill when
- A launch is approaching and no readiness checklist exists
- Past launches have had post-launch surprises (missing documentation, unprepared CS, broken tracking)
- A multi-team launch requires cross-functional coordination
- A launch template is needed for repeatable use across future releases

## Do not use this skill when
- The goal is launch strategy and timing (use plan-product-launch)
- The goal is positioning and messaging content (use develop-positioning-messaging)

## Required inputs
- Feature or product being launched
- Teams involved in the launch

## Optional inputs
- Launch scope (beta, general availability, phased rollout)
- Prior launch post-mortems
- Regulatory or compliance requirements

## Upstream context
Works best when:
- Launch plan exists
- Positioning and messaging are defined
- CS and sales enablement is underway

## Downstream handoff
Output can feed:
- plan-delivery-collaboration (readiness criteria gate delivery completion)
- enable-sales-cs (CS enablement is a checklist item)

## Instructions
1. Identify all launch stakeholders and their roles.
2. Map launch-critical tasks by function: product, engineering, design, CS, sales, marketing, legal, data.
3. For each task: define owner, definition of done, and deadline.
4. Identify go/no-go criteria — what must be true before launch proceeds.
5. Define rollback or mitigation plan if a critical item fails.
6. Structure the checklist by phase: pre-launch, launch day, post-launch.

## Output
Provide:
- Pre-launch checklist by function with owners and deadlines
- Go/no-go criteria
- Launch day checklist
- Post-launch monitoring checklist (D+1, D+7, D+30)
- Rollback or mitigation plan
- Communication plan (who gets notified, when)

## Risks / caveats
- Checklists only work if someone owns them — assign a launch DRI
- Go/no-go criteria must be binary and pre-agreed — don't negotiate them on launch day
- Post-launch monitoring is part of the launch, not optional
