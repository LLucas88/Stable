---
name: alexe-apply-jtbd-framework
description: Apply the Jobs-to-be-Done framework to understand what job users are hiring a product to do and why. Use this skill when a team needs to understand user motivation at a level deeper than features or demographics.
metadata:
  source-name: apply-jtbd-framework
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Apply JTBD Framework

## Purpose
Help teams use the Jobs-to-be-Done (JTBD) framework to understand the functional, emotional, and social jobs users are trying to accomplish — providing a stable foundation for product decisions independent of features or technologies.

## Skill type
Conceptual skill

## Use this skill when
- Feature decisions are driven by requests rather than underlying jobs
- The team is unsure why users choose (or leave) the product
- Positioning or messaging lacks a clear reason users "hire" the product
- A new segment is being explored and core motivation is unknown

## Do not use this skill when
- The goal is demographic persona building (use develop-persona-segment)
- Behavioral usage data analysis is needed (use data-analytics skills)

## Required inputs
- Product or feature area
- Available user research or interview data (even rough)

## Optional inputs
- Win/loss data
- Customer interviews about switching moments
- Churn reasons
- Competitive alternatives users consider

## Upstream context
Works best when:
- User interview data exists
- Target segment is defined

## If upstream context is missing
Produce a JTBD hypothesis framework and list what interview data is needed to validate the jobs.

## Downstream handoff
Output can feed:
- frame-insight-opportunity (jobs → opportunity statements)
- develop-positioning-messaging (job framing shapes messaging)
- formulate-experiment-hypothesis (job clarity → testable hypothesis)

## Instructions
1. Identify the context in which users encounter the problem (the "when" of the job).
2. Identify the functional job: what task are they trying to accomplish?
3. Identify the emotional job: how do they want to feel (or avoid feeling) while doing it?
4. Identify the social job: how do they want to be perceived by others?
5. Identify the "struggling moment" — what triggered the search for a solution?
6. Map competing solutions users consider for the same job.
7. Write a job statement: "When [situation], I want to [motivation], so I can [expected outcome]."

## Output
Provide:
- Job statement(s)
- Functional, emotional, and social dimensions
- Struggling moment description
- Competing solutions for the same job
- Implications for product design and messaging
- Evidence quality: assumed / interview-based / validated
- Open questions

## Risks / caveats
- Jobs describe motivation and context, not features or solutions
- One product can serve multiple jobs — identify the primary job and secondary ones
- JTBD based on assumptions without interview data is a hypothesis, not a finding
