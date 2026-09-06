---
name: alexe-analyze-competitive-landscape
description: Map and analyze the competitive landscape to understand the competitive environment, key players, and strategic implications. Use this skill when a team needs a structured view of who they compete with and how the landscape is evolving.
metadata:
  source-name: analyze-competitive-landscape
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze Competitive Landscape

## Purpose
Help teams build a structured, objective view of the competitive landscape — who the competitors are, how they compete, and what it means for product and strategy.

## Skill type
Conceptual skill

## Use this skill when
- A team lacks a current, structured view of competitors
- The competitive landscape has shifted and needs re-assessment
- A new product area requires competitive analysis before investment
- Positioning or strategy work requires a competitive foundation

## Do not use this skill when
- The goal is producing a differentiation statement (use frame-competitive-differentiation)
- The goal is customer-facing competitive messaging (use develop-positioning-messaging)

## Required inputs
- Product area and target segment
- Known competitors (at least partially)

## Optional inputs
- Recent competitive moves or news
- Win/loss data
- Customer feedback on alternatives
- Industry or market reports

## Upstream context
Works best when:
- Target segment is defined
- Product capabilities are known

## If upstream context is missing
Produce a competitive analysis framework with the dimensions to assess, and flag that competitor identification must precede analysis.

## Downstream handoff
Output can feed:
- frame-competitive-differentiation (landscape → differentiation choices)
- define-strategic-positioning (competitive context informs positioning)
- plan-product-launch (competitive context informs launch strategy)

## Instructions
1. Identify all competitors: direct (same category), indirect (different category, same job), and status quo alternatives.
2. For each competitor: describe their target segment, key value proposition, key capabilities, and apparent strategy.
3. Map competitive dimensions relevant to the target segment.
4. Identify where the market is commoditizing and where differentiation remains possible.
5. Identify competitive threats and opportunities.
6. Assess competitive dynamics: is the market growing, stable, or consolidating?

## Output
Provide:
- Competitor inventory: direct, indirect, status quo
- Competitor profiles (segment, value prop, capabilities, strategy)
- Competitive dimension map
- Areas of commoditization vs. differentiation opportunity
- Competitive threats (short and long term)
- Strategic opportunities surfaced by the analysis
- Confidence level and data currency

## Risks / caveats
- Competitive analysis based only on public marketing materials is shallow — triangulate with customer feedback
- Don't over-index on visible competitors — indirect and emerging competitors often matter more
- The landscape changes; set a review cadence
