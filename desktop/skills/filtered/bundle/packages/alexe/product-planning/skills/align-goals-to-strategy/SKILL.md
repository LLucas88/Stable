---
name: alexe-align-goals-to-strategy
description: Check and strengthen the alignment between team-level goals (OKRs, KPIs) and company strategy. Use this skill when goals have been set but their connection to strategy is unclear, inconsistent, or contested.
metadata:
  source-name: align-goals-to-strategy
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Align Goals to Strategy

## Purpose
Help teams verify and improve the connection between their goals and the broader company strategy — catching misalignment before it causes wasted effort or missed opportunities.

## Skill type
Conceptual skill

## Use this skill when
- OKRs exist but feel disconnected from what the company says matters
- A team is not sure whether their goals reflect the right strategic bets
- Strategic priorities have shifted and goals haven't been updated
- Cross-team goal conflicts need to be surfaced and resolved

## Do not use this skill when
- Goals haven't been set yet (use set-goals-okrs-kpis first)
- The goal is roadmap prioritization (use build-roadmap-prioritization)

## Required inputs
- Team-level goals (OKRs or KPIs)
- Company or product strategy context

## Optional inputs
- Company-level OKRs
- Strategic bets or priorities
- Adjacent team goals

## Upstream context
Works best when:
- Company strategy and goals are documented
- Team goals are drafted

## If upstream context is missing
Cannot assess alignment without knowing what strategy looks like. Produce a checklist of questions to gather the missing context.

## Downstream handoff
Output can feed:
- build-roadmap-prioritization (aligned goals shape roadmap)
- set-goals-okrs-kpis (alignment gaps feed goal revision)

## Instructions
1. Map each team goal to a company-level strategic priority or company OKR.
2. Identify goals with weak or no strategic mapping.
3. Identify strategy areas that are not reflected in any team goal.
4. Identify goal conflicts with adjacent teams.
5. Assess whether achieving all team goals would meaningfully advance the strategy.
6. Recommend adjustments to improve alignment.

## Output
Provide:
- Goal-to-strategy mapping table
- Goals with strong alignment
- Goals with weak or no alignment (with explanation)
- Strategy areas not covered by current goals
- Cross-team conflicts (if any)
- Recommended goal adjustments
- Alignment confidence level

## Risks / caveats
- Perfect alignment is a fantasy — some local optimization is healthy
- Alignment assessment requires honest input on what strategy actually is, not what's in the deck
- Don't mistake activity alignment for outcome alignment
