---
name: alexe-assess-experience-quality
description: Evaluate the quality of a user experience and identify friction, confusion, or drop-off patterns. Use this skill when a team needs a structured assessment of experience quality in an existing product flow.
metadata:
  source-name: assess-experience-quality
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Assess Experience Quality

## Purpose
Provide a structured quality assessment of a product experience to identify where users struggle, drop off, or get confused.

## Skill type
Conceptual skill with diagnostic output

## Use this skill when
- A flow has high drop-off or low completion rates
- User feedback consistently mentions confusion or friction in a specific area
- A design review needs structured quality criteria
- A product area hasn't been assessed since initial launch

## Do not use this skill when
- The goal is running a usability study (use run-usability-testing)
- No data or user feedback is available to ground the assessment

## Required inputs
- Product flow or feature to assess
- Available signals: analytics data, user feedback, support tickets, or usability observations

## Optional inputs
- Baseline metrics (completion rate, time-on-task, error rate)
- Prior usability test findings
- Design heuristics to apply

## Upstream context
Works best when:
- Usage data or qualitative feedback exists
- UX research findings are available

## If upstream context is missing
Produce a heuristic assessment framework and flag that data-based assessment requires actual signals.

## Downstream handoff
Output can feed:
- manage-design-handoff (issues to address in next design iteration)
- run-usability-testing (validate fixes)
- formulate-experiment-hypothesis (test experience improvements)

## Instructions
1. Map the flow being assessed step by step.
2. Apply experience quality criteria: discoverability, clarity, efficiency, error recovery, trust.
3. Identify friction points with supporting evidence.
4. Assess severity: critical (blocks task) / major (causes confusion) / minor (annoyance).
5. Identify quick wins vs. structural issues.
6. Recommend specific improvements.

## Output
Provide:
- Flow map with quality assessment per step
- Friction points by severity
- Heuristic violations (if applicable)
- Quick wins and structural improvements
- Metrics impact estimation (qualitative)
- Confidence level in the assessment (evidence-based or heuristic-only)

## Risks / caveats
- Heuristic assessment is a starting point, not a substitute for user observation
- Do not overstate severity — not all friction is a critical issue
- Distinguish between aesthetic issues and usability/task-completion issues
