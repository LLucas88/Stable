---
name: alexe-define-non-functional-requirements
description: Define non-functional requirements (performance, security, scalability, accessibility, compliance) for a product initiative. Use this skill when product requirements are functional but non-functional constraints haven't been specified.
metadata:
  source-name: define-non-functional-requirements
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Define Non-Functional Requirements

## Purpose
Help teams explicitly define non-functional requirements (NFRs) — performance, security, privacy, scalability, accessibility, and compliance — before development begins, so they are built in rather than bolted on.

## Skill type
Conceptual skill

## Use this skill when
- A feature or initiative has functional requirements but no NFRs defined
- Engineering has questions about performance or security targets
- A compliance or accessibility requirement applies and hasn't been scoped
- A product is scaling and NFRs need to be revisited

## Do not use this skill when
- The goal is privacy or regulatory risk assessment (use assess-privacy-security-regulatory)
- The goal is reliability SLA design only (use assess-reliability-scalability)

## Required inputs
- Product feature or initiative
- Expected scale and usage patterns (rough)
- User segment and context (consumer vs. enterprise, geography)

## Optional inputs
- Regulatory context (GDPR, HIPAA, ADA, etc.)
- Performance baselines or benchmarks
- Security requirements from legal or compliance
- Accessibility standards in use

## Upstream context
Works best when:
- Functional requirements are defined
- Scale estimates exist

## Downstream handoff
Output can feed:
- write-requirements-prd (NFRs become part of the requirements doc)
- assess-reliability-scalability (NFRs inform reliability design)
- plan-risk-mitigation (unmet NFRs are risks)

## Instructions
1. Identify applicable NFR categories: performance, scalability, security, privacy, accessibility, compliance, reliability.
2. For each category: define the specific requirement and acceptance criteria.
3. Make requirements testable: avoid "fast" or "secure" — specify measurable criteria.
4. Identify which NFRs are hard requirements vs. targets.
5. Flag NFRs that have cost or timeline implications.
6. Define how each NFR will be validated before shipping.

## Output
Provide:
- NFR inventory by category
- Each NFR: description, acceptance criteria, hard requirement vs. target
- Cost or timeline implications
- Validation approach per NFR
- NFRs that require third-party assessment (security audit, accessibility review)
- Open questions for engineering or compliance

## Risks / caveats
- NFRs not defined upfront become expensive retrofits — define before development starts
- "Bank-level security" and "99.99% uptime" are not requirements — make them specific
- Accessibility is a requirement in many jurisdictions, not a nice-to-have
