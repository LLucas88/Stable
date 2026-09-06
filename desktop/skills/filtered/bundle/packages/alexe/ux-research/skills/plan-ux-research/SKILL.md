---
name: alexe-plan-ux-research
description: Define a UX research plan including methods, participants, goals, and timeline. Use this skill when a team needs to structure a research effort before executing it.
metadata:
  source-name: plan-ux-research
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Plan UX Research

## Purpose
Help teams design a structured UX research plan that answers the right questions with the right methods.

## Skill type
Conceptual skill

## Use this skill when
- A team needs to run user research but hasn't structured the plan yet
- Research goals are unclear or too broad
- The team is debating which research method to use
- A new product area requires understanding user behavior and needs

## Do not use this skill when
- Research has already been collected and needs synthesis (use synthesize-qualitative-research)
- The goal is usability testing of an existing design (use run-usability-testing)

## Required inputs
- Research goal or question
- Product area or context

## Optional inputs
- Target segment
- Available timeline and resources
- Prior research findings
- Hypotheses to validate

## Upstream context
Works best when:
- Product problem or opportunity is identified
- Target segment is known

## If upstream context is missing
If the research question is too vague, produce a discovery research plan and flag that it will need to be narrowed.

## Downstream handoff
Output can feed:
- synthesize-qualitative-research (process findings after research)
- develop-persona-segment (if segment research is conducted)
- run-usability-testing (if usability is the research goal)

## Instructions
1. Clarify the research question (what decision will this research inform?).
2. Select the appropriate method: interviews, surveys, usability testing, diary study, contextual inquiry, etc.
3. Define participant criteria and number.
4. Design discussion guide or research instrument outline.
5. Set a timeline and logistics.
6. Define how findings will be analyzed and shared.

## Output
Provide:
- Research question(s)
- Selected method and rationale
- Participant criteria and sample size
- Discussion guide outline or research instrument outline
- Timeline
- Analysis and sharing plan
- Open questions or risks

## Risks / caveats
- Research without a clear question produces unfocused findings
- Never select a method before defining the question
- Small samples (5–8 interviews) are sufficient for qualitative patterns, not statistical claims
