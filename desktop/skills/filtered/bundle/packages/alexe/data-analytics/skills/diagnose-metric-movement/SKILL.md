---
name: alexe-diagnose-metric-movement
description: Diagnose the root cause of an unexpected metric movement by systematically ruling out alternative explanations. Use this skill when a significant metric change has been detected and the team needs to understand why it happened.
metadata:
  source-name: diagnose-metric-movement
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Diagnose Metric Movement

## Purpose
Help teams systematically investigate why a metric moved — ruling out instrumentation errors, confounds, and alternative explanations before attributing the change to a product decision.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- A key metric has changed unexpectedly and the cause is unknown
- A team wants to attribute a metric change to a recent product change
- Multiple possible explanations need to be systematically evaluated
- A signal detected by monitoring needs root cause analysis

## Do not use this skill when
- The goal is experiment result analysis with randomized assignment (use analyze-experiment-results)
- The metric change is minor and within normal variance

## Required inputs
- Metric that changed (name and magnitude)
- Time period of the change
- Recent product changes or events that could be relevant

## Optional inputs
- Segment breakdowns of the metric
- Instrumentation audit results
- External events (holidays, competitor moves, market changes)
- Traffic source or acquisition channel breakdown

## Upstream context
Works best when:
- Baseline and normal variance are known
- Instrumentation is reliable
- Event log of product changes is available

## Downstream handoff
Output can feed:
- formulate-experiment-hypothesis (diagnosed cause → testable hypothesis)
- identify-problem-opportunity (root cause → opportunity)
- detect-performance-signals (diagnosis updates signal interpretation)

## Instructions
1. Confirm the metric change is real: check instrumentation, data pipeline, and tracking.
2. Check for data quality issues first — segment the change by source, platform, and geography.
3. Identify the timing: when exactly did the change begin?
4. List all product changes deployed in the relevant window.
5. Check for external confounds: seasonality, competitors, market events.
6. Run segment breakdowns to isolate who is driving the change.
7. Rank candidate causes by likelihood and evidence.
8. Recommend the most probable cause and next step to confirm.

## Output
Provide:
- Metric change summary (magnitude, direction, timing)
- Data quality check results
- Instrumentation issues found (if any)
- Timeline of product changes in the window
- External confound assessment
- Segment breakdown analysis
- Ranked candidate causes
- Most probable cause with evidence
- Recommended next step to confirm

## Risks / caveats
- Always check instrumentation before attributing a change to product — data issues are more common than they appear
- Correlation with a product change is not causation without a control group
- External factors (seasonality, competitor outages) are systematically underestimated
