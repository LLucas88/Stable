---
name: alexe-assess-privacy-security-regulatory
description: Identify and assess privacy, security, and regulatory risks in product decisions and features. Use this skill when a product decision may have privacy, security, or compliance implications.
metadata:
  source-name: assess-privacy-security-regulatory
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Assess Privacy, Security & Regulatory Risks

## Purpose
Help product teams identify and evaluate privacy, security, and regulatory risks before they become problems.

## Skill type
Conceptual skill

## Use this skill when
- A new feature collects, stores, or processes personal data
- A product decision may have regulatory implications (GDPR, CCPA, HIPAA, etc.)
- Security risks in a product area need to be assessed
- A feature involves third-party data sharing or integrations
- A market expansion brings new regulatory requirements

## Do not use this skill when
- The goal is a full legal or compliance audit (requires legal expertise)
- The goal is technical security architecture (requires security engineering)

## Required inputs
- Feature or product decision being assessed
- Data types involved (personal data, financial, health, etc.)
- Target market/geography

## Optional inputs
- Existing privacy or compliance documentation
- Known regulatory requirements
- Third-party integrations involved
- Data retention and access policies

## Upstream context
Works best when:
- Feature requirements are defined
- Target market is known

## Downstream handoff
Output can feed:
- plan-risk-mitigation (risks identified here become the input for mitigation planning)
- write-requirements-prd (privacy/security requirements feed product requirements)

## Instructions
1. Identify all personal, sensitive, or regulated data types involved.
2. Identify applicable regulations by geography and data type.
3. Assess privacy risks: data collection, storage, access, sharing, and retention.
4. Assess security risks: attack surface, data exposure, access controls.
5. Identify consent, transparency, and user rights requirements.
6. Flag items that require legal or security engineering review.

## Output
Provide:
- Data types and classification
- Applicable regulations
- Privacy risk assessment
- Security risk assessment
- Consent and transparency requirements
- User rights implications (right to access, delete, export)
- Items requiring legal or security review
- Recommended mitigations

## Risks / caveats
- This skill does not replace legal or security review — it surfaces risks, not final answers
- Regulatory requirements vary by jurisdiction — always verify with legal
- Privacy risks often emerge later in development when they're harder to fix — assess early
