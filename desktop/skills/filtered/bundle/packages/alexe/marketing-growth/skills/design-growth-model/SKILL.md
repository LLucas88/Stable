---
name: alexe-design-growth-model
description: Build or assess a growth model covering acquisition, activation, retention, referral, and revenue (AARRR). Use this skill when a team needs to understand their growth levers and where to focus.
metadata:
  source-name: design-growth-model
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Growth Model

## Purpose
Help teams build or evaluate a growth model that maps how users move through the funnel and which levers drive sustainable growth.

## Skill type
Conceptual skill

## Use this skill when
- A team doesn't have a clear growth model
- Growth has plateaued and the team doesn't know which lever to pull
- A new product is being designed and the growth engine needs to be thought through
- A growth review requires a structured model to diagnose performance

## Do not use this skill when
- The goal is a specific channel campaign (use strategize-channel-campaigns)
- The goal is lifecycle messaging design (use plan-lifecycle-engagement)

## Required inputs
- Product description and business model
- Current growth data (even rough)

## Optional inputs
- Current funnel metrics
- Revenue model
- Key growth experiments run so far
- Competitive growth patterns

## Upstream context
Works best when:
- Product-market fit signals exist
- Some data on acquisition, activation, and retention is available

## If upstream context is missing
Produce a growth model framework with placeholder metrics and flag what data is needed.

## Downstream handoff
Output can feed:
- plan-lifecycle-engagement
- strategize-channel-campaigns
- optimize-conversion-growth-loops

## Instructions
1. Map the growth funnel: acquisition → activation → retention → referral → revenue.
2. Identify current conversion rates at each stage (or estimate).
3. Identify the stage with the biggest growth gap or opportunity.
4. Identify the primary growth loop (viral, paid, content, product-led).
5. Assess leverage: where does improving 10% at one stage have the biggest downstream impact?
6. Recommend priority growth focus areas.

## Output
Provide:
- Growth funnel map with metrics at each stage
- Primary growth loop description
- Stage-level assessment: healthy / underperforming / unknown
- Leverage analysis (where to focus first)
- Recommended growth priorities
- Data gaps

## Risks / caveats
- Growth model without retention data is just acquisition optimization — fix retention first
- Not all growth loops apply to all products — identify the primary one before optimizing
- Vanity metrics (total installs, registrations) tell you nothing about growth health
