---
name: alexe-evaluate-ai-quality-monitoring
description: Define quality criteria for AI features and set up monitoring, evaluation, and iteration loops. Use this skill when a team needs to ensure their AI feature maintains acceptable quality in production.
metadata:
  source-name: evaluate-ai-quality-monitoring
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Evaluate AI Quality & Monitoring

## Purpose
Help teams define quality standards for AI-powered features and design monitoring and evaluation systems that detect degradation and support continuous improvement.

## Skill type
Conceptual skill

## Use this skill when
- An AI feature is going into production and needs quality monitoring
- AI output quality has degraded and needs diagnosis
- Quality criteria for an AI feature are undefined
- An evaluation framework is needed for iterating on AI features

## Do not use this skill when
- The goal is model selection (use assess-model-capabilities)
- The goal is AI feature ideation (use ideate-ai-features)

## Required inputs
- AI feature description and expected output
- User-facing quality implications (what does "bad" look like to users?)

## Optional inputs
- Model being used
- Current quality data or error samples
- Regulatory or compliance requirements
- Evaluation dataset availability

## Upstream context
Works best when:
- AI feature is deployed or in late-stage development
- Human-in-the-loop design is defined

## Downstream handoff
Output can feed:
- detect-performance-signals (AI quality signals feed product monitoring)
- design-experiment-plan (improve AI quality through experiments)

## Instructions
1. Define the quality dimensions relevant to this AI feature (accuracy, relevance, safety, tone, etc.).
2. Define quality thresholds: acceptable / needs review / unacceptable.
3. Design evaluation methodology: human eval, automated metrics, golden set.
4. Design monitoring: what signals indicate quality degradation?
5. Define alerting and escalation for quality failures.
6. Design the iteration loop: how do quality findings drive model/prompt/data improvements?

## Output
Provide:
- Quality dimensions and definitions
- Quality thresholds
- Evaluation methodology
- Monitoring plan (signals, frequency, tooling)
- Alerting and escalation design
- Iteration loop: from finding to fix
- Open questions and risks

## Risks / caveats
- Automated metrics rarely capture full quality — always include human evaluation
- Quality thresholds that are never enforced create false confidence
- AI quality degrades over time as the world changes — monitoring must be continuous
