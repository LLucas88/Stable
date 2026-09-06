---
name: alexe-identify-growth-loop
description: Identify and map the compounding growth loops embedded in a product. Use this skill when a team wants to understand what mechanisms drive self-reinforcing growth and how to strengthen them.
metadata:
  source-name: identify-growth-loop
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Identify Growth Loop

## Purpose
Help teams identify the growth loops that are already present in the product and assess which are strongest, which are under-leveraged, and which don't exist but should.

## Skill type
Conceptual skill

## Use this skill when
- The team relies entirely on paid acquisition with no compounding growth
- Organic growth exists but the mechanism isn't understood or optimized
- A product redesign needs to incorporate growth loop thinking
- The growth model needs to shift from linear (paid) to compounding (loops)

## Do not use this skill when
- The goal is optimizing a specific conversion step (use optimize-conversion-growth-loops)
- The goal is channel strategy (use strategize-channel-campaigns)

## Required inputs
- Product description and core user actions
- Existing growth patterns (rough: "we grow mostly through referrals" or "mostly paid")

## Optional inputs
- Referral or virality data
- Content or SEO performance
- Network effect signals
- User engagement data

## Upstream context
Works best when:
- Growth model is defined
- Acquisition funnel is mapped

## Downstream handoff
Output can feed:
- optimize-conversion-growth-loops (loop identification → loop strengthening)
- design-growth-model (loops are inputs to the growth model)

## Instructions
1. Identify the core user action that creates value in the product.
2. For each action, ask: does this action create something that brings in or retains more users?
3. Map candidate loops: acquisition loops, engagement loops, content loops, network effect loops.
4. For each loop: describe the cycle, estimate its current strength, and identify the weakest link.
5. Identify loops that should exist given the product type but currently don't.
6. Prioritize loops by potential impact and feasibility to strengthen.

## Output
Provide:
- Identified growth loops with cycle descriptions
- Loop type: acquisition / engagement / content / network effect
- Current strength assessment per loop (strong / weak / broken / missing)
- Weakest link in each active loop
- Missing loops that should exist
- Priority order for strengthening
- Investment required per loop improvement

## Risks / caveats
- Not every product has strong inherent loops — identify them honestly before designing around them
- A loop with a broken step compounds nothing — fix the weakest link before optimizing other steps
- Network effect loops require critical mass to work — design for the pre-network-effect phase
