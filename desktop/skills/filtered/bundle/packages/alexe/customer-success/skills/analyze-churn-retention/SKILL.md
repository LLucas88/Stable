---
name: alexe-analyze-churn-retention
description: Analyze churn patterns, identify root causes, and design retention intervention strategies. Use this skill when a team needs to understand why customers are leaving and how to stop it.
metadata:
  source-name: analyze-churn-retention
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze Churn & Retention

## Purpose
Help teams analyze churn patterns, surface root causes, and design targeted retention interventions.

## Skill type
Conceptual skill with analytical components

## Use this skill when
- Churn is elevated or increasing and the team doesn't know why
- A retention problem has been identified and needs diagnosis
- Churn root causes need to be separated (product, onboarding, support, competitive)
- A retention intervention strategy needs to be designed

## Do not use this skill when
- The goal is general retention cohort analysis (use analyze-funnel-retention-cohorts)
- Churn data isn't available (collect data first)

## Required inputs
- Churn rate or trend data
- Product type and customer segment

## Optional inputs
- Exit survey data or churn reasons
- Cohort churn analysis
- Customer success escalation logs
- Competitive context

## Upstream context
Works best when:
- Customer segment is defined
- Retention metrics are tracked

## Downstream handoff
Output can feed:
- monitor-adoption-health
- formulate-experiment-hypothesis (churn hypothesis → experiment)
- identify-problem-opportunity

## Instructions
1. Establish churn baseline and trend (improving, stable, worsening).
2. Segment churn by key dimensions (cohort, segment, product area, tenure).
3. Identify the primary churn reasons from available data.
4. Categorize root causes: product gaps, onboarding failures, competitive loss, support issues.
5. Design targeted interventions per root cause.
6. Define success metrics for retention interventions.

## Output
Provide:
- Churn baseline and trend
- Churn segmentation analysis
- Primary churn reasons with evidence
- Root cause categorization
- Targeted intervention recommendations per root cause
- Success metrics for interventions
- Data gaps and recommended research

## Risks / caveats
- Exit surveys are self-reported and often incomplete — triangulate with behavioral data
- Not all churn is recoverable — identify which segments are worth intervening on
- Addressing churn symptoms without root causes provides only temporary relief
