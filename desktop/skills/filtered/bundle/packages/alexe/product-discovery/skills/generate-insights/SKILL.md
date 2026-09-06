---
name: alexe-generate-insights
description: Distill raw observations and research data into meaningful, actionable product insights. Use this skill when a team has research data and needs to move from observations to insights that can drive decisions.
metadata:
  source-name: generate-insights
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Generate Insights

## Purpose
Help teams transform raw research observations — quotes, behaviors, patterns — into well-formed product insights that are non-obvious, specific, and decision-relevant.

## Skill type
Conceptual skill

## Use this skill when
- Research has been conducted but the team isn't sure what it means
- Observations have been collected but haven't been turned into insights
- A synthesis session needs structure to move from data to meaning
- Multiple research sources need to be combined into a unified insight set

## Do not use this skill when
- The goal is structuring observations into opportunity statements (use frame-insight-opportunity)
- The goal is presenting findings to stakeholders (this skill generates insights; presentation is downstream)

## Required inputs
- Research observations, notes, or synthesized themes

## Optional inputs
- Prior beliefs or assumptions to contrast with findings
- Multiple research sources to triangulate
- Segment or context breakdown of data

## Upstream context
Works best when:
- User interviews or other qualitative research has been completed
- Observations have been collected and organized

## If upstream context is missing
Cannot generate insights without data. Return to synthesize-qualitative-research or run-user-interviews first.

## Downstream handoff
Output can feed:
- frame-insight-opportunity (insights → opportunity statements)
- develop-persona-segment (insights about different user types → personas)
- formulate-experiment-hypothesis (insights → testable hypotheses)

## Instructions
1. Review all observations and group related ones into themes.
2. For each theme, identify the underlying pattern — what does this tell us about user behavior or needs?
3. Test each candidate insight: is it non-obvious? Is it specific? Is it supported by multiple data points?
4. Write each insight as a declarative statement (not a question, not a recommendation).
5. Rate evidence quality: single data point / pattern / strongly supported.
6. Identify contradictory data points — don't ignore them.
7. Separate insights from implications and recommendations.

## Output
Provide:
- Insight set (3–10 insights, each as a clear declarative statement)
- Supporting evidence for each insight
- Evidence quality rating
- Contradictory or complicating data
- What this changes relative to prior assumptions
- Gaps: what we still don't know

## Risks / caveats
- "Users want X" is an observation or a recommendation, not an insight
- An insight with only one supporting data point is a hypothesis
- Don't filter out uncomfortable insights — they're often the most valuable
