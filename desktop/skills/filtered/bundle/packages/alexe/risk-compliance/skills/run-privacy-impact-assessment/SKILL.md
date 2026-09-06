---
name: alexe-run-privacy-impact-assessment
description: Run a privacy impact assessment (PIA) for a product feature or initiative that collects, processes, or uses personal data. Use this skill when a new feature has privacy implications that need to be evaluated before launch.
metadata:
  source-name: run-privacy-impact-assessment
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Privacy Impact Assessment

## Purpose
Help teams conduct a structured privacy impact assessment that identifies personal data flows, evaluates privacy risks, and defines mitigations — before launching a feature, not after.

## Skill type
Conceptual skill

## Use this skill when
- A new feature collects, processes, or uses personal data
- A data-sharing or third-party integration is being introduced
- Regulatory requirements (GDPR, CCPA, HIPAA) require a formal PIA
- A privacy risk needs to be evaluated before stakeholder approval

## Do not use this skill when
- The goal is general security risk assessment (use assess-privacy-security-regulatory)
- The goal is AI-specific governance (use govern-responsible-ai)

## Required inputs
- Feature or initiative description
- Types of personal data involved (or potentially involved)
- Target market / geography

## Optional inputs
- Data flow diagram
- Applicable regulations
- Vendor or third-party data sharing
- Legal team requirements

## Upstream context
Works best when:
- Feature is defined
- Privacy regulations applicable to the product are known

## Downstream handoff
Output can feed:
- plan-risk-mitigation (privacy risks → mitigation plan)
- write-requirements-prd (privacy requirements → product requirements)
- govern-responsible-ai (PIA intersects with AI governance for AI features)

## Instructions
1. Identify all personal data collected or processed by the feature.
2. Map the data flow: collection → processing → storage → sharing → deletion.
3. Identify applicable regulations and their requirements.
4. Assess privacy risks at each stage of the data flow.
5. Evaluate risk severity: likelihood × impact on individuals.
6. Define mitigations for each identified risk.
7. Define residual risk and whether it is acceptable.

## Output
Provide:
- Personal data inventory (type, sensitivity, volume)
- Data flow map
- Applicable regulations and requirements
- Privacy risks by data flow stage
- Risk severity assessment
- Mitigations per risk
- Residual risk assessment
- Recommendation: proceed / proceed with conditions / don't proceed

## Risks / caveats
- PIAs done after launch are retroactive fixes — run them before, not after
- Regulatory requirements vary by geography — identify applicable laws early
- Legal review should validate the PIA for high-risk features
