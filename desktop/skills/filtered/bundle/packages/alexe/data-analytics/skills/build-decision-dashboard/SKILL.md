---
name: alexe-build-decision-dashboard
description: Structure a product dashboard that supports consistent, fast decision-making. Use this skill when a team needs to design or improve a product metrics dashboard.
metadata:
  source-name: build-decision-dashboard
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Decision Dashboard

## Purpose
Help teams design dashboards that surface the right metrics at the right level of detail to support regular product decisions.

## Skill type
Conceptual skill

## Use this skill when
- A team lacks a consistent way to monitor product health
- Dashboards exist but aren't used because they're too complex or disconnected from decisions
- A new product area needs monitoring from launch
- Leadership needs a concise product health view

## Do not use this skill when
- Metrics haven't been defined yet (use design-product-metrics first)
- The goal is one-time analysis (use analyze-funnel-retention-cohorts)

## Required inputs
- Product area being monitored
- Metrics to include (or goals the dashboard should support)
- Audience (team-level, leadership, cross-functional)

## Optional inputs
- Existing dashboard structure
- Data tools available (Mixpanel, Amplitude, Tableau, etc.)
- Decision frequency (weekly, monthly)

## Upstream context
Works best when:
- Metrics framework is defined
- Goals or OKRs are known

## Downstream handoff
Output can feed:
- detect-performance-signals (regular dashboard review surfaces signals)

## Instructions
1. Define the primary audience and how often they'll use the dashboard.
2. Define the key decisions this dashboard should support.
3. Select the top 5–10 metrics (less is more).
4. Design the information hierarchy: summary → detail → diagnostic.
5. Define alert thresholds for critical metrics.
6. Specify time ranges and comparison periods.
7. Add context: targets, baselines, and trend direction.

## Output
Provide:
- Dashboard purpose and audience
- Metric selection with rationale (why each metric is included)
- Information hierarchy design
- Alert thresholds
- Layout sketch or structure (text-based)
- Metrics to exclude and why

## Risks / caveats
- Dashboards with too many metrics are ignored — ruthlessly prioritize
- Context beats raw numbers: always show targets, baselines, and trends
- Design for the decision being made, not for data comprehensiveness
