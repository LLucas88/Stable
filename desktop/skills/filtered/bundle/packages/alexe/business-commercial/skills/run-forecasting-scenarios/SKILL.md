---
name: alexe-run-forecasting-scenarios
description: Build and compare forecasting scenarios to support product and business planning decisions. Use this skill when a team needs to project outcomes under different assumptions.
metadata:
  source-name: run-forecasting-scenarios
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Forecasting Scenarios

## Purpose
Help teams build structured scenario forecasts that surface the range of possible outcomes and their business implications.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- A team needs to plan under uncertainty and wants to test assumptions
- Leadership needs a view of upside, base case, and downside scenarios
- A product decision has different revenue implications depending on execution
- Annual or quarterly planning requires a range of projections

## Do not use this skill when
- The goal is unit economics analysis (use analyze-unit-economics)
- A one-point forecast is sufficient and uncertainty is low

## Required inputs
- Metric to forecast (revenue, users, CAC, churn, etc.)
- Current baseline and growth context
- Time horizon

## Optional inputs
- Key assumptions to vary
- Strategic initiatives that affect the forecast
- Historical trends
- Competitive or market context

## Upstream context
Works best when:
- Baseline metrics are known
- Key growth drivers are identified

## Downstream handoff
Output can feed:
- build-business-case (scenarios feed investment cases)
- align-revenue-strategy

## Instructions
1. Define the metric being forecasted and the time horizon.
2. Establish the current baseline.
3. Identify the key drivers and assumptions that affect the forecast.
4. Build 3 scenarios: base case, upside, downside.
5. For each scenario, vary assumptions and project the outcome.
6. Identify which assumptions have the most leverage.
7. Recommend which scenario to plan for and why.

## Output
Provide:
- Metric and time horizon
- Baseline
- Key assumptions per scenario
- Scenario table: base / upside / downside with projections
- Sensitivity analysis: which assumptions drive the most variance
- Planning recommendation
- Confidence level

## Risks / caveats
- Forecasts are wrong — the value is in understanding the assumptions, not the number
- Present ranges, not false precision
- Update forecasts when key assumptions change — stale forecasts mislead
