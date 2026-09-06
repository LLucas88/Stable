---
name: alexe-design-human-in-loop-workflow
description: Design workflows that appropriately balance AI automation with human oversight and intervention. Use this skill when a team is building an AI feature and needs to decide when and how humans stay in the loop.
metadata:
  source-name: design-human-in-loop-workflow
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Human-in-the-Loop Workflow

## Purpose
Help teams design AI-assisted workflows that appropriately allocate tasks between AI and human judgment, with clear escalation, review, and override mechanisms.

## Skill type
Conceptual skill

## Use this skill when
- An AI feature is being designed and human oversight needs to be structured
- AI output quality is inconsistent and human review is needed
- A high-stakes decision involves AI recommendations that need human validation
- A team is reducing AI automation and wants to design the right handoff points

## Do not use this skill when
- The goal is model selection (use assess-model-capabilities)
- The goal is AI quality monitoring (use evaluate-ai-quality-monitoring)

## Required inputs
- AI feature or workflow being designed
- Stakes level (low / medium / high consequences of errors)
- User segment interacting with the AI

## Optional inputs
- Model capability assessment
- Known failure modes
- Regulatory or compliance context
- User trust level with AI

## Upstream context
Works best when:
- AI feature is defined
- Model capabilities and limitations are assessed

## Downstream handoff
Output can feed:
- evaluate-ai-quality-monitoring
- write-requirements-prd (HITL design becomes a requirement)

## Instructions
1. Map the workflow steps where AI is involved.
2. For each step, assess: what happens if the AI is wrong? What are the stakes?
3. Determine the appropriate intervention mode: fully automated / AI-assisted human / human-reviewed AI / AI-augmented decision.
4. Design review, override, and escalation mechanisms.
5. Define when the AI should abstain or flag for human review.
6. Define the feedback loop: how do human corrections improve the AI?

## Output
Provide:
- Workflow map with AI involvement per step
- Stakes assessment per step
- Intervention mode recommendation per step
- Review, override, and escalation design
- Abstention and flagging criteria
- Feedback loop design
- Edge case handling

## Risks / caveats
- Full automation without oversight is appropriate only for low-stakes, well-validated tasks
- "Human in the loop" that doesn't actually change the outcome is theater, not safety
- Feedback loops are mandatory — AI without them won't improve
