---
name: alexe-run-pre-mortem
description: Run a pre-mortem analysis to identify ways a product initiative could fail before it launches. Use this skill when a team wants to proactively surface failure modes and plan mitigations before committing to execution.
metadata:
  source-name: run-pre-mortem
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Pre-Mortem

## Purpose
Help teams use pre-mortem analysis to surface realistic failure modes for an initiative — before the commitment to execute — so they can build in mitigations or adjust the plan.

## Skill type
Conceptual skill

## Use this skill when
- A high-stakes initiative is about to be committed to and risks haven't been examined
- A team is overly confident about an initiative and needs adversarial thinking
- A launch plan needs stress-testing from a failure perspective
- Risk planning has been theoretical and needs to be grounded in realistic scenarios

## Do not use this skill when
- The goal is risk register creation (use design-risk-register)
- The goal is post-launch retrospective (use run-retrospective)

## Required inputs
- Initiative or plan being evaluated
- Context: scope, timeline, team, key dependencies

## Optional inputs
- Prior failure patterns from similar initiatives
- Stakeholder concerns
- Known technical or market uncertainties

## Upstream context
Works best when:
- Initiative is defined and near commitment
- Team has enough context to generate realistic failure modes

## Downstream handoff
Output can feed:
- plan-risk-mitigation (pre-mortem failures → formal risk plan)
- design-risk-register (pre-mortem findings → risk register entries)
- plan-delivery-collaboration (failure modes → delivery mitigations)

## Instructions
1. Assume the initiative has failed catastrophically 12 months from now.
2. Ask: "What went wrong? How did we get here?"
3. Generate failure modes across categories: technical, market, execution, organizational, external.
4. For each failure mode: assess likelihood and the severity of the failure.
5. Identify which failure modes are within the team's control to prevent.
6. Define mitigations for high-likelihood, high-severity failures.
7. Identify what the pre-mortem reveals about the plan that should change.

## Output
Provide:
- Pre-mortem framing statement
- Failure mode list by category
- Each failure mode: likelihood, severity, in-team-control?
- Top 3–5 failure modes (highest concern)
- Mitigations for top failure modes
- Plan adjustments surfaced by the pre-mortem
- Early warning signals to watch for

## Risks / caveats
- Pre-mortems can become pessimism sessions — keep failure modes realistic, not catastrophic
- The goal is to improve the plan, not to abandon it — balance risk identification with action
- Facilitator bias can prevent the hardest failures from being named — create psychological safety
