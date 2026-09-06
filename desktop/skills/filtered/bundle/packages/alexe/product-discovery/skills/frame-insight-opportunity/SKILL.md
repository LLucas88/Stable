---
name: alexe-frame-insight-opportunity
description: Turn raw insights into well-structured opportunity statements ready for prioritization or experiment design. Use this skill when a team has research insights and needs to frame them as actionable product opportunities.
metadata:
  source-name: frame-insight-opportunity
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Frame Insight & Opportunity

## Purpose
Convert research insights into structured opportunity statements that can be prioritized, sized, and used as inputs for experiment design or roadmap planning.

## Skill type
Conceptual skill

## Use this skill when
- Research synthesis exists but hasn't been turned into product opportunities
- A team is debating what to work on next and needs a structured opportunity view
- Insights need to be communicated to stakeholders as investable opportunities
- Prioritization requires comparing opportunities with consistent structure

## Do not use this skill when
- The goal is solution design or feature definition (this skill defines the opportunity, not the solution)
- No research exists yet (run synthesize-qualitative-research first)

## Required inputs
- Research insights or findings

## Optional inputs
- Business goals or OKRs
- Affected user segment
- Relevant metrics

## Upstream context
Works best when:
- Qualitative research has been synthesized
- Personas or segments are defined

## If upstream context is missing
If only vague insights are provided, frame provisional opportunities and list what evidence is still needed.

## Downstream handoff
Output can feed:
- build-portfolio-roadmap-strategy (which opportunities to invest in)
- formulate-experiment-hypothesis (turn opportunity into testable hypothesis)
- set-goals-okrs-kpis (connect opportunity to measurable goal)

## Instructions
1. For each key insight, extract the underlying user need or problem.
2. Frame the opportunity using the format: "How might we [user need] so that [outcome]?"
3. Assess evidence quality and confidence.
4. Estimate rough potential impact on relevant product metrics.
5. Identify the user segment most affected.
6. Flag dependencies, risks, or constraints.

## Output
For each opportunity:
- Opportunity statement (HMW format)
- Insight it is derived from
- Affected segment
- Potential impact (qualitative: low / medium / high)
- Evidence quality: assumed / data-informed / validated
- Risks or constraints
- Suggested next step: experiment, research, or build

## Risks / caveats
- Do not jump to solution descriptions in the opportunity statement
- Opportunity quality depends on research quality — weak research produces weak opportunities
- Do not overstate impact estimates when evidence is thin
