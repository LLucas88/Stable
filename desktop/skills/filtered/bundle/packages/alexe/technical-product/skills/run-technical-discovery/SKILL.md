---
name: alexe-run-technical-discovery
description: Structure a technical discovery process to surface feasibility constraints, architectural options, and engineering unknowns before committing to a product initiative. Use this skill when a product bet has significant technical uncertainty.
metadata:
  source-name: run-technical-discovery
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Technical Discovery

## Purpose
Help teams run a time-boxed technical discovery process that surfaces feasibility constraints, explores architectural options, and resolves engineering unknowns — before committing to delivery.

## Skill type
Conceptual skill

## Use this skill when
- A product initiative has significant technical uncertainty that could invalidate the plan
- Engineering can't provide reliable estimates without exploration time
- A novel approach (new AI capability, new integration, new platform feature) needs to be validated
- An architectural decision needs structured exploration before a path is chosen

## Do not use this skill when
- Technical complexity is low and discovery isn't needed
- The goal is sprint planning for known work (use plan-delivery-collaboration)

## Required inputs
- Product initiative with technical uncertainty
- Key technical questions that must be resolved

## Optional inputs
- Existing system architecture
- Technical constraints (data residency, security, performance)
- Engineering team input on unknowns
- Desired time box for discovery

## Upstream context
Works best when:
- Product initiative is defined (problem and goals)
- Engineering has flagged unknowns

## Downstream handoff
Output can feed:
- write-requirements-prd (discovery findings → requirements)
- plan-delivery-collaboration (discovery outputs enable reliable estimates)
- manage-technical-debt-tradeoffs (discovery surfaces debt implications)

## Instructions
1. Define the key technical questions to resolve in discovery.
2. Agree on the time box (typically 1–2 sprints).
3. Define the definition of done: what does discovery need to produce to unblock planning?
4. Identify spike tasks or prototype experiments needed to answer each question.
5. Define how findings will be documented and shared.
6. Plan a discovery readout to align product and engineering on implications.

## Output
Provide:
- Technical questions to resolve
- Discovery time box
- Definition of done
- Spike tasks or experiments per question
- Documentation and sharing plan
- Discovery readout format
- Decision points that discovery will unlock

## Risks / caveats
- Open-ended discovery without time boxing turns into research that delays delivery indefinitely
- Discovery output must be in a form product can use — not just internal engineering notes
- "We need more discovery" is sometimes avoidance — distinguish genuine unknowns from lack of confidence
