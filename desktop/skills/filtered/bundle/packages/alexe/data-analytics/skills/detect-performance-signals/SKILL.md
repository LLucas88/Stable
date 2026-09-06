---
name: alexe-detect-performance-signals
description: Identify and interpret signals of product performance change including regressions, improvements, and anomalies. Use this skill when a team needs to investigate an unexpected change in a metric.
metadata:
  source-name: detect-performance-signals
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Detect Performance Signals

## Purpose
Help teams identify, contextualize, and interpret signals of performance change — distinguishing real shifts from noise, and regressions from improvements.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- A metric has moved unexpectedly (up or down)
- A team is unsure whether a change is meaningful or noise
- An alert has fired and needs to be investigated
- Post-launch monitoring has surfaced an anomaly

## Do not use this skill when
- The goal is structured experiment result analysis (use analyze-experiment-results)
- No metric baseline or monitoring exists

## Required inputs
- Metric that changed
- Observed change (magnitude and direction)
- Time period of the change

## Optional inputs
- Baseline or expected value
- Recent product changes or events
- Segment breakdown
- Data source and methodology

## Upstream context
Works best when:
- Metrics framework is defined
- Dashboard is in place
- Historical baseline exists

## If upstream context is missing
If no baseline exists, produce a signal investigation framework and flag that without baselines, changes cannot be assessed.

## Downstream handoff
Output can feed:
- formulate-experiment-hypothesis (unexplained signal → investigation → experiment)
- analyze-funnel-retention-cohorts (drill into funnel or cohort to diagnose)
- identify-problem-opportunity (signal becomes a product problem to investigate)

## Instructions
1. Establish the baseline (what was normal before the change).
2. Quantify the change: magnitude, direction, duration.
3. Check for data quality issues: tracking change, instrumentation error, data lag.
4. Identify potential causes: product changes, external events, seasonality, data issues.
5. Determine if the change is statistically meaningful vs. noise.
6. Recommend investigation path: more data, qualitative research, or experiment.

## Output
Provide:
- Signal summary: what changed, by how much, when
- Baseline context
- Data quality assessment
- Potential causes (ordered by likelihood)
- Assessment: noise / meaningful signal / regression / improvement
- Recommended next steps

## Risks / caveats
- Avoid premature conclusions — investigate causes before acting
- Check instrumentation before assuming a real product change
- Seasonality and external events are common and frequently overlooked
