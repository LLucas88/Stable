---
name: alexe-frame-ai-product-value
description: Frame the value of an AI feature in terms of user outcomes and business impact, not model capabilities. Use this skill when a team needs to articulate why an AI feature is worth building and what success looks like.
metadata:
  source-name: frame-ai-product-value
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Frame AI Product Value

## Purpose
Help teams move from "we can do this with AI" to "this AI capability solves a real user problem and creates measurable value" — grounding AI feature decisions in outcomes rather than technology.

## Skill type
Conceptual skill

## Use this skill when
- An AI feature idea needs to be evaluated before investment
- The team is excited about AI capability but unclear on user value
- Stakeholders need a business case for an AI initiative
- An AI feature's value proposition needs to be articulated for users, sales, or leadership

## Do not use this skill when
- The AI capability itself needs to be assessed (use assess-model-capabilities)
- A business case needs full financial modeling (use build-business-case)

## Required inputs
- AI capability or feature idea
- Target user segment

## Optional inputs
- User research on the problem area
- Comparable AI features in the market
- Cost or complexity of building
- Existing baseline (what users do today without AI)

## Upstream context
Works best when:
- Product problem is identified
- User research exists

## Downstream handoff
Output can feed:
- assess-model-capabilities (value frame → capability requirements)
- design-human-in-loop-workflow (value frame informs where human oversight is needed)
- build-business-case (value frame → business case inputs)

## Instructions
1. Identify the user problem the AI capability addresses.
2. Describe what users do today without the AI (current behavior / workaround).
3. Articulate the outcome the AI delivers for users (not the mechanism).
4. Identify the business value: how does the user outcome translate to business metrics?
5. Identify the risks: where could AI create harm, false confidence, or user distrust?
6. Define what success looks like: specific, measurable outcomes.

## Output
Provide:
- User problem statement
- Current user behavior without AI
- AI-delivered outcome (user-centric)
- Business value translation
- Risk identification
- Success definition
- Build / don't build recommendation with rationale

## Risks / caveats
- "AI can do X" is not a value statement — always connect to user problem and outcome
- AI features that impress in demos but create friction in daily use are not valuable
- Identify risks before building, not after — especially for high-stakes decisions
