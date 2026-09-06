---
name: alexe-run-sensitivity-analysis
description: Identify which assumptions in a forecast or business case have the most impact on the outcome. Use this skill when a team needs to understand the risk profile of a plan and which variables deserve the most attention.
metadata:
  source-name: run-sensitivity-analysis
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Sensitivity Analysis

## Purpose
Help teams identify which assumptions in a forecast or business case drive the most variance in the outcome — so attention, validation, and risk mitigation can be focused on what matters most.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- A forecast or business case has been built and the team wants to understand its risk profile
- Multiple assumptions exist and the team doesn't know which are most critical
- Leadership asks "what's the downside if X doesn't happen?"
- A plan needs to be stress-tested before presenting to stakeholders

## Do not use this skill when
- No forecast or model exists yet (use run-forecasting-scenarios first)
- The goal is full scenario planning (use run-forecasting-scenarios)

## Required inputs
- Forecast or business case with explicit assumptions
- Outcome metric to evaluate (revenue, growth, ROI, payback)

## Optional inputs
- Historical variance data for key assumptions
- External benchmarks for assumption ranges
- Decision threshold (what outcome would change the decision?)

## Upstream context
Works best when:
- A forecast or business case exists
- Key assumptions are documented

## Downstream handoff
Output can feed:
- build-business-case (sensitivity findings → risk section)
- run-forecasting-scenarios (key variables → scenario inputs)
- plan-risk-mitigation (high-sensitivity assumptions → risks)

## Instructions
1. List all key assumptions in the forecast or plan.
2. For each assumption, define a realistic range: pessimistic / base / optimistic.
3. Vary each assumption one at a time while holding others constant.
4. Measure the impact on the outcome metric for each change.
5. Rank assumptions by impact: which cause the biggest outcome variance?
6. Identify the assumption combination that produces the worst realistic case.
7. Recommend which assumptions to validate most urgently.

## Output
Provide:
- Assumption inventory with ranges
- Impact on outcome metric per assumption (% change)
- Sensitivity ranking (highest to lowest impact)
- Worst realistic case analysis
- Decision threshold check (does the plan still make sense in the worst case?)
- Validation priority recommendations

## Risks / caveats
- Vary one assumption at a time to isolate effects — combined changes mask individual sensitivities
- Ranges must be realistic — using extreme ranges produces useless results
- High sensitivity to one assumption means that assumption must be validated before investing
