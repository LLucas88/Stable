---
name: alexe-conduct-ai-audit
description: Conduct a structured audit of an AI system or feature against responsible AI standards. Use this skill when a deployed AI feature needs to be evaluated for fairness, safety, transparency, and accountability.
metadata:
  source-name: conduct-ai-audit
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Conduct AI Audit

## Purpose
Help teams run a structured audit of a deployed or near-deployed AI system to evaluate compliance with responsible AI standards and identify gaps that need to be addressed.

## Skill type
Conceptual skill

## Use this skill when
- A deployed AI feature needs to be reviewed against responsible AI standards
- A governance process requires periodic AI audits
- An AI feature has been flagged for bias, fairness, or safety concerns
- Regulatory or legal requirements mandate an AI audit
- An AI feature is being scaled and needs a formal readiness review

## Do not use this skill when
- AI governance standards haven't been defined yet (use govern-responsible-ai first)
- The goal is ongoing quality monitoring (use evaluate-ai-quality-monitoring)

## Required inputs
- AI feature or system to audit
- Responsible AI standards to audit against (company, regulatory, or industry standards)

## Optional inputs
- AI governance framework
- Quality monitoring data
- User feedback or complaints about the AI
- Prior audits or assessments

## Upstream context
Works best when:
- AI governance principles are defined
- AI quality monitoring is in place

## Downstream handoff
Output can feed:
- govern-responsible-ai (audit findings → governance improvements)
- plan-risk-mitigation (audit gaps → risk mitigations)
- evaluate-ai-quality-monitoring (audit reveals monitoring gaps)

## Instructions
1. Define the audit scope: which AI feature, which standards, what time period.
2. Gather evidence: model documentation, training data provenance, quality metrics, user feedback, incident log.
3. Audit against each responsible AI dimension: fairness, transparency, accountability, safety, privacy.
4. Identify gaps: where does the system not meet the standard?
5. Assess severity of each gap: critical / major / minor.
6. Produce findings and recommendations.
7. Define remediation timeline and ownership.

## Output
Provide:
- Audit scope and standards applied
- Evidence gathered
- Findings by dimension (fairness, transparency, accountability, safety, privacy)
- Gap severity classification
- Remediation recommendations with owners and timelines
- Overall audit verdict: compliant / conditionally compliant / non-compliant
- Next audit schedule

## Risks / caveats
- AI audits are snapshots — model behavior can change with data drift; schedule re-audits
- Audits without executive visibility don't drive remediation
- Fairness audits require defining "fair" explicitly — it's not a universal standard
