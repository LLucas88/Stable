---
name: alexe-build-portfolio-roadmap-strategy
description: Structure product portfolio decisions and translate strategy into a prioritized roadmap. Use this skill when a team needs to align investment decisions with strategic goals and build a coherent roadmap.
metadata:
  source-name: build-portfolio-roadmap-strategy
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Portfolio & Roadmap Strategy

## Purpose
Help teams translate product strategy and business goals into a structured portfolio view and a prioritized roadmap that reflects strategic trade-offs.

## Skill type
Conceptual skill

## Use this skill when
- A team needs to prioritize across multiple product areas or bets
- A roadmap exists but lacks strategic coherence
- Leadership needs to make investment trade-off decisions across the portfolio
- The team is planning for a new quarter, half, or year

## Do not use this skill when
- A single feature needs prioritization (this skill is portfolio-level, not feature-level)
- The team needs vision definition (use define-product-vision)
- The team needs delivery planning and sprint-level execution (use product-planning skills)

## Required inputs
- Current product areas or bets (even rough list)
- Business goals or strategic priorities
- Any constraints (team size, budget, timeline)

## Optional inputs
- Existing roadmap or backlog
- Customer segment priorities
- Product-market fit assessment per area
- Competitive context
- OKRs or KPIs

## Upstream context
Works best when:
- Product vision is defined
- Key strategic bets are identified
- Business goals or OKRs exist

## If upstream context is missing
If no strategic goals or product areas are provided, produce a portfolio structuring framework first.
Do not prioritize without knowing what the goals are.

## Downstream handoff
Output can feed:
- product-planning domain (translate portfolio decisions into roadmap execution)
- define-success-metrics (assign metrics to each portfolio bet)

## Instructions
1. Identify all current product areas, bets, or investment themes.
2. Map each area to a strategic goal or business outcome.
3. Assess relative strategic priority: core / growth / explore.
4. Identify resource constraints and trade-offs.
5. Produce a portfolio view with rationale.
6. Produce a high-level roadmap structure (now / next / later or similar framework).
7. List assumptions and decisions that require stakeholder alignment.

## Output
Provide:
- Portfolio map: areas and their strategic classification
- Prioritization rationale
- High-level roadmap structure (now / next / later)
- Trade-offs and what is being deprioritized and why
- Key alignment decisions needed
- Confidence level: provisional / context-informed / ready-to-present

## Risks / caveats
- Do not build a roadmap without knowing the strategic goals
- Prioritization without trade-off visibility creates false clarity
- A roadmap is a communication tool, not a commitment — label it accordingly
