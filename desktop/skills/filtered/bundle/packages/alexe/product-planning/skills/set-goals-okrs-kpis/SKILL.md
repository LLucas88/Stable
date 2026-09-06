---
name: alexe-set-goals-okrs-kpis
description: Help teams define and structure goals using OKRs, KPIs, and related frameworks. Use this skill when a team needs to set clear, measurable goals aligned with business strategy.
metadata:
  source-name: set-goals-okrs-kpis
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Set Goals: OKRs & KPIs

## Purpose
Help teams define well-structured, measurable goals that connect product work to business outcomes.

## Skill type
Conceptual skill

## Use this skill when
- A team is starting a planning cycle and needs to define goals
- Existing OKRs are vague, unmeasurable, or disconnected from strategy
- KPIs are undefined or not connected to product decisions
- There is confusion between outputs (features shipped) and outcomes (user/business impact)

## Do not use this skill when
- Goals are already defined and the team needs roadmap prioritization
- The goal is experiment design (use experimentation skills)

## Required inputs
- Business or product area
- Strategic priority or direction (even rough)

## Optional inputs
- Company-level OKRs
- Current metrics baseline
- Time horizon (quarter, half-year)
- Prior OKR performance

## Upstream context
Works best when:
- Product vision and strategy are defined
- Product-market fit assessment exists

## If upstream context is missing
Produce provisional OKR structure. Flag that without strategic direction, goals may not align with the business.

## Downstream handoff
Output can feed:
- build-roadmap-prioritization
- define-success-metrics (experiment metrics derived from KPIs)
- build-decision-dashboard

## Instructions
1. Identify the strategic priority being addressed.
2. Define 1–3 Objectives: qualitative, inspiring, directional.
3. For each Objective, define 2–4 Key Results: specific, measurable, time-bound.
4. Separate leading indicators (KRs) from lagging outcomes.
5. Identify 3–5 KPIs for ongoing product health monitoring.
6. Confirm that KRs are outcomes, not output metrics.
7. Flag dependencies and risks to achieving the goals.

## Output
Provide:
- Objectives (1–3)
- Key Results per Objective (2–4 each)
- KPIs for ongoing monitoring
- Baseline values where known
- Assumptions behind each KR
- Risks to goal achievement
- Confidence level: provisional / context-informed / ready-to-commit

## Risks / caveats
- Do not write KRs that measure activity instead of outcomes
- Do not set too many OKRs — focus is more important than coverage
- OKRs should stretch but remain achievable; flag if targets are arbitrary
