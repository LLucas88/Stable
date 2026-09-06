---
name: alexe-build-roadmap-prioritization
description: Build and prioritize a feature or initiative roadmap using structured frameworks. Use this skill when a team has a backlog or list of initiatives and needs a coherent, prioritized plan.
metadata:
  source-name: build-roadmap-prioritization
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Roadmap & Prioritization

## Purpose
Help teams structure and prioritize a product roadmap that reflects strategic goals, user value, and delivery constraints.

## Skill type
Conceptual skill

## Use this skill when
- A team has a long backlog and can't decide what to do next
- A roadmap exists but lacks strategic coherence or trade-off clarity
- Stakeholders are debating priorities without a structured framework
- A quarterly or annual roadmap planning cycle is starting

## Do not use this skill when
- The goal is portfolio-level strategy (use build-portfolio-roadmap-strategy)
- The goal is sprint-level delivery planning (use plan-delivery-collaboration)

## Required inputs
- List of features, initiatives, or requests (even rough)
- Goals or OKRs this roadmap should serve

## Optional inputs
- Prioritization criteria or weights
- Team capacity or constraints
- Customer segment priorities
- Technical dependencies

## Upstream context
Works best when:
- Goals/OKRs are defined
- Opportunities are framed and sized

## If upstream context is missing
If no goals are defined, do not prioritize. First establish what outcomes the roadmap should drive.

## Downstream handoff
Output can feed:
- write-requirements-prd (define requirements for top priority items)
- plan-delivery-collaboration (structure delivery for prioritized items)
- set-goals-okrs-kpis (validate that prioritized items map to goals)

## Instructions
1. Collect all initiatives to be considered.
2. Apply a prioritization framework (RICE, ICE, opportunity-impact, or goal-mapping).
3. Map each initiative to a goal or OKR.
4. Identify quick wins vs. strategic bets.
5. Identify dependencies and sequencing constraints.
6. Produce a now / next / later roadmap structure.
7. Make trade-offs explicit: what is being deprioritized and why.

## Output
Provide:
- Prioritized initiative list with rationale
- Roadmap structure (now / next / later or time-horizon based)
- Goal mapping for each initiative
- Trade-off decisions (what was deprioritized)
- Dependencies and sequencing notes
- Assumptions

## Risks / caveats
- Prioritization without goals is opinion sorting, not strategy
- A roadmap is a communication tool, not a contract
- Make deprioritization visible — hiding it creates misalignment
