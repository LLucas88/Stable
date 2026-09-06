---
name: alexe-run-cohort-analysis
description: Structure and interpret a cohort analysis to understand retention, engagement, or behavior patterns over time. Use this skill when a team needs to understand how different user groups behave across their lifecycle.
metadata:
  source-name: run-cohort-analysis
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Cohort Analysis

## Purpose
Help teams design, run, and interpret cohort analyses that reveal retention patterns, lifecycle behaviors, and the impact of product or marketing changes on different user groups.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- Retention trends need to be understood beyond aggregate numbers
- The impact of a product change on different user groups needs to be evaluated
- Acquisition cohorts need to be compared across channels or time periods
- Behavioral differences between user segments need to be quantified

## Do not use this skill when
- The goal is a single-point metric (use detect-performance-signals)
- The goal is an A/B experiment analysis (use analyze-experiment-results)

## Required inputs
- Cohort definition (what event groups users: signup date, first purchase, acquisition channel)
- Metric to track per cohort (retention rate, revenue, feature usage)
- Time period and data availability

## Optional inputs
- Breakdown dimensions (segment, plan, geography)
- Benchmark or comparison cohorts
- Product changes or events to annotate

## Upstream context
Works best when:
- Event tracking is instrumented
- Retention metric is defined

## Downstream handoff
Output can feed:
- analyze-churn-retention (cohort patterns → churn root causes)
- detect-performance-signals (cohort changes surface signals)
- formulate-experiment-hypothesis (cohort insight → experiment idea)

## Instructions
1. Define the cohort grouping: time-based (weekly/monthly signup), behavior-based, or acquisition source.
2. Define the metric and measurement window.
3. Set up the cohort table: rows = cohorts, columns = time periods.
4. Identify the retention curve shape: fast decay, stable plateau, improving trend.
5. Compare cohorts to identify improvement or regression over time.
6. Annotate cohort boundaries with relevant product or market events.
7. Extract 2–3 key insights from the analysis.

## Output
Provide:
- Cohort definition and metric
- Cohort table structure (describe if actual data not available)
- Retention curve analysis: shape, plateau level, decay rate
- Cohort-to-cohort comparison: improving / stable / worsening
- Event annotations
- Key insights (2–3 specific findings)
- Recommended next steps

## Risks / caveats
- Cohort sample sizes must be large enough for meaningful comparison — flag small cohorts
- Time-based cohorts can conflate seasonal effects with product quality changes
- Don't act on a single cohort anomaly without checking for data quality issues
