---
name: alexe-assess-model-capabilities
description: Evaluate AI model capabilities, limitations, and trade-offs relevant to a product decision. Use this skill when a team needs to understand what an AI model can and cannot reliably do for their use case.
metadata:
  source-name: assess-model-capabilities
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Assess Model Capabilities

## Purpose
Help product teams understand AI model capabilities and limitations in the context of their product use case, so they can make informed build vs. buy vs. partner decisions.

## Skill type
Conceptual skill

## Use this skill when
- A team is deciding which AI model or approach to use for a feature
- There is uncertainty about what AI can reliably do in a given context
- Trade-offs between model accuracy, cost, latency, and privacy need to be evaluated
- An AI feature is underperforming and the root cause is model limitations

## Do not use this skill when
- The goal is AI feature ideation (use ideate-ai-features)
- The goal is quality monitoring and evaluation (use evaluate-ai-quality-monitoring)

## Required inputs
- Product use case description
- Expected model behavior (what should the model do?)

## Optional inputs
- Model options being considered
- Technical constraints (latency, cost, privacy)
- Quality bar required
- Edge cases that must be handled

## Upstream context
Works best when:
- AI feature idea is defined
- User value is framed
- Quality expectations exist

## Downstream handoff
Output can feed:
- design-human-in-loop-workflow (design around model limitations)
- evaluate-ai-quality-monitoring (define quality criteria based on this assessment)

## Instructions
1. Define the task the model needs to perform.
2. Assess model capability for the task: well-suited / partial fit / poor fit.
3. Identify known failure modes and edge cases.
4. Evaluate trade-offs: accuracy vs. cost vs. latency vs. privacy.
5. Assess build vs. buy vs. fine-tune vs. RAG approaches.
6. Recommend the approach with rationale and caveats.

## Output
Provide:
- Task definition
- Model fit assessment: well-suited / partial fit / poor fit
- Known failure modes and edge cases
- Trade-off comparison (accuracy, cost, latency, privacy)
- Recommended approach with rationale
- Required validation before production deployment
- Risks

## Risks / caveats
- AI model benchmarks rarely reflect real-world product performance — test on your data
- "GPT-4 is great at this" is not a capability assessment — define the task precisely
- Model limitations create product design constraints — identify them early
