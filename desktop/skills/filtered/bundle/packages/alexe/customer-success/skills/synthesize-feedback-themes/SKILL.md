---
name: alexe-synthesize-feedback-themes
description: Synthesize large volumes of customer feedback into structured themes and actionable product signals. Use this skill when feedback has been collected and needs to be organized into patterns that inform product decisions.
metadata:
  source-name: synthesize-feedback-themes
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Synthesize Feedback Themes

## Purpose
Help teams turn high-volume, unstructured customer feedback (surveys, support tickets, reviews, interviews) into a structured set of themes that can be prioritized and acted on.

## Skill type
Conceptual skill

## Use this skill when
- A large volume of feedback exists but hasn't been organized into patterns
- Customer support, surveys, and review data need to be unified
- A feedback synthesis is needed before a roadmap planning cycle
- Product decisions need to be grounded in customer voice

## Do not use this skill when
- Feedback hasn't been collected yet (collect it first)
- The goal is individual account management (this is population-level synthesis)

## Required inputs
- Feedback sources and rough volume
- Synthesis goal: what decisions will this inform?

## Optional inputs
- Raw feedback data or samples
- Segment breakdown of feedback sources
- Prior synthesis for comparison
- Product area focus

## Upstream context
Works best when:
- Multiple feedback channels are active
- VoC program is running

## Downstream handoff
Output can feed:
- triage-feedback-loop (themes → triage and routing decisions)
- identify-problem-opportunity (themes → opportunity framing)
- build-roadmap-prioritization (themes → roadmap inputs)

## Instructions
1. Collect all feedback sources: support tickets, survey responses, review sites, interviews, NPS verbatims.
2. Read a sample across all sources to calibrate.
3. Code feedback by theme: functional issues, emotional signals, feature requests, praise, competitive mentions.
4. Quantify themes: what percentage of feedback touches each theme?
5. Segment by customer type if data allows.
6. Identify the top 5–8 themes with supporting evidence.
7. Separate what customers say from what they need (interpret, don't just quote).

## Output
Provide:
- Feedback source inventory (channels, volume, date range)
- Theme set (5–8 themes)
- Each theme: description, frequency/volume, representative quotes, customer segment breakdown
- Top themes by volume
- Themes that are high-emotion (even if lower volume)
- Implicit needs (what customers are expressing that they haven't said directly)
- Recommended actions per theme

## Risks / caveats
- Loudest feedback is not most representative — vocal minority bias is real
- Feature requests are often symptoms of deeper problems — interpret the need, not the request
- Synthesis without segment breakdown obscures important differences between customer types
