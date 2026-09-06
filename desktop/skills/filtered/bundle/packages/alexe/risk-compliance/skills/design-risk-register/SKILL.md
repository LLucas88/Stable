---
name: alexe-design-risk-register
description: Design and populate a risk register for a product initiative or program. Use this skill when risks need to be tracked, owned, and actively managed over the lifetime of an initiative.
metadata:
  source-name: design-risk-register
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Risk Register

## Purpose
Help teams design a risk register that creates ongoing risk visibility — with clear ownership, triggers, and mitigations — not just a one-time list that gets filed away.

## Skill type
Conceptual skill

## Use this skill when
- A product initiative or program has risks that need ongoing tracking
- Risks have been identified (via pre-mortem or other analysis) and need to be formalized
- A governance process requires a risk register
- A new initiative is starting and risk management needs to be embedded from the beginning

## Do not use this skill when
- The goal is identifying risks for the first time (use run-pre-mortem or plan-risk-mitigation)
- The goal is a one-time risk snapshot without ongoing management

## Required inputs
- Initiative or product area
- Known risks (or a recent pre-mortem or risk assessment)

## Optional inputs
- Risk tolerance framing from leadership
- Governance or compliance requirements
- Cross-team or vendor dependencies
- Historical risks from similar initiatives

## Upstream context
Works best when:
- Pre-mortem or risk assessment has been done
- Stakeholder map exists

## Downstream handoff
Output can feed:
- plan-delivery-collaboration (risk register informs delivery planning)
- run-cross-functional-review (risk register is reviewed in cross-functional reviews)

## Instructions
1. Define the risk register scope: what initiative or program does it cover?
2. Define the risk taxonomy: categories of risk relevant to this context.
3. Populate initial entries from pre-mortem or risk assessment.
4. For each risk: define likelihood, impact, severity, trigger, owner, mitigation, contingency.
5. Define the update cadence: how often is the register reviewed?
6. Define escalation criteria: when does a risk trigger a formal response?
7. Define archive criteria: when is a risk retired from active tracking?

## Output
Provide:
- Risk register scope and taxonomy
- Risk entries: risk / category / likelihood / impact / severity / trigger / owner / mitigation / contingency
- Update and review cadence
- Escalation criteria and path
- Archive criteria
- Risk register owner (who maintains it)

## Risks / caveats
- Risk registers that aren't reviewed become historical artifacts, not management tools
- Every risk must have a named owner — group ownership means no ownership
- Mitigations that require no action are not mitigations
