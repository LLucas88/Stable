---
name: alexe-design-research-study
description: Design a structured UX or product research study including method selection, protocol, stimuli, and success criteria. Use this skill when a team needs to go beyond ad-hoc interviews to a rigorous, repeatable research design.
metadata:
  source-name: design-research-study
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Research Study

## Purpose
Help teams design a research study that is rigorous enough to produce reliable, comparable findings — whether for usability testing, concept evaluation, diary studies, or observational research.

## Skill type
Conceptual skill

## Use this skill when
- A research question requires more structure than an informal interview
- Research needs to be repeatable across participants or time periods
- A study design needs review before execution
- Multiple research methods need to be combined in a single study

## Do not use this skill when
- A simple user interview plan is sufficient (use run-user-interviews)
- The goal is synthesizing completed research (use synthesize-qualitative-research)

## Required inputs
- Research question or goal
- Participant profile

## Optional inputs
- Prototype or designs to evaluate (for usability studies)
- Prior research findings
- Constraints: time, budget, access to participants
- Required output format (report, deck, video clips)

## Upstream context
Works best when:
- Research scope has been defined
- UX research plan exists

## Downstream handoff
Output can feed:
- run-usability-testing (study design → test execution)
- analyze-usability-findings (study design defines analysis frame)
- synthesize-qualitative-research (study design informs synthesis approach)

## Instructions
1. Define the study goal and specific research questions.
2. Select the research method(s): usability test, concept test, diary study, contextual inquiry, survey.
3. Design the protocol: task order, stimuli, questions, time allocation.
4. Define the participant profile and screening criteria.
5. Define how data will be captured: notes, recordings, observations.
6. Define analysis approach and success criteria.
7. Pilot the protocol before running with real participants.

## Output
Provide:
- Study goal and research questions
- Method selection with rationale
- Study protocol (task list, questions, time plan)
- Participant profile and screening criteria
- Data capture plan
- Analysis approach and success criteria
- Pilot plan
- Known risks and mitigations

## Risks / caveats
- Unstructured studies produce inconsistent data that is hard to synthesize
- Pilot sessions are not optional — they catch protocol flaws before wasting participant time
- Moderator bias is real: train whoever is running the study
