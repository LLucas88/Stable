---
name: alexe-build-customer-health-score
description: Build a customer health score model that predicts churn risk and expansion potential. Use this skill when a team needs a systematic, data-driven way to assess account health across the customer base.
metadata:
  source-name: build-customer-health-score
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Customer Health Score

## Purpose
Help teams design a health score model that reliably predicts account risk and expansion opportunity — moving from reactive account management to proactive intervention.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- CS is managing accounts without a shared, consistent view of health
- Churn is being detected too late for intervention
- A health score exists but doesn't predict actual churn or expansion
- A new customer success program is being built from scratch

## Do not use this skill when
- Health monitoring is the goal but scoring isn't needed yet (use monitor-adoption-health)
- The goal is churn analysis (use analyze-churn-retention)

## Required inputs
- Product and customer type
- Available data signals (usage, logins, support activity, NPS, etc.)

## Optional inputs
- Historical churn and expansion data to validate predictive power
- CS team input on leading indicators they observe
- Account segments or tiers
- Renewal or contract data

## Upstream context
Works best when:
- Adoption health monitoring exists
- Churn patterns are understood
- Event instrumentation covers key behaviors

## Downstream handoff
Output can feed:
- design-retention-playbook (health score triggers retention plays)
- monitor-adoption-health (health score integrates into monitoring)

## Instructions
1. Identify the signals most correlated with retention and churn in this product context.
2. Group signals by category: usage depth, engagement breadth, relationship strength, product outcomes.
3. Assign weights to each signal based on predictive importance.
4. Define scoring tiers: healthy / at-risk / critical.
5. Define the update cadence (real-time, daily, weekly).
6. Validate the model against historical churn if data is available.
7. Define how the score will be surfaced to CS (CRM, dashboard, alerts).

## Output
Provide:
- Signal inventory with predictive rationale
- Signal categories and weighting logic
- Scoring model structure
- Health tier definitions: healthy / at-risk / critical with criteria
- Update cadence
- Validation approach
- Surfacing design (how CS accesses the score)
- Limitations and blind spots of the model

## Risks / caveats
- A health score not grounded in churn data is a guess — validate before relying on it
- Over-complex health scores are ignored — aim for 5–8 inputs max
- A score without a defined action is a number, not a system
