---
name: alexe-make-model-tradeoff-decision
description: Structure the trade-off decision between AI models, providers, or approaches for a given product use case. Use this skill when a team needs to choose between AI options with different capability, cost, latency, and risk profiles.
metadata:
  source-name: make-model-tradeoff-decision
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Make Model Trade-off Decision

## Purpose
Help teams make structured, explicit decisions about which AI model or approach to use for a product feature — balancing capability, cost, latency, risk, and user experience requirements.

## Skill type
Conceptual skill

## Use this skill when
- Multiple model options are available and a choice must be made
- An existing model is underperforming and alternatives need evaluation
- A model upgrade is being considered and impact needs to be assessed
- Cost or latency constraints require trading off capability

## Do not use this skill when
- The goal is assessing a single model's capabilities (use assess-model-capabilities)
- The goal is setting up AI quality monitoring (use evaluate-ai-quality-monitoring)

## Required inputs
- Product use case requiring AI
- Candidate models or approaches to compare (at least 2)
- Key requirements: capability needs, latency budget, cost constraints

## Optional inputs
- Quality evaluation data from initial testing
- User tolerance for latency and errors
- Regulatory or data privacy constraints
- Build vs. buy vs. fine-tune context

## Upstream context
Works best when:
- AI feature value is framed
- Capability requirements are defined

## Downstream handoff
Output can feed:
- design-human-in-loop-workflow (model choice affects oversight needs)
- evaluate-ai-quality-monitoring (selected model → quality criteria)
- write-requirements-prd (decision → technical requirements)

## Instructions
1. Define the capability requirements for the use case (accuracy, format, language support, etc.).
2. Define the non-functional requirements: latency, cost per call, data privacy.
3. Identify candidate models or approaches.
4. Evaluate each candidate against requirements.
5. Identify the key trade-offs (capability vs. cost, capability vs. latency, control vs. convenience).
6. Recommend the best option for the use case with explicit trade-off rationale.
7. Define when the decision should be re-evaluated.

## Output
Provide:
- Use case requirements (functional and non-functional)
- Candidate models/approaches
- Evaluation matrix
- Key trade-offs identified
- Recommendation with rationale
- What the chosen option sacrifices
- Re-evaluation triggers

## Risks / caveats
- Model benchmarks don't always predict real-world performance on your specific use case — test on real data
- Cost at current scale may look trivial but must be modeled at target scale
- Model vendor lock-in is a real risk — consider abstraction layers for high-stakes decisions
