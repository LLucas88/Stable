---
name: alexe-ideate-ai-features
description: Generate and frame AI feature ideas with clear value propositions and feasibility considerations. Use this skill when a team wants to explore AI-powered capabilities for their product.
metadata:
  source-name: ideate-ai-features
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Ideate AI Features

## Purpose
Help teams generate, evaluate, and frame AI feature ideas that create real user value and are technically feasible.

## Skill type
Conceptual skill

## Use this skill when
- A team wants to explore how AI can improve their product
- AI feature ideas exist but lack clear value framing
- Leadership is asking "where can we use AI?" and needs a structured answer
- A product area has a clear problem that AI might address

## Do not use this skill when
- The goal is model selection or technical AI architecture (use assess-model-capabilities)
- The goal is workflow design for an already-decided AI feature (use design-human-in-loop-workflow)

## Required inputs
- Product area or problem to address
- User segment and key pain points

## Optional inputs
- Current product capabilities
- Known user pain points from research
- Competitive AI features in the market
- Technical constraints

## Upstream context
Works best when:
- User problem is clearly defined
- Product strategy direction is known
- Some technical feasibility context exists

## If upstream context is missing
Generate a broad ideation set and flag that prioritization requires feasibility validation.

## Downstream handoff
Output can feed:
- assess-model-capabilities (validate feasibility of top ideas)
- design-human-in-loop-workflow (design the execution of chosen AI feature)
- formulate-experiment-hypothesis (test AI feature impact)

## Instructions
1. Map the user problem or inefficiency the AI feature could address.
2. Generate a range of AI feature ideas (breadth first, evaluation second).
3. For each idea: describe the user value, the AI mechanism, and rough feasibility.
4. Evaluate ideas on: user value, feasibility, differentiation, risk.
5. Shortlist top 3 ideas with rationale.
6. Identify validation steps before committing.

## Output
Provide:
- Problem framing for AI intervention
- Idea list with: user value, AI mechanism, feasibility signal
- Evaluation matrix (user value / feasibility / differentiation / risk)
- Top 3 recommended ideas with rationale
- Validation steps (user research, technical spike, prototype)
- Open questions

## Risks / caveats
- "Use AI" is not a feature — the user value must be the starting point
- Feasibility must be checked with engineering before committing
- AI features create user expectations that are hard to roll back — frame carefully
