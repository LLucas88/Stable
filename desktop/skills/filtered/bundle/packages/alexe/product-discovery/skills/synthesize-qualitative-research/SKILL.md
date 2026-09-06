---
name: alexe-synthesize-qualitative-research
description: Synthesize user interviews, JTBD analysis, and qualitative data into actionable product insights. Use this skill when a team has raw qualitative data and needs structured insights.
metadata:
  source-name: synthesize-qualitative-research
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Synthesize Qualitative Research

## Purpose
Transform raw qualitative data (interview notes, JTBD maps, survey responses, support logs) into structured, actionable product insights.

## Skill type
Conceptual skill

## Use this skill when
- Interview notes or research data need to be organized and synthesized
- The team has collected feedback but can't see the pattern
- A JTBD exercise needs to be turned into product implications
- Support tickets, reviews, or NPS comments need to be analyzed for themes

## Do not use this skill when
- No qualitative data has been collected yet (first run identify-problem-opportunity)
- The goal is quantitative analysis (use data-analytics skills)

## Required inputs
- Raw qualitative data (interview notes, quotes, feedback, JTBD statements)

## Optional inputs
- Research questions the team was trying to answer
- User segment context
- Hypotheses being tested

## Upstream context
Works best when:
- Research questions are defined
- Target segment is known

## If upstream context is missing
Synthesize what exists but explicitly flag that without research questions, themes may not map to actionable decisions.

## Downstream handoff
Output can feed:
- develop-persona-segment
- frame-insight-opportunity
- formulate-experiment-hypothesis

## Instructions
1. Identify the research questions being answered (or infer from data).
2. Extract key themes and patterns from the raw data.
3. Identify the most frequently mentioned pain points, jobs, and motivations.
4. Separate observations (what users said/did) from interpretations (what it means).
5. Flag outliers and edge cases separately.
6. Summarize top 3–5 actionable insights.
7. Identify gaps: what was not answered by the research.

## Output
Provide:
- Research questions (stated or inferred)
- Key themes (with supporting evidence)
- Top insights (3–5, actionable)
- JTBD summary (if JTBD data was provided)
- Outliers and edge cases
- Research gaps
- Confidence level: thin-data / moderate / well-supported

## Risks / caveats
- Do not generalize from 1–2 interviews
- Distinguish between what users say and what they do when data conflicts
- Clearly mark interpretations vs. direct observations
