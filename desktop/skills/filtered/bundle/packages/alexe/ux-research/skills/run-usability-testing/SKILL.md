---
name: alexe-run-usability-testing
description: Structure and synthesize usability testing sessions and feedback loops. Use this skill when a team needs to evaluate a design or flow by observing real users attempting to use it.
metadata:
  source-name: run-usability-testing
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run Usability Testing

## Purpose
Help teams design and synthesize usability tests that surface friction, confusion, and failure points in product flows.

## Skill type
Conceptual skill

## Use this skill when
- A new design or flow is ready for testing before launch
- There are hypotheses about user confusion or friction in an existing flow
- A redesign needs to be validated against the original
- Post-launch feedback suggests usability problems

## Do not use this skill when
- The goal is generative research (understanding needs) — use plan-ux-research
- No design or prototype exists yet

## Required inputs
- Product flow or feature to be tested
- Key user tasks to test

## Optional inputs
- Design prototype or staging environment
- Target participant criteria
- Hypotheses about friction points
- Prior usability test findings

## Upstream context
Works best when:
- UX research plan exists
- Prototype or staging environment is available

## If upstream context is missing
If no prototype exists, produce a usability test plan for when it is ready, with placeholder tasks.

## Downstream handoff
Output can feed:
- assess-experience-quality
- manage-design-handoff (surface issues to fix before handoff)

## Instructions
1. Define the tasks participants will attempt (user-goal-based, not UI-instruction-based).
2. Define success criteria for each task.
3. Select testing method: moderated or unmoderated, remote or in-person.
4. Specify participant criteria and number (5–8 for qualitative usability testing).
5. Design the test script and facilitation guide.
6. After testing: synthesize findings by severity (critical / major / minor).
7. Map findings to specific interface elements.

## Output
Provide:
- Test tasks and success criteria
- Testing method and participant criteria
- Test script outline
- (Post-test) Findings organized by severity
- (Post-test) Specific friction points with supporting observations
- Recommended fixes

## Risks / caveats
- Tasks must be goal-based, not UI-instruction-based ("book a trip" not "click the Book button")
- Do not coach participants — observe and note, don't guide
- 5 participants typically surface 85% of usability issues; plan accordingly
