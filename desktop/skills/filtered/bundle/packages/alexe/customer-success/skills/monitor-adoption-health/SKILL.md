---
name: alexe-monitor-adoption-health
description: Define and monitor adoption health metrics to identify at-risk accounts and expansion opportunities. Use this skill when a team needs to systematically track whether customers are successfully adopting and getting value from the product.
metadata:
  source-name: monitor-adoption-health
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Monitor Adoption Health

## Purpose
Help teams define adoption health metrics and build a monitoring system that surfaces at-risk accounts and expansion opportunities.

## Skill type
Conceptual skill

## Use this skill when
- The team doesn't know which accounts are healthy vs. at-risk
- Churn is reactive rather than proactive (teams find out after customers leave)
- Expansion opportunities are not being surfaced systematically
- A new product or feature needs adoption monitoring from launch

## Do not use this skill when
- The goal is churn analysis after the fact (use analyze-churn-retention)
- The goal is broad product metrics design (use design-product-metrics)

## Required inputs
- Product type and customer segment
- Key product value behaviors (what does a successful customer do?)

## Optional inputs
- Current usage data
- Account tiers or segments
- Existing health score methodology
- CS team capacity and workflow

## Upstream context
Works best when:
- Customer segments are defined
- Core value metrics are known

## Downstream handoff
Output can feed:
- analyze-churn-retention (at-risk signals feed churn analysis)
- plan-lifecycle-engagement (health signals trigger lifecycle interventions)

## Instructions
1. Define what "healthy adoption" looks like for this product (key behaviors and milestones).
2. Define at-risk signals (absence of value behaviors, declining usage, support escalations).
3. Design a health score model: inputs, weighting, tiers.
4. Define monitoring cadence and alerting thresholds.
5. Design the intervention workflow when at-risk accounts are identified.
6. Identify expansion signals (high usage, new user invitations, feature depth).

## Output
Provide:
- Definition of healthy adoption (behaviors and milestones)
- At-risk signal list
- Health score model design (inputs, weighting, tiers)
- Monitoring cadence and alerting thresholds
- Intervention workflow for at-risk accounts
- Expansion signal identification
- Data requirements

## Risks / caveats
- Health scores are only as good as their input data — instrument before scoring
- A health score not acted on is a dashboard decoration
- Define health per segment — one-size-fits-all health scores miss segment variation
