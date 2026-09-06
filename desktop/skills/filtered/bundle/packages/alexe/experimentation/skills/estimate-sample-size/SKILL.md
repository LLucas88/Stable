---
name: alexe-estimate-sample-size
description: Estimate the sample size and expected duration needed for a product experiment. Use this skill when the user has a primary metric and wants to know how many users are needed to detect a meaningful effect with a chosen confidence level and power.
metadata:
  source-name: estimate-sample-size
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Estimate Sample Size

## Purpose
Estimate how much eligible traffic is needed for a reliable experiment and how long the test may need to run.

## Skill type
Calculation-aware skill

## Use this skill when
- The user is preparing an A/B test
- The user has a primary metric and baseline value
- The user wants to estimate experiment duration

## Required inputs
- Primary metric type
- Baseline metric value
- Minimum detectable effect or minimum meaningful effect
- Confidence level or significance level
- Statistical power

## Optional inputs
- Daily or weekly eligible traffic
- Split ratio
- Segment size
- Expected exclusions
- Seasonality notes

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
- a defined primary metric
- baseline metric value
- minimum detectable effect or minimum meaningful effect
- confidence / significance choice
- power choice

## If upstream context is missing
If baseline, MDE, or statistical settings are missing, do not calculate fake precision.
Return a setup checklist or scenario guidance instead of a definitive estimate.
If duration is requested but eligible traffic is unknown, estimate sample size only and explicitly block duration.

## Downstream handoff
A complete output from this skill should be usable by:
- design-experiment-plan
- launch timeline estimation
- feasibility review

A good handoff includes:
- sample size per group
- total sample size
- estimated duration if possible
- assumptions used
- feasibility warning

## Context collection rules
For this skill, “context” means input completeness, not product storytelling.

### Complete context
Proceed with estimation.

### Partial context
Estimate only what is defensible and clearly mark missing assumptions.

### Insufficient context
Do not calculate fake precision.
List missing mandatory inputs and stop at a setup checklist.

## Mandatory missing-input checklist
Collect before calculation if absent:
- baseline
- MDE or minimum meaningful effect
- confidence/significance
- power
- eligible traffic if duration is requested

## Calculation rules
1. Confirm metric type.
2. If the metric is a conversion/rate metric, use baseline conversion and target conversion implied by MDE.
3. If the metric is continuous but variance is unknown, explicitly say estimation will be rough unless standard deviation is provided.
4. Use the provided significance level and power, or state the defaults if the user did not specify them.
5. Estimate sample size per variant.
6. Estimate total sample size.
7. If eligible traffic is provided, convert total required sample into estimated duration.
8. If only a fraction of total traffic is eligible, use eligible traffic, not total traffic.
9. If assumptions are weak, present the result as a scenario estimate, not as an exact answer.

## Output
Provide:
- Sample size per group
- Total sample size
- Estimated duration
- Inputs used
- Missing inputs, if any
- Assumptions used
- Feasibility warning, if relevant
