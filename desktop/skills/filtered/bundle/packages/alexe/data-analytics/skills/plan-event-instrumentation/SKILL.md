---
name: alexe-plan-event-instrumentation
description: Plan the event tracking and instrumentation needed to measure product behavior and support analytics. Use this skill when a feature is being built and the analytics implementation needs to be defined before development.
metadata:
  source-name: plan-event-instrumentation
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Plan Event Instrumentation

## Purpose
Help teams define the event tracking plan for a product area — what user actions to instrument, what properties to capture, and what decisions the data will support.

## Skill type
Conceptual skill

## Use this skill when
- A feature is being built and analytics instrumentation needs to be defined
- Existing tracking is inconsistent or missing key events
- A metrics framework has been defined but instrumentation hasn't been planned
- Analytics debt has accumulated and a tracking audit is needed

## Do not use this skill when
- Metrics framework hasn't been defined yet (use design-product-metrics first)
- The goal is dashboard design (use build-decision-dashboard)

## Required inputs
- Feature or product area to instrument
- Key metrics or decisions the tracking should support

## Optional inputs
- Existing tracking schema or event taxonomy
- Analytics tooling (Mixpanel, Amplitude, Segment, etc.)
- Engineering constraints on instrumentation

## Upstream context
Works best when:
- Metrics framework is defined
- Feature requirements are written

## Downstream handoff
Output can feed:
- build-decision-dashboard (instrumented events feed dashboard)
- analyze-funnel-retention-cohorts (events enable funnel and cohort analysis)

## Instructions
1. Map the user actions in the feature that are worth tracking.
2. For each action, define: event name, trigger condition, and required properties.
3. Follow a consistent naming convention (e.g., object_action format).
4. Define which properties to capture per event (user ID, session, feature context, etc.).
5. Identify funnel entry and exit events.
6. Define identity and session tracking requirements.
7. Review for coverage: are all key metrics measurable with the planned events?

## Output
Provide:
- Event tracking plan (event name, trigger, properties)
- Naming convention and taxonomy
- Funnel events identified
- Identity and session tracking approach
- Coverage check: metrics vs. planned events
- Engineering implementation notes
- Events not covered and why

## Risks / caveats
- Instrumentation planned after shipping creates analytics debt — plan before development
- Over-tracking creates noise and storage costs — focus on decision-relevant events
- Property naming inconsistency across events creates analysis friction
