---
name: alexe-apply-ethical-decision-framework
description: Apply structured ethical frameworks to evaluate product decisions and identify potential harms. Use this skill when a product decision raises ethical concerns or involves trade-offs between user wellbeing and business goals.
metadata:
  source-name: apply-ethical-decision-framework
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Apply Ethical Decision Framework

## Purpose
Help product teams evaluate decisions through an ethical lens, identify potential harms, and make more responsible choices.

## Skill type
Conceptual skill

## Use this skill when
- A product decision may harm certain user groups or create unfair outcomes
- A feature optimizes for engagement in ways that may conflict with user wellbeing
- A business model incentive may misalign with user interests
- An AI feature raises fairness, bias, or transparency concerns
- The team wants to stress-test a decision for ethical implications before committing

## Do not use this skill when
- The goal is legal compliance (use assess-privacy-security-regulatory)
- The goal is risk management without ethical dimension (use plan-risk-mitigation)

## Required inputs
- Product decision or feature being evaluated
- User groups affected

## Optional inputs
- Business goal being served
- Known concerns or objections
- Regulatory context
- Relevant demographic or equity considerations

## Upstream context
Works best when:
- Product requirements are defined
- Affected user groups are known

## Downstream handoff
Output can feed:
- plan-risk-mitigation (ethical risks become formal risks to mitigate)
- govern-responsible-ai (for AI-specific ethical issues)

## Instructions
1. Identify all user groups affected by the decision, including marginalized or vulnerable groups.
2. Identify potential harms: psychological, financial, privacy, autonomy, fairness.
3. Assess harms by likelihood and severity.
4. Evaluate the decision through multiple ethical lenses: utility, rights, fairness, care.
5. Identify who benefits and who bears the cost.
6. Recommend adjustments to reduce harm or improve fairness.
7. Flag cases where the decision should be escalated for leadership or legal review.

## Output
Provide:
- Affected user group map (including vulnerable groups)
- Potential harm identification by type and severity
- Ethical evaluation across frameworks (utility / rights / fairness / care)
- Benefit and burden distribution
- Recommended adjustments to reduce harm
- Escalation triggers (when this needs leadership or legal input)

## Risks / caveats
- Ethical review is a judgment process, not a formula — this skill supports thinking, not replaces it
- Business justification does not automatically override ethical concerns
- Vulnerable user populations often bear disproportionate harm — actively look for them
