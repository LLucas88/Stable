---
name: alexe-govern-responsible-ai
description: Establish governance practices for responsible AI development including fairness, transparency, and accountability. Use this skill when a team building AI features needs a governance framework for responsible development.
metadata:
  source-name: govern-responsible-ai
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Govern Responsible AI

## Purpose
Help product teams establish governance practices that ensure AI features are developed and deployed responsibly — with fairness, transparency, accountability, and safety built in.

## Skill type
Conceptual skill

## Use this skill when
- An AI feature is being developed and governance standards need to be defined
- Existing AI features lack accountability or monitoring mechanisms
- A team wants to establish responsible AI principles before building
- Regulatory or stakeholder pressure requires a responsible AI framework

## Do not use this skill when
- The goal is AI quality monitoring only (use evaluate-ai-quality-monitoring)
- The goal is ethical review of a specific decision (use apply-ethical-decision-framework)

## Required inputs
- AI feature or product being governed
- Organizational context (team size, AI maturity, industry)

## Optional inputs
- Existing AI ethics principles
- Regulatory context (EU AI Act, sector-specific rules)
- Known AI risks in the product area
- Stakeholder expectations

## Upstream context
Works best when:
- AI feature is defined
- Ethical and privacy assessments have been done

## Downstream handoff
Output can feed:
- evaluate-ai-quality-monitoring (governance standards feed quality criteria)
- assess-privacy-security-regulatory (AI governance intersects with privacy)

## Instructions
1. Define the AI governance principles for this context (fairness, transparency, accountability, safety, privacy).
2. Identify governance requirements per principle.
3. Design accountability structures: who owns AI governance, how decisions are made.
4. Design transparency mechanisms: how users are informed about AI use.
5. Define fairness criteria and assessment methods.
6. Design audit and review processes.
7. Define escalation paths for AI governance failures.

## Output
Provide:
- AI governance principles (tailored to context)
- Requirements per principle
- Accountability structure
- Transparency mechanisms
- Fairness criteria and assessment approach
- Audit and review process
- Escalation paths
- Governance maturity level: minimal / basic / mature

## Risks / caveats
- Governance principles without enforcement are decoration
- Fairness requires defining "fair for whom" — it's context-specific
- AI governance must involve legal, ethics, and technical stakeholders, not just product
