---
name: alexe-design-customer-feedback-survey
description: Design a customer feedback survey that generates reliable, actionable data. Use this skill when a team needs to collect structured feedback at scale without the bias and noise that comes from poorly designed surveys.
metadata:
  source-name: design-customer-feedback-survey
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Design Customer Feedback Survey

## Purpose
Help teams design surveys that generate valid, reliable feedback — avoiding common biases, measuring the right things, and producing data that can drive decisions.

## Skill type
Conceptual skill

## Use this skill when
- A team needs to measure user satisfaction, NPS, CSAT, or feature feedback at scale
- A survey exists but produces low response rates or uninformative data
- A new product or feature launch needs a feedback collection mechanism
- Periodic customer feedback needs to be standardized

## Do not use this skill when
- The goal is qualitative depth (use run-user-interviews instead of a survey)
- The goal is synthesizing already-collected feedback (use synthesize-feedback-themes)

## Required inputs
- Survey goal: what decision will this survey inform?
- Target respondents

## Optional inputs
- Prior survey designs or results
- Feedback frequency requirements
- Tooling constraints (Typeform, Google Forms, in-app survey tool)
- Regulatory constraints on data collection

## Upstream context
Works best when:
- VoC program is defined
- Key feedback questions are known

## Downstream handoff
Output can feed:
- synthesize-feedback-themes (survey responses → theme synthesis)
- monitor-adoption-health (satisfaction metrics → health score input)
- detect-performance-signals (survey scores → performance signals)

## Instructions
1. Define the one primary question this survey must answer.
2. Select the appropriate survey type: NPS, CSAT, CES, feature satisfaction, or custom.
3. Design survey questions: start with broad, then specific; close-ended before open-ended.
4. Write each question to be unambiguous, unbiased, and answerable.
5. Keep the survey to 5 questions or fewer for any single session.
6. Define distribution: in-app trigger, email, post-interaction.
7. Define analysis plan before launching.

## Output
Provide:
- Primary survey question
- Survey type and rationale
- Question set (5 or fewer)
- Question quality review (bias check)
- Distribution plan and trigger logic
- Expected response rate and sample size
- Analysis plan

## Risks / caveats
- Leading questions produce useless data — review each question for bias
- Surveys longer than 5 questions have dramatically lower completion rates
- Don't survey without knowing how you'll use the data
