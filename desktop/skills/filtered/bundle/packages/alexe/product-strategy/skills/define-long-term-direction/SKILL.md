---
name: alexe-define-long-term-direction
description: Translate vision and mission into a clear long-term product direction — the strategic choices, priorities, and trajectory that guide where the product will go over the next 2–4 years. Use this skill when a team has a vision and mission but lacks a coherent strategic direction connecting them to current decisions.
metadata:
  source-name: define-long-term-direction
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Define Long-Term Product Direction

## Purpose
Help teams articulate the strategic trajectory of the product — how it will evolve from its current mission toward its long-term vision, what areas will grow, what will be left behind, and what choices define the path.

## Skill type
Conceptual skill

## Use this skill when
- Vision and mission exist but don't yet translate into strategic direction
- The team debates priorities because there is no shared view of where the product is heading
- A planning cycle requires a 2–4 year directional narrative, not just a next-quarter roadmap
- Leadership alignment requires a coherent story connecting today to the future

## Do not use this skill when
- The goal is the aspirational long-horizon vision (use define-product-vision)
- The goal is the present-tense operational definition of the product (use craft-product-mission)
- The goal is a prioritized roadmap or portfolio plan (use build-portfolio-roadmap-strategy)

## Required inputs
- Product vision or aspirational destination
- Product mission or current operational focus
- Business goals for the planning horizon

## Optional inputs
- Current product capabilities and gaps
- Key market or user trends
- Competitive landscape
- Bets or investment areas under consideration

## Upstream context
Works best when:
- Vision is defined (where we want to be)
- Mission is defined (what we do today and for whom)
- Some understanding of the competitive and market context exists

## If upstream context is missing
If neither vision nor mission is defined, this skill cannot produce a meaningful direction.
Use define-product-vision and craft-product-mission first, then return.

## Downstream handoff
Output can feed:
- build-portfolio-roadmap-strategy (direction defines the investment portfolio)
- prioritize-strategic-bets (direction identifies which bets align)
- define-strategic-positioning (direction informs where to play)

A good handoff includes:
- Strategic direction narrative
- Identified trajectory areas (grow, maintain, exit)
- Key choices made and rationale
- Open questions to resolve in planning

## Instructions
1. Identify the gap between current mission (today) and vision (desired future state).
2. Define the planning horizon — typically 2–4 years.
3. Identify the strategic trajectory: which product areas, user segments, or capabilities will expand, which will be maintained, and which will be deprioritized.
4. Articulate the 2–4 defining choices that shape the direction (what the product will lean into vs. what it will not pursue).
5. Connect choices to market trends, user needs, and competitive dynamics.
6. Describe what success looks like at the end of the horizon.
7. Flag major assumptions and open questions that could change the direction.

## Output
Provide:
- Strategic direction narrative (2–5 sentences)
- Planning horizon
- Trajectory map: grow / maintain / deprioritize areas
- Defining strategic choices (with rationale)
- Success picture at end of horizon
- Key assumptions
- Open questions or decision points ahead

## Risks / caveats
- Direction without trade-offs is not direction — identify what the product will not pursue
- Avoid confusing direction with roadmap — this is a narrative of intent, not a list of features
- If vision and mission conflict, surface the conflict rather than paper over it
- Revisit direction annually or after major market shifts
