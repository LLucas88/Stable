---
name: alexe-map-acquisition-funnel
description: Map the acquisition funnel from awareness to activation and identify conversion gaps. Use this skill when a team needs to understand where users are dropping out before becoming active.
metadata:
  source-name: map-acquisition-funnel
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Map Acquisition Funnel

## Purpose
Help teams build a clear picture of the acquisition-to-activation funnel, identify the biggest conversion gaps, and prioritize where to focus improvement efforts.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- Acquisition is bringing users in but activation is low
- The team doesn't have a shared view of the acquisition-to-activation flow
- Multiple channels have different funnel shapes and need to be compared
- A growth model requires a funnel baseline before setting improvement targets

## Do not use this skill when
- The goal is lifecycle engagement after activation (use plan-lifecycle-engagement)
- The goal is conversion optimization within a specific step (use optimize-conversion-growth-loops)

## Required inputs
- Product and acquisition channels
- Available funnel data (even rough estimates by stage)

## Optional inputs
- Channel breakdown of funnel performance
- Segment breakdown
- Historical funnel trends
- Competitor funnel benchmarks

## Upstream context
Works best when:
- Growth model is defined
- Event instrumentation covers funnel steps

## Downstream handoff
Output can feed:
- optimize-conversion-growth-loops (funnel map identifies optimization targets)
- design-onboarding-flow (activation gap → onboarding improvement)
- strategize-channel-campaigns (channel funnel differences → channel strategy)

## Instructions
1. Define funnel stages: awareness → interest → signup → onboarding → activation → retained.
2. Gather conversion rates between stages (use estimates if data is unavailable).
3. Map by acquisition channel if data allows.
4. Calculate absolute drop-off at each stage.
5. Identify the biggest conversion gaps (not just the lowest rate — account for volume).
6. Benchmark against industry norms where relevant.
7. Prioritize 1–2 stages for improvement based on impact potential.

## Output
Provide:
- Funnel stage definitions
- Conversion rates per stage
- Absolute drop-off volumes per stage
- Channel breakdown (if available)
- Biggest conversion gaps (prioritized by impact)
- Benchmark comparison (if available)
- Priority improvement areas with rationale

## Risks / caveats
- Low conversion at a high-volume stage matters more than low conversion at a low-volume stage
- Funnel analysis requires consistent event definitions — inconsistent tracking creates false gaps
- Don't optimize a broken funnel — fix product or onboarding issues before investing in acquisition volume
