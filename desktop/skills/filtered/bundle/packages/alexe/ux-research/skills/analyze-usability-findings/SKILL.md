---
name: alexe-analyze-usability-findings
description: Analyze and structure findings from usability testing sessions into prioritized, actionable design recommendations. Use this skill after usability testing to turn observations into improvements.
metadata:
  source-name: analyze-usability-findings
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analyze Usability Findings

## Purpose
Help teams structure raw usability observations into a clear, prioritized set of findings and design recommendations that can be handed off to design and engineering.

## Skill type
Conceptual skill

## Use this skill when
- Usability testing sessions have been completed and observations need to be analyzed
- Raw session notes need to be organized into patterns and themes
- A usability report needs to be produced for stakeholders
- Design teams need prioritized issues to act on

## Do not use this skill when
- Sessions haven't been run yet (use run-usability-testing or design-research-study)
- The goal is broad qualitative synthesis from interviews (use synthesize-qualitative-research)

## Required inputs
- Session notes, recordings, or observation logs
- Tasks or scenarios used in the study

## Optional inputs
- Completion rates or task timing data
- Prior usability findings for comparison
- Severity rating criteria

## Upstream context
Works best when:
- Study protocol is known (what tasks were given, what was observed)
- Multiple sessions have been completed (3+ for pattern detection)

## Downstream handoff
Output can feed:
- assess-experience-quality (findings feed broader experience quality view)
- manage-design-handoff (prioritized issues go into design brief)
- formulate-experiment-hypothesis (critical issues → test solutions via experiment)

## Instructions
1. Collect all session observations in one place.
2. Group observations by task or product area.
3. Identify recurring issues (appeared in 2+ sessions) vs. one-off observations.
4. Classify each issue by severity: critical (blocks task) / major (causes confusion or errors) / minor (annoyance).
5. Write each finding as a clear problem statement with evidence (direct quotes or observations).
6. Generate design recommendations for each finding.
7. Prioritize recommendations by severity and feasibility.

## Output
Provide:
- Finding set organized by theme or task area
- Each finding: description, evidence (quotes/observations), severity, affected participants
- Design recommendations per finding
- Priority-ordered action list
- Quick wins (low effort, high impact)
- Open questions for next round of research

## Risks / caveats
- Issues seen in only one session may be participant-specific — flag but don't overweight
- Separate findings from recommendations — designers should understand the problem before jumping to solutions
- Don't include every observation — focus on patterns with design implications
