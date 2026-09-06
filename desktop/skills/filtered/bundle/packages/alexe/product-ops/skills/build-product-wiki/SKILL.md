---
name: alexe-build-product-wiki
description: Design and populate a product knowledge base that preserves context, decisions, and institutional knowledge. Use this skill when a team loses time to repeated questions, onboarding gaps, or forgotten decisions.
metadata:
  source-name: build-product-wiki
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Build Product Wiki

## Purpose
Help teams design a product knowledge base that is actually used — organized around how teams work, not how information is created, and maintained through team habits rather than individual effort.

## Skill type
Conceptual skill

## Use this skill when
- New team members take too long to ramp up due to missing documentation
- Decisions get relitigated because the rationale was never recorded
- The same questions keep getting answered in Slack rather than documented
- Tooling has changed but process documentation hasn't caught up

## Do not use this skill when
- The goal is tooling selection alone (tooling is a means — structure comes first)
- The goal is sprint or delivery documentation (use plan-delivery-collaboration)

## Required inputs
- Team type and size
- Primary use cases for documentation (onboarding, decisions, process, templates)

## Optional inputs
- Current documentation state and tools
- Onboarding pain points
- Most common repeated questions
- Documentation owners or maintainers

## Upstream context
Works best when:
- Operating cadence and key processes are defined
- Team norms are established

## Downstream handoff
Output can feed:
- align-cross-team-communication (wiki is a shared context artifact)
- design-planning-process (planning templates go in the wiki)

## Instructions
1. Define the purpose of the wiki: what decisions or work does it support?
2. Design the top-level structure around how teams navigate, not how information is created.
3. Define the core content types: process guides, decision logs, templates, onboarding tracks, reference material.
4. Define content ownership and update responsibilities per section.
5. Design a "freshness" system: how do team members know if content is current?
6. Define what goes in the wiki vs. in tickets, Slack, or other tools.
7. Plan for maintenance: what happens at each planning cycle to review and update?

## Output
Provide:
- Wiki purpose and primary use cases
- Top-level structure (navigation design)
- Content types and their locations
- Content ownership map
- Freshness system (review dates, owner tags)
- Tool boundary definition (wiki vs. tickets vs. Slack vs. docs)
- Maintenance plan

## Risks / caveats
- A wiki that isn't navigable will be ignored — structure for findability, not completeness
- Content without clear owners goes stale — assign every section
- Don't document everything — document what is repeatedly needed and not in people's heads
