---
name: alexe-create-sales-battlecard
description: Create a competitive sales battlecard that helps sales handle competitor objections and highlight differentiators in real conversations. Use this skill when sales teams face competitive situations and need quick, reliable guidance.
metadata:
  source-name: create-sales-battlecard
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Create Sales Battlecard

## Purpose
Help teams produce concise, accurate battlecards that equip sales reps to handle competitive situations confidently and consistently.

## Skill type
Conceptual skill

## Use this skill when
- Sales is losing deals to a specific competitor without knowing how to respond
- A new competitor has entered the market and sales is unprepared
- Competitive messaging is inconsistent across the sales team
- A sales enablement refresh is needed before a launch or campaign

## Do not use this skill when
- The goal is brand positioning (use develop-positioning-messaging)
- The goal is full competitive analysis (use analyze-competitive-landscape)

## Required inputs
- Competitor to create a battlecard for
- Product capabilities and differentiators
- Common competitive objections heard in sales

## Optional inputs
- Win/loss data against this competitor
- Customer quotes about choosing your product over the competitor
- Pricing comparison
- Known competitor weaknesses or gaps

## Upstream context
Works best when:
- Competitive landscape analysis exists
- Differentiation is defined
- Value proposition is clear

## Downstream handoff
Output can feed:
- enable-sales-cs (battlecard is part of enablement package)
- plan-product-launch (battlecards prepared as part of launch readiness)

## Instructions
1. Identify the competitor and their primary value proposition.
2. List the 3–5 most common objections sales hears when competing against this player.
3. Write a response to each objection: factual, confident, and non-disparaging.
4. Identify your 3 strongest win reasons against this competitor.
5. Identify 1–2 honest areas where the competitor is stronger (and how to handle them).
6. Add qualifying questions to identify competitive deals early.
7. Add proof points: customer quotes, case studies, or data.

## Output
Provide:
- Competitor overview (1 sentence)
- Common objections and responses (3–5)
- Win reasons against this competitor (3)
- Where the competitor is stronger and how to respond
- Qualifying questions for competitive deals
- Proof points (quotes, data, case studies)
- Phrases to avoid (claims that are hard to defend)

## Risks / caveats
- Battlecards must be factually accurate — false claims damage credibility
- Update battlecards when the competitor releases a major update
- Disparaging the competitor is a red flag for buyers — keep it objective
