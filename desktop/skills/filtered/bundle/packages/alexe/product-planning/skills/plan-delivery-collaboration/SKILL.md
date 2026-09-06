---
name: alexe-plan-delivery-collaboration
description: Structure delivery planning, cross-functional alignment, and sprint or milestone planning. Use this skill when a team needs to coordinate execution across product, engineering, and design.
metadata:
  source-name: plan-delivery-collaboration
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Plan Delivery & Collaboration

## Purpose
Help teams structure the delivery process: milestones, dependencies, cross-functional coordination, and sprint/cycle planning.

## Skill type
Conceptual skill

## Use this skill when
- A team is ready to move from planning to execution and needs delivery structure
- Cross-functional alignment (product, engineering, design, QA) is breaking down
- A project has complex dependencies that need to be sequenced
- Sprint or milestone planning needs to account for capacity and risk

## Do not use this skill when
- Requirements aren't defined yet (use write-requirements-prd first)
- The goal is roadmap prioritization (use build-roadmap-prioritization)

## Required inputs
- Prioritized initiative or feature
- Team structure (rough: how many engineers, designers)
- Rough timeline or deadline

## Optional inputs
- Requirements or PRD
- Technical dependencies or architecture notes
- Risk factors
- Current sprint or planning cycle

## Upstream context
Works best when:
- Requirements are defined
- Team capacity is known
- Dependencies are mapped

## If upstream context is missing
Produce a delivery structure framework with placeholders and flag what needs to be confirmed.

## Downstream handoff
Output can feed:
- plan-product-launch (once delivery is complete)
- validate-experiment-quality (if delivery includes an A/B test)

## Instructions
1. Break the initiative into delivery phases or milestones.
2. Identify cross-functional dependencies (design handoff, data instrumentation, QA).
3. Map sequencing constraints.
4. Identify risks and mitigation steps.
5. Define checkpoints for alignment and go/no-go decisions.
6. Produce a lightweight delivery plan.

## Output
Provide:
- Delivery phases / milestones
- Cross-functional dependencies and owners
- Sequencing and critical path
- Risk factors and mitigation
- Alignment checkpoints
- Open questions before execution starts

## Risks / caveats
- Do not create delivery plans without requirements
- Always make dependencies visible — hidden dependencies cause delivery failures
- Build checkpoints into the plan, not just at the end
