---
name: alexe-prioritize-architecture-aware
description: Incorporate architectural constraints and technical debt into product prioritization decisions. Use this skill when a team needs to balance feature work with technical investment.
metadata:
  source-name: prioritize-architecture-aware
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Prioritize Architecture-Aware

## Purpose
Help product teams make prioritization decisions that account for architectural constraints, technical debt, and engineering feasibility — not just user value.

## Skill type
Conceptual skill

## Use this skill when
- Technical debt is blocking feature development speed
- Engineering is requesting investment in infrastructure but product can't evaluate it
- A prioritization decision requires architectural context
- A team is planning a major technical migration alongside feature work

## Do not use this skill when
- The goal is pure feature prioritization without technical constraints (use build-roadmap-prioritization)
- The goal is a technical architecture decision (engineering-owned)

## Required inputs
- Feature or initiative backlog (even rough)
- Technical debt or architecture constraints (as described by engineering)
- Business goals

## Optional inputs
- Engineering capacity breakdown (feature vs. infrastructure)
- Current system limitations
- Migration or upgrade plans

## Upstream context
Works best when:
- Roadmap priorities are defined
- Engineering has flagged technical constraints

## Downstream handoff
Output can feed:
- plan-delivery-collaboration (architecture-aware plan feeds delivery)
- collaborate-with-engineering

## Instructions
1. Identify technical constraints and their product impact (velocity reduction, user impact, reliability risk).
2. Translate technical debt into product terms: what does it cost in delivery speed or quality?
3. Assess the trade-off: feature investment vs. technical investment.
4. Recommend a ratio and sequencing for technical vs. feature work.
5. Identify technical investments that unlock future feature velocity.
6. Flag dependencies between technical and feature work.

## Output
Provide:
- Technical constraint summary in product terms
- Trade-off assessment: features vs. technical investment
- Recommended investment ratio and rationale
- Sequencing recommendation
- Dependencies between technical and feature work
- Assumptions from engineering that need validation

## Risks / caveats
- Product decisions that ignore technical debt create compounding delivery problems
- Always validate technical assessments with engineering — don't assume
- Technical investment without a product value narrative is hard to prioritize — frame both sides
