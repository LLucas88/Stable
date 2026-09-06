---
name: alexe-write-product-strategy-doc
description: Write a clear, concise product strategy document that aligns teams on direction, priorities, and trade-offs. Use this skill when a team needs a written strategy artifact that can serve as a decision-making anchor.
metadata:
  source-name: write-product-strategy-doc
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Write Product Strategy Doc

## Purpose
Help teams produce a written product strategy document that articulates direction clearly enough to align teams, guide prioritization, and reduce repeated strategic debates.

## Skill type
Conceptual skill

## Use this skill when
- A team lacks a written product strategy and relies on oral tradition
- Strategic debates keep recurring because direction isn't documented
- A new leader or team member needs to understand product direction quickly
- A planning cycle requires a strategy anchor document

## Do not use this skill when
- The goal is executive presentation (use build-executive-narrative)
- The goal is roadmap creation (use build-roadmap-prioritization)

## Required inputs
- Product area or scope
- Strategic direction, goals, and key decisions to document

## Optional inputs
- Existing strategy artifacts
- OKRs or portfolio decisions
- Competitive context
- Product-market fit assessment

## Upstream context
Works best when:
- Vision and positioning are defined
- Strategic bets are prioritized
- Goals are set

## Downstream handoff
Output can feed:
- build-executive-narrative (strategy doc → executive narrative)
- communicate-decisions-tradeoffs (strategy doc surfaces decisions to communicate)
- build-roadmap-prioritization (strategy doc anchors roadmap)

## Instructions
1. Define the scope: what product area or initiative is this strategy for?
2. Write a problem and opportunity statement.
3. Define the strategic approach: what choices are being made and why?
4. Articulate what's in scope vs. out of scope (explicit trade-offs).
5. Define success: what does winning look like in 12 months?
6. Anticipate objections and address them.
7. Keep it to 2–4 pages — strategy docs that aren't read aren't strategies.

## Output
Provide:
- Context: product area, current state, opportunity
- Strategic approach and key choices
- Explicit trade-offs and what's out of scope
- Success definition (12-month horizon)
- Key risks and mitigations
- Open decisions requiring alignment
- Document length: 2–4 pages max

## Risks / caveats
- Strategy docs that describe everything are strategy docs about nothing — be specific about trade-offs
- "We will do X and Y and Z" is not strategy — strategy requires saying no to things
- A strategy doc with no clear author has no owner — assign responsibility
