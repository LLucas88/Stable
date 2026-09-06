---
name: alexe-run-user-interviews
description: Plan, structure, and synthesize user interviews to generate reliable qualitative insights. Use this skill when a team needs to understand user behaviors, motivations, and problems through direct conversation.
metadata:
  source-name: run-user-interviews
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run User Interviews

## Purpose
Help teams design and execute effective user interviews that generate reliable, actionable qualitative insights — not confirmation of existing assumptions.

## Skill type
Conceptual skill

## Use this skill when
- A team needs to understand user problems, behaviors, or motivations
- A product area is underexplored and hypothesis-generation is needed
- Existing assumptions need to be stress-tested with real users
- A discovery cycle requires structured qualitative input

## Do not use this skill when
- The goal is usability testing of a specific design (use run-usability-testing)
- The goal is synthesizing already-completed research (use synthesize-qualitative-research)

## Required inputs
- Research goal or question to explore
- Target participant profile

## Optional inputs
- Existing hypotheses to explore (not test)
- Number of interviews planned
- Recruiting constraints
- Prior research context

## Upstream context
Works best when:
- A discovery research scope has been defined
- Target segment is identified

## If upstream context is missing
If no research question exists, produce a question framing exercise first. Don't run interviews without a clear goal.

## Downstream handoff
Output can feed:
- synthesize-qualitative-research (interview transcripts → synthesis)
- apply-jtbd-framework (interview data → JTBD mapping)
- develop-persona-segment (interview patterns → personas)

## Instructions
1. Clarify the research goal: what decisions will this research inform?
2. Define the participant profile: who has the relevant experience to answer the question?
3. Design the interview guide: open-ended, story-based questions; no leading questions.
4. Structure the guide: warm-up → context → core questions → wrap-up.
5. Define recruiting criteria and target number (typically 5–8 per segment for saturation).
6. Define how notes or transcripts will be captured.
7. Plan for synthesis immediately after interviews while memory is fresh.

## Output
Provide:
- Research goal and decisions it will inform
- Participant profile and recruiting criteria
- Interview guide (warm-up, context, core questions, wrap-up)
- Note-taking protocol
- Synthesis plan
- Number of interviews needed and rationale

## Risks / caveats
- Leading questions produce confirmation, not insight — review the guide for bias
- 5–8 interviews per distinct segment is typically sufficient for pattern saturation
- Never ask users what they want — ask what they do and why
