---
name: alexe-map-user-journey
description: Create a structured user journey map showing steps, touchpoints, emotions, and pain points across a product or service experience. Use this skill when a team needs a shared view of the end-to-end user experience to identify improvement opportunities.
metadata:
  source-name: map-user-journey
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Map User Journey

## Purpose
Help teams create a shared, evidence-based view of the user journey — from first awareness through core tasks and outcomes — that surfaces experience gaps and aligns the team on where to invest.

## Skill type
Conceptual skill

## Use this skill when
- A team lacks a shared view of the end-to-end user experience
- Cross-functional teams (product, design, CS, marketing) need alignment on the journey
- Pain points are suspected but their location in the journey is unclear
- A new product area or segment needs to be mapped before designing solutions

## Do not use this skill when
- The goal is flow-level UX analysis within a specific screen or feature (use assess-experience-quality)
- No user research exists to ground the map (produce a hypothesis map and label it as such)

## Required inputs
- Product or service area to map
- User segment or persona for the journey
- Research data (interviews, support logs, analytics — even partial)

## Optional inputs
- Existing process documentation
- Analytics data by journey stage
- Support ticket themes by journey stage
- Prior journey maps

## Upstream context
Works best when:
- Personas or segments are defined
- User research exists to ground the map

## If upstream context is missing
Produce a hypothesis journey map clearly labeled as assumed, and define what research would validate it.

## Downstream handoff
Output can feed:
- assess-experience-quality (journey identifies which areas to assess)
- identify-problem-opportunity (journey gaps → opportunities)
- design-research-study (journey gaps → research questions)

## Instructions
1. Define the journey scope: start point (trigger) and end point (goal achieved).
2. Break the journey into stages (typically 4–7).
3. For each stage: identify steps, touchpoints (where they interact), thoughts, emotions, and pain points.
4. Label each element as research-backed or assumed.
5. Identify the highest-friction moments across the journey.
6. Identify opportunity areas: where could experience quality significantly improve outcomes?
7. Flag journey stages that cross team or department boundaries.

## Output
Provide:
- Journey map: stages, steps, touchpoints, emotions, pain points
- Evidence quality per stage (assumed / research-backed)
- Top friction moments (priority-ordered)
- Opportunity areas by stage
- Cross-team handoff points
- Open research questions

## Risks / caveats
- Journey maps based purely on internal assumptions embed existing blind spots
- One journey map rarely fits all segments — define the persona clearly
- Journey maps go stale as products change — set a review cadence
