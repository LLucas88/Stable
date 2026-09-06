---
name: alexe-support-pricing-packaging
description: Analyze and recommend pricing structures and packaging options aligned with value delivery and business goals. Use this skill when a team needs to make or review pricing and packaging decisions.
metadata:
  source-name: support-pricing-packaging
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Support Pricing & Packaging

## Purpose
Help teams structure and analyze pricing and packaging decisions aligned with customer value and business objectives.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- A new product or feature needs a pricing decision
- Current pricing is creating customer friction or revenue leakage
- The team is designing packaging tiers or bundles
- Pricing needs to be revised as the product evolves

## Do not use this skill when
- Pricing research data needs deep statistical analysis (use data-analytics skills)
- The goal is positioning or messaging (use develop-positioning-messaging)

## Required inputs
- Product or feature being priced
- Target customer segment
- Business model (subscription, usage-based, one-time, freemium)

## Optional inputs
- Current pricing structure
- Customer feedback on pricing
- Competitor pricing
- Unit economics data
- Value metrics (what customers pay for)

## Upstream context
Works best when:
- Target segment and ICP are defined
- Product value is understood
- Competitive landscape is known

## If upstream context is missing
Provide a pricing framework with options, but flag that the right choice depends on value metric and WTP data.

## Downstream handoff
Output can feed:
- plan-product-launch (pricing communication for launch)
- build-business-case (pricing feeds revenue projections)

## Instructions
1. Identify the value metric (what customers get more/less of as they pay more).
2. Review current pricing model and identify friction points.
3. Map packaging options to customer segments.
4. Evaluate 2–3 pricing structures with trade-offs.
5. Recommend packaging tiers with rationale.
6. Identify validation steps (pricing research, customer interviews).

## Output
Provide:
- Value metric identification
- Pricing model options with trade-offs
- Recommended packaging structure and tiers
- Rationale per tier
- Validation steps before finalizing
- Risks and open questions

## Risks / caveats
- Pricing changes are high-stakes and hard to reverse — always validate before shipping
- Willingness-to-pay data must come from customers, not internal assumptions
- Freemium only works when conversion logic is clear
