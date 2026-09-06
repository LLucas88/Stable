---
name: alexe-design-metric-alert-system
description: Design a metric alerting system with thresholds, alert logic, and escalation paths so teams can detect performance issues before they become serious. Use this skill when a product needs proactive monitoring rather than reactive discovery.
metadata:
  source-name: design-metric-alert-system
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Metric Alert System

## Purpose
Help teams design an alerting system that surfaces meaningful metric changes quickly, minimizes noise from false positives, and connects alerts to clear escalation and response paths.

## Skill type
Conceptual skill

## Use this skill when
- Critical metrics are only discovered to be off-track days or weeks later
- Too many alerts are triggering false positives and being ignored
- A new product area needs proactive monitoring from launch
- An SLA or reliability commitment requires alert coverage

## Do not use this skill when
- Metrics haven't been defined yet (use design-product-metrics first)
- The goal is investigating an alert that has already fired (use detect-performance-signals)

## Required inputs
- Metrics to alert on
- Normal ranges or baselines for each metric

## Optional inputs
- Historical metric variance data
- SLA or reliability commitments
- Tooling available (Grafana, Datadog, analytics platform alerts)
- On-call or response team structure

## Upstream context
Works best when:
- Metrics framework is defined
- Dashboard is built and baselines are known

## Downstream handoff
Output can feed:
- detect-performance-signals (alerts trigger signal investigation)
- build-decision-dashboard (alert thresholds visible in dashboard context)

## Instructions
1. Select the metrics that warrant alerting (not all metrics need alerts — focus on critical ones).
2. Define alert type per metric: threshold-based, anomaly-based, or rate-of-change.
3. Define thresholds: warning level and critical level.
4. Define alert frequency: avoid alert storms for correlated events.
5. Define escalation paths: who gets notified at warning vs. critical, and how.
6. Define the response protocol: what should the on-call or owner do when an alert fires?
7. Plan for alert maintenance: when to adjust thresholds as baselines change.

## Output
Provide:
- Alert inventory: metric, alert type, warning threshold, critical threshold
- Alert logic and frequency rules
- Escalation paths per severity level
- Response protocol per alert type
- False positive mitigation approach
- Alert maintenance plan

## Risks / caveats
- Alert fatigue from too many alerts causes all alerts to be ignored
- Thresholds set without understanding normal variance will fire constantly
- Every alert must have a defined owner and response — orphaned alerts are useless
