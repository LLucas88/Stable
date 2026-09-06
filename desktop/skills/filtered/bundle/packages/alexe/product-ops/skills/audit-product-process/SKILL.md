---
name: alexe-audit-product-process
description: Audit the current state of product processes to identify bottlenecks, inconsistencies, and improvement opportunities. Use this skill when a product team wants to understand where their operating model is breaking down.
metadata:
  source-name: audit-product-process
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Audit Product Process

## Purpose
Help teams run a structured audit of their product processes to surface bottlenecks, waste, and misalignment — and prioritize improvements that will have the most impact on team effectiveness.

## Skill type
Conceptual skill

## Use this skill when
- The team feels consistently behind or overloaded without clear cause
- Process problems are suspected but not pinpointed
- A team is scaling and existing processes are breaking under load
- A new leader is joining and wants to understand the current operating model

## Do not use this skill when
- The goal is designing a new process (use design-planning-process or design-operating-cadence)
- The goal is a single-process improvement (identify the process first, then design)

## Required inputs
- Team type and size
- Processes to audit (even rough: "our planning, our spec process, our launch process")

## Optional inputs
- Team pain points or frustrations
- Recent failures or near-misses with process as a factor
- Existing process documentation
- Cross-functional inputs on friction with the product team

## Upstream context
Works best when:
- Current state of processes is at least roughly known
- Team has operated for at least one cycle

## Downstream handoff
Output can feed:
- design-planning-process
- design-operating-cadence
- automate-workflow-governance

## Instructions
1. Identify all core product processes (discovery, planning, execution, launch, etc.).
2. For each process: assess existence (is it documented?), consistency (is it followed?), and effectiveness (does it produce the right outcomes?).
3. Identify the biggest pain points per process.
4. Classify issues: missing process / inconsistent execution / wrong design / right design but not followed.
5. Identify cross-functional friction points where the product team's process creates problems for others.
6. Prioritize improvements by impact on team effectiveness.

## Output
Provide:
- Process inventory
- Assessment per process: existence / consistency / effectiveness
- Pain points by process
- Issue classification
- Cross-functional friction points
- Priority improvement list with rationale
- Quick wins (can be improved immediately) vs. structural changes (require redesign)

## Risks / caveats
- Process audits can become blame sessions — focus on systems, not individuals
- Don't audit and report without a clear owner and timeline for improvement
- Some process "problems" are people or strategy problems in disguise — distinguish them
