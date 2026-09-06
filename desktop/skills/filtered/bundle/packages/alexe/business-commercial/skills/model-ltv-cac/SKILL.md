---
name: alexe-model-ltv-cac
description: Model customer lifetime value (LTV) and customer acquisition cost (CAC) to assess unit economics and growth sustainability. Use this skill when a team needs to understand whether the business model is economically sustainable.
metadata:
  source-name: model-ltv-cac
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Model LTV:CAC

## Purpose
Help teams calculate, interpret, and improve the LTV:CAC ratio — the foundational unit economics metric that determines whether growth is creating or destroying value.

## Skill type
Conceptual skill with calculation-aware components

## Use this skill when
- The team doesn't know if growth is economically sustainable
- LTV or CAC metrics exist but aren't being compared or interpreted correctly
- A pricing or acquisition model change needs impact assessment on LTV:CAC
- An investor or leadership asks about unit economics

## Do not use this skill when
- The goal is general revenue forecasting (use run-forecasting-scenarios)
- The goal is pricing structure (use support-pricing-packaging)

## Required inputs
- Cohort-level gross profit data over time (preferred), OR:
  - Average revenue per customer (monthly or annual)
  - Gross margin
  - Churn rate (for the simplified formula — subscription models only)
- CAC estimate (total S&M spend and new customers acquired)

## Optional inputs
- CAC breakdown by channel
- LTV by segment or cohort
- Payback period data
- Industry benchmarks
- Early cohort data for LTV prediction

## Upstream context
Works best when:
- Revenue model is defined
- Cohort-level data or churn data exists
- Gross margin is known (not assumed)

## Downstream handoff
Output can feed:
- build-business-case (LTV:CAC is a core business case input)
- align-revenue-strategy (unit economics informs revenue strategy)
- strategize-channel-campaigns (CAC by channel feeds channel strategy)

## Instructions
1. Determine available data: cohort-level gross profit data, or aggregate metrics (ARPU, churn, margin).
2. Calculate LTV using the appropriate method:
   - **Cohort method (preferred):** calculate cumulative gross profit per user over time from cohort data. Present LTV at specific time horizons (month 6, month 12, etc.).
   - **Simplified formula (subscription models with stable churn only):** (ARPU × Gross Margin) ÷ Churn Rate. State all assumptions. Flag that this is an estimate.
3. Calculate CAC: Total Sales and Marketing Spend ÷ New Customers Acquired.
4. Calculate LTV:CAC ratio and payback period. Always specify the LTV time horizon used.
5. Break down CAC by channel if data allows.
6. Assess the ratio against benchmarks (typically: >3x LTV:CAC is healthy; <12 month payback is strong).
7. Identify the biggest levers to improve the ratio.
8. If early cohort data is available, describe how to predict long-term LTV from short-term signals.

## Output
Provide:
- LTV calculation with method stated (cohort or simplified), inputs, and time horizon
- CAC calculation with inputs
- LTV:CAC ratio and payback period
- Benchmark comparison
- Ratio interpretation (healthy / marginal / unsustainable)
- CAC by channel (if available)
- Top improvement levers with estimated impact
- Key assumptions and their sensitivity
- Recommendation for which data to collect if inputs are incomplete

## Risks / caveats
- LTV based on revenue instead of gross profit overstates customer value — always use gross profit
- The simplified formula (ARPU × Margin / Churn) assumes constant churn, which rarely holds — prefer cohort-based LTV when data is available
- "Lifetime = 1 / Churn" is a rough estimate, not a measured quantity — do not treat it as precise
- CAC must include all S&M costs, not just paid advertising
- LTV:CAC above 10x sometimes signals underinvestment in growth, not just efficiency
- LTV without a specified time horizon is meaningless — always state the period
