---
name: alexe-analyze-funnel-retention-cohorts
description: Analyze funnel drop-off, retention curves, and cohort behavior to identify problems and opportunities. Use this skill when a team has data and needs to understand user behavior patterns.
metadata:
  source-name: analyze-funnel-retention-cohorts
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze Funnel, Retention & Cohorts

## Purpose
Turn funnel, retention, and cohort data into product insights that identify where users drop off, churn, or get stuck.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- A funnel has unexplained drop-off at specific steps
- Retention is declining or unexpectedly flat
- Cohort analysis is needed to understand behavioral differences across user groups
- A product change may have affected retention and needs investigation

## Do not use this skill when
- No data is available (collect data first)
- The goal is experiment result analysis (use analyze-experiment-results)

## Required inputs
- Funnel data, retention data, or cohort data (at least one)
- Product context (what flow or user group is being analyzed)

## Optional inputs
- Baseline benchmarks
- Cohort definitions
- Time range
- Segment breakdowns

## Upstream context
Works best when:
- Metrics framework is defined
- Data instrumentation is in place

## If upstream context is missing
If data is absent, produce a data collection plan and flag that analysis cannot proceed without it.

## Downstream handoff
Output can feed:
- detect-performance-signals
- formulate-experiment-hypothesis (data insights become experiment inputs)
- identify-problem-opportunity

## Instructions
1. Map the funnel or retention structure being analyzed.
2. Identify drop-off points or retention cliff events.
3. Compare cohorts if relevant (by acquisition source, segment, time period).
4. Identify patterns and anomalies.
5. Generate hypotheses for the observed behavior.
6. Recommend next steps: further analysis, qualitative research, or experiment.

## Output
Provide:
- Funnel analysis with drop-off rates per step
- Retention curve interpretation
- Cohort comparison summary (if applicable)
- Key patterns and anomalies
- Hypotheses for observed behavior
- Recommended next steps
- Data quality caveats

## Risks / caveats
- Correlation in cohort data is not causation — use it for hypothesis generation, not conclusions
- Segment data before drawing conclusions — average retention often hides meaningful variation
- Small cohorts produce noisy results — flag when sample sizes are thin
