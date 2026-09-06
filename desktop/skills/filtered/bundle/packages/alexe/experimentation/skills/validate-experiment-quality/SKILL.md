---
name: alexe-validate-experiment-quality
description: Audit whether a product experiment was designed and run in a way that makes the result trustworthy. Use this skill when the user wants to check for issues such as peeking, invalid stopping logic, traffic imbalance, contamination, or other threats to validity.
metadata:
  source-name: validate-experiment-quality
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Validate Experiment Quality

## Purpose
Check whether an experiment result is trustworthy enough for decision-making.

## Skill type
Calculation-aware validation skill

## Required inputs
- Experiment design summary
- Experiment execution summary

## Optional inputs
- Sample sizes
- Assignment logs
- Exposure logs
- Interim check behavior
- Stop logic
- Time window
- External events
- Guardrail behavior

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
- experiment design summary
- experiment execution summary
- stop logic information
- allocation information
- any known overlap with releases, campaigns, or incidents

## If upstream context is missing
If stop logic, sample planning, or procedural evidence is unknown, do not certify the experiment as trustworthy.
Return a limited-confidence audit and clearly list missing procedural evidence.

## Downstream handoff
A strong output from this skill should be usable by:
- recommend-post-test-decision
- experiment readout writing
- rerun / redesign planning

A good handoff includes:
- quality verdict
- major risks
- reliability level
- fatal vs manageable issues
- recommendation
- missing procedural evidence

## Context collection rules
This skill depends on procedural context.

### Strong procedural context
Run a fuller quality audit.

### Partial procedural context
Audit only the known risk areas and explicitly mark unknowns.

### Weak procedural context
Do not certify the test as trustworthy.
Return a limited-confidence audit and list what evidence is missing.

## Minimum evidence to collect for a meaningful audit
- was stopping logic predefined
- was sample size predefined
- were interim results monitored
- was allocation close to intended split
- could users leak across variants
- did external events overlap the test

## Validation rules
1. Check whether sample size or stopping logic was predefined.
2. Check whether the team peeked at interim results.
3. Check whether the experiment was stopped because the result looked good or bad before the planned endpoint.
4. Check whether traffic allocation looks suspiciously imbalanced.
5. Check whether users could leak across variants.
6. Check whether the measured metric actually matched the planned metric.
7. Check for contamination from external events, releases, campaigns, or outages.
8. Check whether many slices or metrics were explored after the fact without correction.
9. Produce a trustworthiness verdict.

## Output
Provide:
- Quality verdict
- Major risks
- Reliability level
- Fatal vs manageable issues
- Recommendation
- Missing procedural evidence