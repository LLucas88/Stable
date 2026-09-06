---
name: alexe-develop-persona-segment
description: Build and validate user personas and segment definitions grounded in real research data. Use this skill when a team needs to define who they are building for with enough specificity to guide product decisions.
metadata:
  source-name: develop-persona-segment
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Develop Persona & Segment

## Purpose
Help teams build research-grounded personas and segment definitions that are specific enough to guide product, design, and messaging decisions.

## Skill type
Conceptual skill

## Use this skill when
- The team doesn't have clear segments or has overly broad ones
- Personas exist but are based on assumptions, not research
- A new product area requires understanding a new user type
- Segment prioritization decisions need clearer user definitions

## Do not use this skill when
- The segment is already well-defined and validated
- The goal is quantitative segmentation modeling (use data-analytics skills)

## Required inputs
- Available research data or user observations
- Product area or context

## Optional inputs
- Existing personas or segment definitions
- Behavioral data (usage patterns, feature adoption)
- Demographic or firmographic data (for B2B)

## Upstream context
Works best when:
- Qualitative research has been synthesized
- At least some user interviews or feedback exist

## If upstream context is missing
If no research data exists, produce a hypothesis persona clearly labeled as assumption-based.
List what research is needed to validate it.

## Downstream handoff
Output can feed:
- frame-insight-opportunity
- formulate-experiment-hypothesis (target segment)
- develop-positioning-messaging

## Instructions
1. Identify distinct user types emerging from research data.
2. For each type, define: goals, jobs to be done, pain points, context of use.
3. Add behavioral characteristics if data supports it.
4. Avoid demographic stereotyping — anchor in behaviors and motivations.
5. Assess which segments are most strategically important.
6. Flag which elements are research-backed vs. assumed.

## Output
For each persona / segment:
- Name and archetype
- Primary goals and jobs to be done
- Key pain points
- Context of use
- Behavioral patterns (if data supports)
- Strategic priority for the product
- Evidence quality: assumed / data-informed / validated
- Research gaps

## Risks / caveats
- Do not build personas from demographic assumptions
- A persona based on one interview is a hypothesis, not a finding
- Avoid persona sprawl — 2–4 well-defined segments are better than 10 vague ones
