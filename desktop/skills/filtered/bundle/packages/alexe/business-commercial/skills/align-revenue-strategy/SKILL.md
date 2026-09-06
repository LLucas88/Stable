---
name: alexe-align-revenue-strategy
description: Ensure product decisions are aligned with the revenue model, pricing strategy, and commercial goals. Use this skill when a team needs to check or strengthen alignment between product direction and revenue outcomes.
metadata:
  source-name: align-revenue-strategy
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Align Revenue Strategy

## Purpose
Help product teams ensure their decisions and priorities are aligned with the company's revenue model, pricing strategy, and commercial goals.

## Skill type
Conceptual skill

## Use this skill when
- A product initiative may conflict with or support revenue goals but the alignment is unclear
- The revenue model is changing and product decisions need to adapt
- A pricing or packaging change is being considered and product implications need to be evaluated
- A team wants to stress-test whether their roadmap serves commercial goals

## Do not use this skill when
- The goal is pricing analysis (use support-pricing-packaging)
- The goal is financial forecasting (use run-forecasting-scenarios)

## Required inputs
- Product roadmap or initiative
- Revenue model and current commercial goals

## Optional inputs
- Pricing structure
- ICP and key segments
- Sales or CS feedback on commercial friction
- Unit economics data

## Upstream context
Works best when:
- Business case is developed
- Unit economics are understood

## Downstream handoff
Output can feed:
- build-portfolio-roadmap-strategy (commercial alignment affects portfolio decisions)

## Instructions
1. Map product initiatives to revenue impact: direct (monetized features) / indirect (retention, expansion) / none.
2. Identify commercial goals the roadmap supports or misses.
3. Flag initiatives that may conflict with pricing or revenue model.
4. Identify product gaps that are creating commercial friction (sales cycles, churn, expansion limits).
5. Recommend adjustments to align product with commercial priorities.

## Output
Provide:
- Initiative-to-revenue impact map
- Commercial goal alignment assessment
- Conflict flags (where product and commercial goals diverge)
- Commercial friction points from product gaps
- Alignment recommendations
- Priority adjustments suggested

## Risks / caveats
- Pure commercial optimization of the product roadmap damages long-term product health
- Not every product initiative must have direct revenue impact — some serve strategic positioning
- Revenue alignment requires honest conversation with sales and CS — not just analysis
