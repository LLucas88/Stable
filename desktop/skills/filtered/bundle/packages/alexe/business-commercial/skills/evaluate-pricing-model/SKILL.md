---
name: alexe-evaluate-pricing-model
description: Evaluate the current pricing model against customer behavior, competitive context, and business goals to identify structural improvements. Use this skill when pricing may be limiting growth or not capturing full value.
metadata:
  source-name: evaluate-pricing-model
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Evaluate Pricing Model

## Purpose
Help teams assess whether the current pricing model is aligned with value delivery, customer behavior, and business objectives — and identify structural changes worth pursuing.

## Skill type
Conceptual skill

## Use this skill when
- Pricing is suspected to be limiting growth or expansion
- A pricing model change is being considered (e.g., moving to usage-based)
- Competitive pricing pressure is eroding the current model
- Expansion revenue is low and pricing structure may be the cause

## Do not use this skill when
- The goal is packaging tiers (use design-packaging-tiers)
- The goal is pricing a new feature from scratch (use support-pricing-packaging)

## Required inputs
- Current pricing model and structure
- Target customer segments
- Business goals (growth, expansion, NRR, margin)

## Optional inputs
- Expansion revenue data
- Customer feedback on pricing
- Competitive pricing structures
- Churn reasons related to pricing
- Unit economics data

## Upstream context
Works best when:
- LTV:CAC model exists
- Customer segments are defined
- Churn analysis exists

## Downstream handoff
Output can feed:
- support-pricing-packaging (evaluation → pricing recommendations)
- design-packaging-tiers (model change → tier redesign)
- align-revenue-strategy (pricing model → revenue strategy)

## Instructions
1. Describe the current pricing model and how it works.
2. Identify the value metric: what do customers pay for? Is it aligned with the value they receive?
3. Assess expansion revenue: does the model allow customers to expand without friction?
4. Assess competitive positioning: how does pricing compare to alternatives?
5. Identify structural issues: where is the model misaligned with value or growth?
6. Evaluate alternative models: per-seat, usage-based, outcome-based, hybrid.
7. Recommend whether to keep, adjust, or replace the model.

## Output
Provide:
- Current model description
- Value metric assessment
- Expansion revenue analysis
- Competitive pricing position
- Structural issues identified
- Alternative model options with trade-offs
- Recommendation: keep / adjust / replace
- Validation steps before changing the model

## Risks / caveats
- Pricing model changes affect existing customers and require careful migration planning
- Usage-based pricing introduces revenue unpredictability — model the variance
- Pricing changes must be tested before full rollout — pilot with new customers first
