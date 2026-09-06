---
name: alexe-apply-prioritization-framework
description: Apply a structured prioritization framework (RICE, MoSCoW, ICE, opportunity scoring, etc.) to rank initiatives or features. Use this skill when a team needs to move from a backlog of ideas to a prioritized, rationale-backed list.
metadata:
  source-name: apply-prioritization-framework
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Apply Prioritization Framework

## Purpose
Help teams apply the right prioritization framework to their context and produce a ranked list with explicit, shared rationale — replacing gut-feel debates with structured criteria.

## Skill type
Conceptual skill

## Use this skill when
- A backlog or list of initiatives needs to be prioritized
- Team members disagree on priority and need a shared framework
- A framework choice needs to be made (RICE vs. MoSCoW vs. opportunity scoring)
- A current priority list needs to be re-evaluated after new data or strategy shifts

## Do not use this skill when
- The goal is strategic portfolio prioritization (use prioritize-strategic-bets)
- The goal is roadmap structure (use build-roadmap-prioritization)

## Required inputs
- List of initiatives or features to prioritize
- Prioritization context: what goal does priority serve?

## Optional inputs
- Effort estimates
- Impact estimates or data
- Strategic goals or OKRs
- Team capacity

## Upstream context
Works best when:
- Goals are defined
- Initiatives are described clearly enough to estimate

## If upstream context is missing
Select the lightest-weight framework that works with available data. Flag assumptions in the scoring.

## Downstream handoff
Output can feed:
- build-roadmap-prioritization (prioritized items → roadmap)
- write-requirements-prd (top-priority items go into requirements)

## Instructions
1. Select the appropriate framework based on context:
   - RICE (Reach × Impact × Confidence ÷ Effort): good for data-rich teams with volume to compare
   - MoSCoW (Must/Should/Could/Won't): good for scoping a release against constraints
   - ICE (Impact × Confidence × Ease): good for quick, low-data scoring
   - Opportunity Scoring: good for comparing items on user importance vs. current satisfaction
2. Define scoring criteria and scales before scoring (prevents post-hoc rationalization).
3. Score each item against the criteria.
4. Produce a ranked list.
5. Review for obvious mismatches — do high scores actually reflect strategic intent?
6. Document assumptions behind key scores.

## Output
Provide:
- Framework selected with rationale
- Scoring criteria and scale definitions
- Scored and ranked list
- Top 3–5 items with brief rationale
- Items that scored high but should be deprioritized for strategic reasons (and why)
- Assumptions behind key scores

## Risks / caveats
- Scoring frameworks create false precision — they structure discussion, not replace judgment
- Define criteria before scoring, not after (prevents anchoring to preferred outcomes)
- RICE is often gamed — review estimates for inflation
