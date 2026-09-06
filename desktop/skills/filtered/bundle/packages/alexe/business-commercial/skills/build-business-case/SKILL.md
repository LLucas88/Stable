---
name: alexe-build-business-case
description: Develop a structured business case for a product investment including ROI, costs, risks, and expected outcomes. Use this skill when a team needs to justify a product investment to leadership or stakeholders.
metadata:
  source-name: build-business-case
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Business Case

## Purpose
Help teams construct a clear, honest business case for a product investment that covers expected outcomes, costs, risks, and return on investment.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- A product initiative requires significant investment and needs leadership approval
- A team needs to compare multiple investment options
- Budget or headcount decisions require a formal business case
- A product bet needs to be justified with more than intuition

## Do not use this skill when
- The goal is experiment design (use design-experiment-plan)
- The goal is revenue forecasting only (use run-forecasting-scenarios)

## Required inputs
- Investment description and scope
- Business goal the investment serves
- Rough cost estimate (team time, tools, etc.)

## Optional inputs
- Revenue or growth impact estimate
- Current baseline metrics
- Alternative options considered
- Risk factors
- Strategic context

## Upstream context
Works best when:
- Product strategy and goals are defined
- Problem or opportunity is validated

## Downstream handoff
Output can feed:
- align-revenue-strategy
- run-forecasting-scenarios

## Instructions
1. Define the investment: what is being built or changed, at what cost?
2. Define the expected outcomes: quantitative and qualitative.
3. Estimate financial impact: revenue upside, cost reduction, efficiency gain.
4. Identify costs: development, infrastructure, marketing, ongoing maintenance.
5. Calculate ROI or payback period (where data supports it).
6. Identify key risks and mitigation strategies.
7. Compare to alternatives (including status quo / do nothing).

## Output
Provide:
- Investment summary
- Expected outcomes (quantitative and qualitative)
- Financial impact estimate
- Cost breakdown
- ROI or payback period (with assumptions)
- Risk assessment and mitigation
- Alternatives considered
- Recommendation with rationale

## Risks / caveats
- Be honest about uncertainty — overconfident projections destroy trust
- Do not omit the "do nothing" alternative — it resets the baseline expectation
- ROI estimates based on weak assumptions should be labeled as such
