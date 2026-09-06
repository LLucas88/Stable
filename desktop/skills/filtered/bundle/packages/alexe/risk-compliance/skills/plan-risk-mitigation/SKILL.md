---
name: alexe-plan-risk-mitigation
description: Identify product risks and develop mitigation plans with owners, triggers, and contingencies. Use this skill when a team needs to proactively manage risks for a product initiative.
metadata:
  source-name: plan-risk-mitigation
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Plan Risk Mitigation

## Purpose
Help teams identify, assess, and develop mitigation plans for risks that could affect a product initiative's success.

## Skill type
Conceptual skill

## Use this skill when
- A product initiative has identifiable risks that need to be managed
- A launch or experiment is approaching and risk planning is missing
- A stakeholder review requires risk documentation
- An audit of risk coverage across a product area is needed

## Do not use this skill when
- The goal is privacy/security risk specifically (use assess-privacy-security-regulatory)
- The goal is ethical risk (use apply-ethical-decision-framework)

## Required inputs
- Product initiative or decision being assessed
- Context about the initiative (scope, timeline, dependencies)

## Optional inputs
- Known risks or concerns
- Stakeholder inputs
- Prior initiative post-mortems
- Technical or business constraints

## Upstream context
Works best when:
- Initiative scope is defined
- Privacy, security, and ethical assessments have been done

## Downstream handoff
Output can feed:
- plan-delivery-collaboration (risks feed into delivery planning)
- plan-product-launch (launch risks need mitigation plans)

## Instructions
1. Identify all risk categories: technical, market, execution, legal/compliance, ethical, organizational.
2. For each risk: describe, assess likelihood and impact, and classify severity.
3. Define the trigger: what event indicates the risk is materializing?
4. Define the mitigation strategy (reduce, accept, transfer, avoid).
5. Assign an owner for each risk.
6. Define the contingency plan if mitigation fails.

## Output
Provide:
- Risk inventory by category
- Risk register: risk / likelihood / impact / severity / trigger / mitigation / owner / contingency
- Priority risk list (highest severity first)
- Monitoring plan (how risks are tracked over time)
- Escalation triggers

## Risks / caveats
- Risk planning that produces a document no one reads is theater
- Assign real owners — shared ownership means no ownership
- Risk severity must combine both likelihood and impact — don't overweight low-probability disasters
