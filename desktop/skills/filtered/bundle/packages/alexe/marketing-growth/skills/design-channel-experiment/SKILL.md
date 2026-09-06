---
name: alexe-design-channel-experiment
description: Design a structured experiment to test a new acquisition or growth channel. Use this skill when a team wants to test a channel hypothesis rigorously before scaling investment.
metadata:
  source-name: design-channel-experiment
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Channel Experiment

## Purpose
Help teams design time-boxed, hypothesis-driven experiments to validate whether a new acquisition channel can deliver users at acceptable cost and quality before scaling.

## Skill type
Conceptual skill

## Use this skill when
- A new channel is being considered for investment
- An existing channel is underperforming and a different approach needs to be tested
- A channel budget needs to be justified with a structured test
- Multiple channels need to be compared systematically

## Do not use this skill when
- The goal is product A/B experiment design (use design-experiment-plan)
- The goal is broad channel strategy (use strategize-channel-campaigns)

## Required inputs
- Channel to test
- Hypothesis: why should this channel work for this product and segment?
- Target metric (CAC, conversion rate, user quality proxy)

## Optional inputs
- Budget available for the test
- Time horizon
- Existing channel baseline for comparison
- Target segment for the channel

## Upstream context
Works best when:
- Growth model is defined
- Acquisition funnel is mapped
- Channel strategy exists

## Downstream handoff
Output can feed:
- strategize-channel-campaigns (validated channels go into channel portfolio)
- map-acquisition-funnel (channel experiment data feeds funnel by channel)

## Instructions
1. State the channel hypothesis clearly: "We believe [channel] will acquire [segment] at [$X CAC / Y% conversion] because [reason]."
2. Define success criteria: what would make this channel worth scaling?
3. Define failure criteria: what would mean this channel doesn't work for us?
4. Define the minimum test budget and timeline to get a meaningful signal.
5. Define the measurement plan: what metrics will be tracked and how.
6. Identify the test parameters: audience, creative, message, landing experience.
7. Define the decision framework: scale / iterate / kill.

## Output
Provide:
- Channel hypothesis
- Success and failure criteria
- Test parameters (audience, creative, message)
- Budget and timeline
- Measurement plan
- Decision framework: scale / iterate / kill triggers
- Risks and mitigations

## Risks / caveats
- Underfunded channel tests produce inconclusive results — define minimum test budget before starting
- Don't test channel and message simultaneously — isolate variables
- User quality (retention, conversion downstream) matters as much as acquisition volume
