---
name: alexe-define-product-vision
description: Turn organizational goals and user insights into a clear product vision and mission statement. Use this skill when a team needs to articulate where the product is going and why it exists.
metadata:
  source-name: define-product-vision
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Define Product Vision

## Purpose
Help teams articulate a clear, actionable product vision and mission that aligns stakeholders and guides long-term decisions.

## Skill type
Conceptual skill

## Use this skill when
- A product or team lacks a clear vision statement
- The existing vision is vague, outdated, or misaligned with strategy
- The team is starting a new product or major pivot
- Leadership needs a unifying narrative for the product direction

## Do not use this skill when
- The team already has a strong, agreed-upon vision
- The user needs roadmap-level prioritization (use build-portfolio-roadmap-strategy)
- The user needs competitive positioning (use frame-competitive-differentiation)

## Required inputs
- Product area or domain
- Target user or customer segment
- Business goal or organizational context

## Optional inputs
- Existing mission/vision drafts
- Key user problems or insights
- Company-level strategy
- Competitive landscape notes
- Time horizon for the vision

## Upstream context
Works best when at least some of the following exist:
- Known target user segment
- Known product area
- Business or organizational goal

## If upstream context is missing
If no product area, segment, or goal is provided, do not invent a confident vision.
Produce a provisional draft and explicitly list what must be confirmed before the vision can be finalized.

## Downstream handoff
Output from this skill can feed:
- assess-product-market-fit
- build-portfolio-roadmap-strategy
- frame-competitive-differentiation

A good handoff includes:
- Vision statement
- Mission statement (optional)
- Target user and problem
- Strategic time horizon
- Open questions

## Instructions
1. Identify the target user and core problem being solved.
2. Identify the desired long-term outcome for users and the business.
3. Identify the strategic time horizon (1-year, 3-year, 5-year+).
4. Draft a vision statement: aspirational, user-centric, not tied to specific features.
5. Draft a mission statement: what the product does and for whom today.
6. Check for clarity, specificity, and differentiation.
7. List what is still missing or needs validation.

## Output
Provide:
- Vision statement
- Mission statement
- Target segment
- Core user problem addressed
- Strategic time horizon
- Confidence level: provisional / context-informed / ready-to-align
- Missing context or open questions

## Risks / caveats
- Do not write a vision that describes features, not outcomes
- Do not present the vision as final if key strategic context is missing
- Avoid generic statements that could apply to any product
