---
name: alexe-prioritize-strategic-bets
description: Evaluate and prioritize strategic bets — high-uncertainty, high-potential initiatives — against business goals and risk tolerance. Use this skill when a team needs to decide which big bets to pursue, pause, or stop.
metadata:
  source-name: prioritize-strategic-bets
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Prioritize Strategic Bets

## Purpose
Help teams make structured decisions about which strategic bets to invest in, sequence, or deprioritize — with explicit trade-off reasoning and risk awareness.

## Skill type
Conceptual skill

## Use this skill when
- Multiple large initiatives are competing for limited resources
- The team is unsure which bets align with strategy and which are distractions
- A planning cycle requires deciding between core investments and exploratory bets
- Stakeholders disagree on strategic priorities and need a structured framework

## Do not use this skill when
- Feature-level prioritization is the goal (use apply-prioritization-framework)
- The goal is roadmap sequencing within a known portfolio (use build-portfolio-roadmap-strategy)

## Required inputs
- List of strategic bets or initiatives under consideration
- Business goals or strategic objectives
- Rough resource constraints

## Optional inputs
- PMF assessment per bet
- Competitive context
- Risk tolerance framing from leadership
- Time horizon

## Upstream context
Works best when:
- Vision and strategy are defined
- Portfolio map exists

## If upstream context is missing
Cannot prioritize bets without knowing what the strategy is. Produce a framing of the question and list what must be clarified first.

## Downstream handoff
Output can feed:
- build-portfolio-roadmap-strategy (prioritized bets shape portfolio)
- build-business-case (each funded bet needs a business case)

## Instructions
1. List all bets and describe each in terms of: goal, hypothesis, investment required, potential payoff.
2. Assess each bet on: strategic alignment, potential value, probability of success, reversibility.
3. Classify each bet: core (high confidence), growth (medium confidence), explore (high uncertainty).
4. Identify the right portfolio balance for the current stage and risk tolerance.
5. Recommend which bets to fund, pause, or stop — with rationale.
6. Identify key decisions or milestones that should trigger a re-evaluation.

## Output
Provide:
- Bet inventory with: goal, hypothesis, investment, payoff potential
- Assessment matrix: alignment / value / confidence / reversibility
- Portfolio classification per bet
- Prioritization recommendation with rationale
- What is being deprioritized and why
- Review triggers and milestones

## Risks / caveats
- Sunk cost bias distorts bet prioritization — evaluate forward-looking, not backward-looking
- Explore bets must have defined kill criteria, or they become zombie projects
- A portfolio with only safe bets doesn't generate strategic growth
