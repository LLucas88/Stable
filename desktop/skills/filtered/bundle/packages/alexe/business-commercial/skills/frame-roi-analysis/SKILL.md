---
name: alexe-frame-roi-analysis
description: Frame a return-on-investment analysis for a product initiative to support investment decisions. Use this skill when a team needs to quantify the expected return on a product investment relative to its cost.
metadata:
  source-name: frame-roi-analysis
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Frame ROI Analysis

## Purpose
Help teams build a clear, honest ROI frame for a product investment that can support decision-making and stakeholder communication — without false precision.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- A product investment needs to be justified with business impact
- Leadership is asking "what's the ROI?" for a feature, initiative, or platform investment
- Multiple investments need to be compared on expected return
- A business case needs a financial framing

## Do not use this skill when
- The goal is full financial modeling with detailed P&L (use build-business-case)
- The goal is unit economics analysis (use analyze-unit-economics)

## Required inputs
- Investment description (what is being built or bought)
- Estimated investment cost (time, money)
- Expected benefit (what business outcome will this produce)

## Optional inputs
- Baseline data (current state without the investment)
- Timeline to value
- Risk factors that could reduce return
- Comparable investments for benchmarking

## Upstream context
Works best when:
- Business goals are defined
- Some baseline metrics exist

## Downstream handoff
Output can feed:
- build-business-case (ROI frame → business case)
- prioritize-strategic-bets (ROI comparison → bet prioritization)
- align-revenue-strategy (ROI framing → revenue alignment)

## Instructions
1. Define the investment: what is being spent? (time, money, opportunity cost)
2. Define the expected return: what business outcomes will this produce?
3. Quantify the return using available data or conservative estimates.
4. Calculate simple ROI: (return - cost) / cost, or payback period.
5. Build a range: conservative / base / optimistic.
6. Identify key assumptions that drive the return.
7. Flag the biggest uncertainties.

## Output
Provide:
- Investment definition and cost
- Expected return and how it's quantified
- ROI calculation (range: conservative / base / optimistic)
- Key assumptions driving the return
- Payback period or break-even timeline
- Top uncertainties and how to reduce them
- Recommendation: invest / conditional / don't invest

## Risks / caveats
- False precision in ROI calculations is worse than ranges with honest uncertainty
- Opportunity costs are real costs — include what you're not building
- Benefits must be traceable to measurable business outcomes, not activity metrics
