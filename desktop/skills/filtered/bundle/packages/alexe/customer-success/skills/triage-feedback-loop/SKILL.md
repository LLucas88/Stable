---
name: alexe-triage-feedback-loop
description: Establish a feedback intake and triage system that routes insights to the right product teams. Use this skill when a team needs a reliable system for processing incoming customer feedback.
metadata:
  source-name: triage-feedback-loop
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Triage Feedback Loop

## Purpose
Help teams design a structured feedback intake and triage system that ensures insights reach the right people and inform product decisions without creating noise.

## Skill type
Conceptual skill

## Use this skill when
- Feedback is arriving from multiple channels without a clear routing process
- Product teams are overwhelmed by raw feedback volume
- High-signal feedback is getting lost in the noise
- CS and support are not effectively passing feedback to product

## Do not use this skill when
- The goal is designing the full VoC program (use run-voc-program)
- The goal is analyzing churn (use analyze-churn-retention)

## Required inputs
- Current feedback sources and volume (rough)
- Teams involved in receiving and acting on feedback

## Optional inputs
- Current triage process (if any)
- CRM or support tooling
- Feedback tagging taxonomy

## Upstream context
Works best when:
- VoC program exists or is being designed
- Product team structure is known

## Downstream handoff
Output can feed:
- synthesize-qualitative-research (triaged feedback is synthesized into insights)
- identify-problem-opportunity (feedback themes become product problems)

## Instructions
1. Map all incoming feedback sources and their volume.
2. Define a tagging taxonomy (product area, type, urgency, segment).
3. Design the triage process: who reviews, how often, what criteria.
4. Define routing rules: which feedback goes to which team.
5. Define escalation for urgent or high-impact feedback.
6. Design the feedback-to-action loop: how does feedback become a product decision?

## Output
Provide:
- Feedback source map with volume estimates
- Tagging taxonomy
- Triage process design (who, how often, criteria)
- Routing rules by team
- Escalation process
- Feedback-to-action loop
- Tooling requirements

## Risks / caveats
- Feedback that is collected but not routed creates the illusion of listening
- Triage must be fast — delayed triage creates backlogs that are never cleared
- Edge case feedback (one angry customer) must be distinguished from systematic signals
