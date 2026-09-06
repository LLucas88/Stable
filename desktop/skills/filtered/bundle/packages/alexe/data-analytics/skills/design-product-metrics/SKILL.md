---
name: alexe-design-product-metrics
description: Define a metrics framework for a product area including primary metrics, secondary metrics, and guardrails. Use this skill when a team needs to decide what to measure and how metrics connect to goals.
metadata:
  source-name: design-product-metrics
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Product Metrics

## Purpose
Help teams define a coherent metrics framework that connects product decisions to measurable outcomes.

## Skill type
Conceptual skill

## Use this skill when
- A product area lacks clear metrics
- A team is starting a new product or feature and needs instrumentation guidance
- Existing metrics are disconnected from goals or decisions
- OKRs need to be translated into measurable product metrics

## Do not use this skill when
- Metrics are already defined and data needs to be analyzed (use analyze-funnel-retention-cohorts)
- The goal is experiment result analysis (use experimentation skills)

## Required inputs
- Product area and context
- Business or product goals

## Optional inputs
- Existing metrics or tracking
- User journey or funnel map
- OKRs
- Data infrastructure context

## Upstream context
Works best when:
- Goals and OKRs are defined
- Product flow is understood

## If upstream context is missing
Produce a metrics design framework with placeholder categories and flag that specific metrics require goal context.

## Downstream handoff
Output can feed:
- build-decision-dashboard
- set-goals-okrs-kpis (metrics inform KR choices)
- define-success-metrics (experiment metrics derived from product metrics)

## Instructions
1. Map the user journey or funnel relevant to the product area.
2. Identify the primary metric (the one metric that best reflects product success for this area).
3. Identify secondary metrics (leading indicators, supporting signals).
4. Define guardrail metrics (what must not degrade).
5. Flag vanity metrics to avoid.
6. Map each metric to a goal or OKR.
7. Identify data requirements and instrumentation needs.

## Output
Provide:
- Primary metric with definition
- Secondary metrics (3–5)
- Guardrail metrics
- Metric-to-goal mapping
- Instrumentation requirements
- Vanity metrics to avoid
- Gaps in current data coverage

## Risks / caveats
- Measuring too many things dilutes focus — one primary metric per product area
- Vanity metrics (total signups, total pageviews) feel good and mean nothing without context
- If a metric can't inform a decision, it probably shouldn't be on the dashboard
