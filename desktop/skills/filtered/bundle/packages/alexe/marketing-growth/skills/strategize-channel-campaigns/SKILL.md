---
name: alexe-strategize-channel-campaigns
description: Develop a channel strategy and campaign experimentation plan to test and scale acquisition and growth. Use this skill when a team needs to determine which channels to invest in and how to test them.
metadata:
  source-name: strategize-channel-campaigns
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Strategize Channel & Campaigns

## Purpose
Help teams design a structured channel strategy and experimental approach to acquiring and growing their user base.

## Skill type
Conceptual skill

## Use this skill when
- A team is unclear which acquisition channels to invest in
- An existing channel is underperforming and needs a campaign refresh
- New channels need to be tested systematically
- Growth relies on one channel and diversification is needed

## Do not use this skill when
- The goal is lifecycle engagement (use plan-lifecycle-engagement)
- The goal is product-side conversion optimization (use optimize-conversion-growth-loops)

## Required inputs
- Product type and target audience
- Current channels and performance (rough)

## Optional inputs
- Budget range
- CAC target
- Competitive channel landscape
- Prior campaign experiments

## Upstream context
Works best when:
- Growth model is defined
- Target segment and ICP are clear
- Baseline CAC and conversion data exist

## Downstream handoff
Output can feed:
- design-growth-model (channel data feeds growth model)
- optimize-conversion-growth-loops (traffic from channels needs to convert)

## Instructions
1. Map current channel portfolio and performance.
2. Assess channel-market fit: is this channel right for this audience?
3. Identify channel gaps or over-concentration risks.
4. Design a channel experimentation plan: channels to test, hypotheses, success criteria.
5. Recommend channel prioritization based on potential and fit.
6. Define monitoring and optimization cadence.

## Output
Provide:
- Current channel assessment
- Channel-market fit evaluation
- Channel portfolio gaps and risks
- Experimentation plan (channels to test, hypotheses, success criteria)
- Recommended channel prioritization
- Budget allocation principles (not specific amounts without data)
- Monitoring cadence

## Risks / caveats
- Don't scale a channel before proving unit economics at small scale
- Attribution models are imperfect — build in uncertainty
- Over-investing in one channel creates fragility — diversify when possible
