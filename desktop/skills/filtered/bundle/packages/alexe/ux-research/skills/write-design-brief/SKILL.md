---
name: alexe-write-design-brief
description: Write a clear design brief that gives designers the problem framing, constraints, and success criteria they need to start design work. Use this skill when handing a problem from product to design for exploration.
metadata:
  source-name: write-design-brief
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Write Design Brief

## Purpose
Help product teams produce a design brief that enables designers to start work confidently — with a clear problem statement, known constraints, and defined success criteria — without prescribing the solution.

## Skill type
Conceptual skill

## Use this skill when
- A product problem is being handed to design for exploration
- Designers are starting work without sufficient context
- Design work keeps going in the wrong direction because the brief was unclear
- A design sprint or design phase needs a documented starting point

## Do not use this skill when
- The goal is design review or handoff to engineering (use manage-design-handoff)
- Requirements need to be defined at the engineering level (use write-requirements-prd)

## Required inputs
- Problem to be solved
- Target user or segment
- Goal or desired outcome

## Optional inputs
- Research findings or user insights
- Known constraints (technical, business, time)
- Existing design patterns or system constraints
- Non-goals (what design should not do)

## Upstream context
Works best when:
- Research insights exist
- User journey is mapped or at least known for the relevant area

## Downstream handoff
Output can feed:
- manage-design-handoff (brief opens the design process; handoff closes it)
- run-usability-testing (brief defines what the design should be tested against)

## Instructions
1. State the problem from the user's perspective — not a solution.
2. Describe the target user and relevant context.
3. State the outcome the design should help achieve.
4. List known constraints: technical, time, brand, business.
5. List explicit non-goals — what this design effort should not address.
6. Define success criteria: how will the team know the design solves the problem?
7. Attach relevant research, data, or prior design work.

## Output
Provide:
- Problem statement (user-perspective)
- Target user and context
- Desired outcome
- Constraints (technical, business, brand, time)
- Non-goals
- Success criteria
- Supporting materials (research, data, prior design)
- Open questions for the designer to explore

## Risks / caveats
- A brief that specifies the solution is not a brief — it's a spec
- Constraints must be real — invented constraints waste design cycles
- Success criteria in a brief must be UX-measurable, not just business metrics
