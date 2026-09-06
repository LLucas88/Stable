---
name: alexe-write-requirements-prd
description: Write clear, complete product requirements documents and user stories. Use this skill when a team is ready to define what needs to be built for a prioritized initiative.
metadata:
  source-name: write-requirements-prd
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Write Requirements & PRD

## Purpose
Produce clear, structured product requirements that engineering, design, and QA can use to build and test the right thing.

## Skill type
Conceptual skill

## Use this skill when
- An initiative is prioritized and ready for detailed definition
- Engineering needs clear requirements before scoping or development
- A feature needs acceptance criteria defined
- A PRD review is needed for quality or completeness

## Do not use this skill when
- The initiative hasn't been prioritized yet
- The goal is roadmap building (use build-roadmap-prioritization)
- The goal is sprint management or delivery coordination (use plan-delivery-collaboration)

## Required inputs
- Feature or initiative description
- User segment affected
- Goal or outcome the feature serves

## Optional inputs
- User stories or job stories
- Design files or mockups
- Technical constraints
- Acceptance criteria drafts
- Edge cases or exclusions

## Upstream context
Works best when:
- Goal is defined
- User segment and problem are understood
- Design exploration has begun

## If upstream context is missing
If the problem and user are not defined, do not write requirements. Write a problem framing first.

## Downstream handoff
Output can feed:
- plan-delivery-collaboration (engineers use requirements to plan delivery)
- design-experiment-plan (if this is an A/B test, requirements feed the experiment plan)

## Instructions
1. Define the problem this feature solves and for whom.
2. State the goal or success metric.
3. Write user stories in the format: As a [user], I want to [action] so that [outcome].
4. Define acceptance criteria for each user story.
5. List out-of-scope items explicitly.
6. Identify open questions and dependencies.
7. Note edge cases and error states.

## Output
Provide:
- Problem statement and goal
- User stories with acceptance criteria
- Out-of-scope definition
- Open questions
- Dependencies
- Edge cases and error states

## Risks / caveats
- Do not write requirements without knowing the user and problem
- Acceptance criteria must be testable — avoid vague terms like "should feel easy"
- Out-of-scope sections prevent scope creep — do not skip them
