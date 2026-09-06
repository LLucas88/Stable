---
name: alexe-analyze-unit-economics
description: Analyze unit economics including CAC, LTV, payback period, and gross margin to assess product and business health. Use this skill when a team needs to understand the economic health of their product or business model.
metadata:
  source-name: analyze-unit-economics
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze Unit Economics

## Purpose
Help teams understand and interpret core unit economics to assess business model health and identify improvement opportunities.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- A team needs to evaluate whether the business model is working
- CAC, LTV, or payback period are unknown or concerning
- A pricing or growth decision requires unit economics grounding
- An investor or leadership review requires a unit economics view

## Do not use this skill when
- The goal is a full financial model (out of scope — requires finance expertise)
- The goal is pricing strategy (use support-pricing-packaging)

## Required inputs
- Business model type (subscription, transactional, usage-based, etc.)
- Available unit economics data (even partial)

## Optional inputs
- CAC by channel
- Churn rate
- Gross margin
- Expansion revenue data
- Cohort LTV data

## Upstream context
Works best when:
- Business model is defined
- Revenue and cost data are available

## Downstream handoff
Output can feed:
- build-business-case (unit economics ground investment cases)
- align-revenue-strategy

## Instructions
1. Calculate or estimate: CAC, LTV, LTV:CAC ratio, payback period, gross margin.
2. Assess the health of each metric against benchmarks.
3. Identify the biggest unit economics risk or gap.
4. Analyze drivers of CAC and LTV (what levers exist to improve them).
5. Assess the impact of churn on LTV.
6. Recommend improvement priorities.

## Output
Provide:
- Unit economics summary: CAC, LTV, LTV:CAC, payback period, gross margin
- Benchmark comparison
- Health assessment per metric
- Key risk or gap identification
- Improvement levers
- Assumptions and confidence level for each metric

## Risks / caveats
- Unit economics built on weak data should be labeled as estimates with confidence ranges
- LTV estimates must account for churn — ignoring churn creates inflated projections
- Channel-blended CAC hides unit economics problems — break out by channel where possible
