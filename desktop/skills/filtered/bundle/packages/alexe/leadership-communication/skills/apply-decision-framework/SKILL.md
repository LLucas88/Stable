---
name: alexe-apply-decision-framework
description: Apply a structured decision framework (DACI, SPADE, RAPID, or equivalent) to make product decisions clearly and accountably. Use this skill when a decision needs defined ownership, input, and accountability before proceeding.
metadata:
  source-name: apply-decision-framework
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Apply Decision Framework

## Purpose
Help teams apply the right decision framework to clarify who decides, who inputs, who is informed — and produce a clear, documented decision with transparent rationale.

## Skill type
Conceptual skill

## Use this skill when
- A decision is stalled because it's unclear who has the authority to make it
- A decision is being made without the right people in the room
- A contested decision needs a structured process to resolve it
- A team wants to establish clear decision rights for recurring decision types

## Do not use this skill when
- The decision is straightforward and doesn't need a framework
- The goal is stakeholder management (use map-stakeholder-influence)

## Required inputs
- Decision to be made
- Relevant stakeholders

## Optional inputs
- Decision timeline
- Prior attempts to make this decision
- Options being considered
- Constraints

## Upstream context
Works best when:
- Stakeholder map exists
- Decision scope is defined

## Downstream handoff
Output can feed:
- communicate-decisions-tradeoffs (decision made → communication plan)
- map-stakeholder-influence (decision process → stakeholder engagement)

## Instructions
1. Define the decision clearly: what exactly is being decided?
2. Select the appropriate framework:
   - DACI (Driver / Approver / Contributors / Informed): good for complex cross-functional decisions
   - SPADE (Setting / People / Alternatives / Decide / Explain): good for high-stakes strategic decisions
   - RAPID (Recommend / Agree / Perform / Input / Decide): good for operational decisions with clear owners
3. Map stakeholders to roles in the chosen framework.
4. Define the options being considered.
5. Document the decision, rationale, and trade-offs explicitly.
6. Define who is informed and how.

## Output
Provide:
- Decision statement
- Framework selected with rationale
- Role assignments (Driver/Approver/etc.)
- Options considered
- Decision made and rationale
- Trade-offs acknowledged
- Communication plan (who is informed, how)
- Review trigger (when to revisit the decision)

## Risks / caveats
- Decision frameworks are only useful if the Approver or Decider role is real — not honorary
- Decisions with too many approvers produce committee outcomes
- Document the decision before communicating it — oral decisions get reinterpreted
