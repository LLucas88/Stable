---
name: alexe-automate-workflow-governance
description: Identify automation opportunities in product workflows and establish governance standards. Use this skill when a team wants to reduce manual overhead in recurring product operations.
metadata:
  source-name: automate-workflow-governance
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Automate Workflow & Governance

## Purpose
Help teams identify where product workflows can be automated and establish governance standards to maintain quality and accountability.

## Skill type
Conceptual skill

## Use this skill when
- Recurring product operations are consuming too much manual time
- Governance is unclear and product quality standards aren't enforced
- A team wants to scale operations without scaling headcount proportionally
- Tooling investments need to be justified and governed

## Do not use this skill when
- The goal is technical infrastructure automation (use technical-product skills)
- The goal is operating cadence design (use design-operating-cadence)

## Required inputs
- Current product workflows (even rough description)
- Areas of manual overhead or bottleneck

## Optional inputs
- Tools available for automation
- Team capacity and skills
- Governance requirements (compliance, security, etc.)

## Upstream context
Works best when:
- Core workflows are mapped
- Tooling stack is defined

## Downstream handoff
Output can feed:
- manage-tooling-documentation (automation tools need documentation)

## Instructions
1. Map recurring product workflows and estimate time investment per workflow.
2. Identify automation candidates: repetitive, rule-based, high-frequency tasks.
3. Assess automation feasibility and value for each candidate.
4. Design governance standards: quality criteria, approval gates, audit trails.
5. Prioritize automation investments by effort vs. value.
6. Define ownership and accountability for automated workflows.

## Output
Provide:
- Workflow inventory with time investment estimates
- Automation candidates with feasibility and value assessment
- Priority list of automation opportunities
- Governance standards for product operations
- Ownership and accountability map
- Risk assessment for workflow automation

## Risks / caveats
- Automating a broken process just creates faster broken outputs — fix process first
- Governance without enforcement is theater — design for accountability
- Over-automation of subjective judgment creates quality problems
