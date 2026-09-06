---
name: alexe-write-user-stories
description: Write well-formed user stories with clear acceptance criteria ready for development. Use this skill when a team needs to break down a feature or initiative into development-ready stories.
metadata:
  source-name: write-user-stories
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Write User Stories

## Purpose
Help teams produce well-formed, testable user stories that communicate user intent and enable engineering to build the right thing.

## Skill type
Conceptual skill

## Use this skill when
- A feature needs to be broken into development-ready increments
- User stories are too vague or written from a system perspective rather than user perspective
- Acceptance criteria are missing or untestable
- A PRD exists but engineers need story-level granularity

## Do not use this skill when
- Requirements at a higher level need to be defined first (use write-requirements-prd)
- The goal is sprint planning and sequencing (use plan-delivery-collaboration)

## Required inputs
- Feature or initiative description
- Target user
- Goal or outcome the feature serves

## Optional inputs
- PRD or requirements document
- Design files or mockups
- Technical constraints
- Existing story drafts

## Upstream context
Works best when:
- PRD or requirements are defined
- User and problem are clear

## If upstream context is missing
Do not write stories without knowing the user and the problem. Write requirements first.

## Downstream handoff
Output can feed:
- plan-delivery-collaboration (stories feed sprint planning)
- validate-experiment-quality (stories define what was shipped in an experiment)

## Instructions
1. Identify all user-facing interactions in the feature.
2. Write each story in format: "As a [specific user type], I want to [action] so that [outcome]."
3. Keep each story to a single, shippable increment of value.
4. Write acceptance criteria in Given/When/Then or checklist format.
5. Identify and flag edge cases and error states.
6. Define what "done" means for each story (including non-functional requirements if relevant).
7. Group stories into logical epics or themes.

## Output
Provide:
- Story set organized by epic or theme
- Each story with: user type, action, outcome, acceptance criteria
- Edge cases and error state handling per story
- Definition of done
- Stories flagged as blockers (must be done before others)
- Estimated story count and rough scope signal

## Risks / caveats
- "As a user, I want to click a button" is a task, not a story — anchor in user outcome
- Acceptance criteria must be testable — avoid adjectives like "intuitive" or "fast"
- Too-large stories (epics) create delivery risk — break them down
