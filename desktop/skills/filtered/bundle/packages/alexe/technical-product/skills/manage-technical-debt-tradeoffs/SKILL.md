---
name: alexe-manage-technical-debt-tradeoffs
description: Structure the trade-off decision between addressing technical debt and delivering new product value. Use this skill when a team needs to make explicit, principled decisions about when and how to invest in technical debt reduction.
metadata:
  source-name: manage-technical-debt-tradeoffs
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Manage Technical Debt Trade-offs

## Purpose
Help product and engineering teams make principled, transparent decisions about when to prioritize technical debt over new features — and how to communicate and sequence those decisions.

## Skill type
Conceptual skill

## Use this skill when
- Engineering is pushing for a technical debt investment and product needs to evaluate the trade-off
- A product area is slowing down due to accumulated debt and the impact needs to be quantified
- A planning cycle needs to include technical debt work alongside feature work
- Debt-related risk needs to be communicated to stakeholders

## Do not use this skill when
- The goal is pure technical architecture decisions (engineering-owned)
- The goal is reliability and SLA design (use assess-reliability-scalability)

## Required inputs
- Technical debt area or initiative
- Estimated cost: time required to address
- Estimated impact of debt on: velocity, reliability, user experience, or risk

## Optional inputs
- Engineering assessment of debt severity
- User or business impact data (incidents, slow features, bugs)
- Opportunity cost: what feature work is blocked or slowed?

## Upstream context
Works best when:
- Engineering has characterized the debt
- Product velocity or quality data is available

## Downstream handoff
Output can feed:
- build-roadmap-prioritization (debt investment goes on roadmap)
- build-business-case (debt investment needs justification to stakeholders)

## Instructions
1. Characterize the debt: what type, how old, what caused it?
2. Quantify the current cost of the debt: delivery slowdown, bug rate, reliability impact, user impact.
3. Quantify the investment: estimated effort and timeline to address.
4. Calculate the payback: how long until the investment pays off in recovered velocity or reduced cost?
5. Identify the risk of not addressing: will the debt compound? Is there a cliff?
6. Make a recommendation: address now / schedule / accept.

## Output
Provide:
- Debt characterization (type, cause, age)
- Current cost of debt (velocity, reliability, user impact)
- Investment estimate
- Payback analysis
- Risk of deferral
- Recommendation: address now / schedule next cycle / accept as-is
- Stakeholder communication framing

## Risks / caveats
- "Tech debt" without business impact quantification will never beat feature work in prioritization
- All debt is not equal — distinguish structural risk (blocking growth) from cosmetic debt (annoyance)
- Accepting debt deliberately is valid — accepting it accidentally is not
