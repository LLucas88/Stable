---
name: alexe-assess-reliability-scalability
description: Evaluate reliability, scalability, and performance considerations as part of product decision-making. Use this skill when a product decision has implications for system reliability or scale.
metadata:
  source-name: assess-reliability-scalability
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Assess Reliability & Scalability

## Purpose
Help product teams evaluate reliability, scalability, and performance trade-offs when making product decisions, so engineering implications are surfaced before commitments are made.

## Skill type
Conceptual skill

## Use this skill when
- A feature decision has potential reliability or scalability implications
- A product is approaching a scale inflection point
- SLAs or reliability requirements need to be defined for a product area
- Engineering is concerned about scalability and product needs to understand the trade-offs

## Do not use this skill when
- The goal is a purely technical architecture decision (engineering-owned)
- The goal is prioritizing technical debt (use prioritize-architecture-aware)

## Required inputs
- Product feature or decision being evaluated
- Current scale context (users, data volume, transactions — rough)

## Optional inputs
- Engineering reliability concerns
- SLA requirements
- Known system limitations
- Growth projections

## Upstream context
Works best when:
- Engineering has flagged reliability or scalability concerns
- Product decision is being finalized

## Downstream handoff
Output can feed:
- prioritize-architecture-aware
- write-requirements-prd (reliability requirements become product requirements)

## Instructions
1. Identify the reliability and scalability implications of the product decision.
2. Define the reliability requirements (availability, latency, error tolerance) in user-facing terms.
3. Assess the scalability envelope: what volume or load is the decision designed for?
4. Identify trade-offs between reliability investment and feature velocity.
5. Recommend reliability requirements for inclusion in the product spec.
6. Flag risks that require engineering validation.

## Output
Provide:
- Reliability implications of the decision
- User-facing reliability requirements (availability, latency, degradation behavior)
- Scalability scope definition
- Trade-offs between reliability and feature velocity
- Recommended reliability requirements for the spec
- Risks requiring engineering validation

## Risks / caveats
- Reliability requirements set by product must be validated as feasible by engineering
- Users experience reliability failures as product quality failures — treat reliability as a feature
- Premature optimization is a risk — define the scale requirement before over-engineering
