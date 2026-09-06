---
name: alexe-analyze-experiment-results
description: Analyze the outcome of a product experiment using control and test results, effect size, and statistical evidence. Use this skill when the user has experiment results and needs a clear readout of what happened.
metadata:
  source-name: analyze-experiment-results
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze Experiment Results

## Purpose
Interpret experiment outcomes using metric deltas, uncertainty, and business context.

## Skill type
Calculation-aware skill

## Use this skill when
- The user has results from control and test groups
- The user wants to understand whether variant B outperformed A
- The user needs a concise experiment readout

## Required inputs
- Control group results
- Test group results
- Primary metric

## Optional inputs
- Secondary metrics
- Guardrail metrics
- P-value
- Confidence interval
- Sample sizes
- Time series
- Segment cuts

## Additional resources

### Use examples/ when
- you need to see examples of complete inputs, missing inputs, or unsafe interpretation
- you need to match the expected output format
- you need to see how the skill behaves under different levels of input completeness

### Use REFERENCE.md when
- you need calculation logic
- you need formulas, assumptions, or interpretation rules
- you need invalid-use conditions
- you need trust checks or caveats for incomplete or unreliable inputs

### Important
Do not rely on examples as a substitute for methodology.
Use REFERENCE.md whenever the task requires formulas, assumptions, statistical interpretation, or trust checks.

### Resource priority
1. Read this Skill.md first
2. Use examples/ for behavior patterns and output shape
3. Use REFERENCE.md for methodology and interpretation rules

## Upstream context
This skill works best when the following already exist:
- clear control and test results
- primary metric definition
- sample sizes or a statistical summary
- any known guardrail signals
- ideally an experiment design or quality context

## If upstream context is missing
If sample sizes, metric definition, or statistical summary are missing, reduce the analysis to descriptive comparison.
If business context is missing, avoid strong action recommendations.
If procedure quality is unknown, state that confidence in decision-making is limited.

## Downstream handoff
A strong output from this skill should be usable by:
- validate-experiment-quality
- recommend-post-test-decision
- experiment readout or memo writing

A good handoff includes:
- effect size
- statistical summary
- guardrail summary
- result classification
- caveats
- missing context that limits confidence

## Context collection rules
For this skill, context has two layers:
1. calculation context
2. business interpretation context

### Strong calculation context
Proceed with full analysis.

### Weak calculation context
Analyze descriptively and state that statistical interpretation is limited.

### Weak business context
Interpret the numbers, but avoid strong product recommendations.

## Minimum context to collect for a strong readout
- clear primary metric definition
- comparable control and test values
- sample sizes or statistical summary
- any major guardrail signal
- whether the test result is intended for business decision-making

## Analysis rules
1. Compare the primary metric between variants.
2. Report the observed effect in both absolute and relative terms when appropriate.
3. If p-value and/or confidence interval are provided, interpret them.
4. If raw counts are provided for a simple rate metric and no p-value is provided, indicate that statistical testing should be performed using an appropriate method for the metric type.
5. Distinguish:
   - observed uplift
   - statistical significance
   - practical/business significance
6. Review guardrails before giving a positive interpretation.
7. If the result quality is uncertain, explicitly say the analysis depends on experiment validity.

## Output
Provide:
- Primary metric comparison
- Effect size
- Statistical summary
- Guardrail summary
- Result classification
- Practical interpretation
- Key caveats
- Missing context that limits confidence
