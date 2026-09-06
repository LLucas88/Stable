---
name: alexe-identify-problem-opportunity
description: Identify and frame the real product problem or opportunity before jumping to solutions. Use this skill when a team has a rough signal, observation, or area of concern but hasn't yet defined what the actual problem is.
metadata:
  source-name: identify-problem-opportunity
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Identify Problem & Opportunity

## Purpose
Turn vague signals, complaints, data observations, or business goals into clearly framed product problems or opportunities ready for research and discovery.

## Skill type
Conceptual skill

## Use this skill when
- A team has customer complaints but no clear problem statement
- There is a business goal that doesn't yet have a product problem mapped to it
- A data signal (drop in retention, low activation) needs to be turned into a problem to investigate
- A team is debating solutions before the problem is clearly defined

## Do not use this skill when
- The problem is already well-defined and validated (proceed to research or hypothesis)
- The team needs to design an experiment (use experimentation skills)
- The goal is solution design or feature definition

## Required inputs
- Raw signal: complaint, data observation, business goal, or team concern

## Optional inputs
- Affected user segment
- Related metrics or data
- Customer feedback snippets
- Prior attempts to address the issue

## Upstream context
Works best when at least one of:
- A rough signal or observation exists
- A business area or metric is identified as underperforming

## If upstream context is missing
If only a vague area is provided ("our onboarding isn't great"), do not jump to framing a specific problem.
List the questions that must be answered first, then provide a provisional problem framing.

## Downstream handoff
Output can feed:
- synthesize-qualitative-research (go gather data to validate the problem)
- formulate-experiment-hypothesis (if a hypothesis is already emerging)
- develop-persona-segment (if the affected segment is unknown)

## Instructions
1. Identify the raw signal (what triggered the discovery need).
2. Distinguish between symptom and underlying problem.
3. Identify the affected user segment (or flag as unknown).
4. Frame the problem in user terms, not solution terms.
5. Identify the business impact if the problem is not solved.
6. Assess evidence quality: anecdotal / data-backed / validated.
7. List what needs to be researched to confirm the problem.

## Output
Provide:
- Problem statement (user-centric)
- Affected segment (or unknown)
- Raw signal that triggered the discovery
- Business impact
- Evidence quality: anecdotal / data-backed / validated
- Open questions to resolve before the problem is confirmed
- Confidence level: provisional / early-framing / confirmed

## Risks / caveats
- Do not conflate a symptom with a root cause
- Do not accept the first problem framing — probe for the underlying issue
- Avoid jumping to solutions within this skill
