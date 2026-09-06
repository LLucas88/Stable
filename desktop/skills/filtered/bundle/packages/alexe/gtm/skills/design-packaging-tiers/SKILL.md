---
name: alexe-design-packaging-tiers
description: Design product packaging tiers that align value delivery with willingness to pay and strategic segment goals. Use this skill when a product needs tiered packaging (free/starter/pro/enterprise) or when existing tiers need restructuring.
metadata:
  source-name: design-packaging-tiers
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Packaging Tiers

## Purpose
Help teams design packaging tiers that match value delivery to different customer segments, drive natural upgrade paths, and align with revenue goals.

## Skill type
Conceptual skill

## Use this skill when
- A product is adding a tier structure for the first time
- Existing tiers don't create a clear upgrade path or are confusing to customers
- A freemium model needs to be redesigned to improve conversion
- An enterprise tier needs to be defined around different value and buying criteria

## Do not use this skill when
- The goal is pricing level (price points) without tier design (use support-pricing-packaging)
- The goal is positioning and messaging for each tier (use develop-positioning-messaging)

## Required inputs
- Product capabilities available to tier
- Target customer segments (at least 2–3 distinct profiles)
- Business model (freemium, self-serve SaaS, enterprise, etc.)

## Optional inputs
- Current pricing and packaging
- Customer feedback on tiers
- Expansion revenue patterns
- Competitive tier structures

## Upstream context
Works best when:
- Value metric is defined
- Target segments are clear
- Pricing model is chosen

## Downstream handoff
Output can feed:
- support-pricing-packaging (tiers feed pricing decisions)
- develop-positioning-messaging (each tier needs positioning)
- enable-sales-cs (CS and sales need to know what's in each tier)

## Instructions
1. Define the value metric: what do customers get more of as they pay more?
2. Map customer segments to their willingness to pay and primary value drivers.
3. Design 3–4 tiers max: free/starter → core → advanced → enterprise (or equivalent).
4. For each tier: define what's included, who it's for, and what the upgrade trigger is.
5. Define the conversion path: what makes someone naturally move to the next tier?
6. Identify features that must be in free (for adoption) vs. paid (for revenue).
7. Check for tier cannibalization — does a lower tier remove incentive to upgrade?

## Output
Provide:
- Value metric
- Tier structure (name, target segment, included capabilities, price range if available)
- Upgrade triggers per tier
- Features in free vs. paid tiers with rationale
- Conversion path design
- Tier cannibalization risks
- Validation steps before launch

## Risks / caveats
- Too many tiers confuse buyers — 3–4 is the practical maximum
- Free tiers that include too much kill conversion; free tiers that include too little kill adoption
- Enterprise tiers require a different sales motion — design for that, not just feature access
