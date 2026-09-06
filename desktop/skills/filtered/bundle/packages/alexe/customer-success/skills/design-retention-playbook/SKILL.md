---
name: alexe-design-retention-playbook
description: Design a retention playbook with interventions for at-risk accounts, expansion opportunities, and churn prevention tactics. Use this skill when a CS team needs structured plays for proactively improving retention.
metadata:
  source-name: design-retention-playbook
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Retention Playbook

## Purpose
Help teams design a structured retention playbook — with defined signals, intervention plays, and escalation paths — that enables CS teams to act proactively rather than reactively.

## Skill type
Conceptual skill

## Use this skill when
- Churn is being discovered too late to intervene
- CS is handling at-risk accounts inconsistently or without a framework
- A new CS team needs a structured approach to retention
- Churn analysis has identified root causes that now need intervention plays

## Do not use this skill when
- Churn root causes haven't been identified yet (use analyze-churn-retention first)
- The goal is health score design (use build-customer-health-score)

## Required inputs
- Churn root causes (from analysis or known patterns)
- Customer segments
- CS team structure and capacity

## Optional inputs
- Health score system (if exists)
- Current CS intervention approaches
- Escalation path to product or engineering
- Success metrics for retention efforts

## Upstream context
Works best when:
- Churn analysis exists
- Health monitoring is in place
- Customer segments are defined

## Downstream handoff
Output can feed:
- monitor-adoption-health (playbook interventions triggered by health signals)
- analyze-churn-retention (playbook effectiveness feeds back into churn analysis)

## Instructions
1. Map churn root causes to intervention types.
2. Design a play for each churn cause: trigger signal, intervention action, escalation path, success criteria.
3. Design an expansion play: signals for expansion readiness and CS motion.
4. Define the intervention timeline: when to intervene relative to renewal or churn signal.
5. Define escalation paths: when CS needs product, engineering, or executive involvement.
6. Define how playbook effectiveness will be measured.

## Output
Provide:
- Retention plays by churn root cause
- Each play: trigger signal, action, owner, timeline, escalation, success criteria
- Expansion play
- Intervention timeline design
- Escalation matrix
- Playbook effectiveness metrics

## Risks / caveats
- Playbooks without triggers are just documents — connect every play to a specific signal
- Over-engineered playbooks don't get used — keep plays simple and executable
- Measure playbook effectiveness, not just churn rate — isolate intervention impact
