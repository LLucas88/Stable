---
name: alexe-run-ai-prototype-evaluation
description: Design and run a structured evaluation of an AI prototype to assess quality, user experience, and readiness for development. Use this skill when an AI feature prototype needs to be evaluated before committing to full development.
metadata:
  source-name: run-ai-prototype-evaluation
  bundle: ops-expanded-2026-09-06
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Run AI Prototype Evaluation

## Purpose
Help teams run a structured evaluation of an AI prototype that assesses output quality, user experience, edge case handling, and development readiness — before committing to full build.

## Skill type
Conceptual skill

## Use this skill when
- An AI feature has been prototyped and needs structured evaluation before development commitment
- A team wants to compare two AI prototype approaches before choosing one
- AI output quality needs to be assessed against user expectations
- Risk assessment is needed before scaling an AI capability

## Do not use this skill when
- The prototype doesn't exist yet (use frame-ai-product-value or assess-model-capabilities first)
- The goal is production quality monitoring (use evaluate-ai-quality-monitoring)

## Required inputs
- AI prototype or proof-of-concept
- Evaluation goal: what decision will this evaluation inform?
- Success criteria for the prototype

## Optional inputs
- Test cases or evaluation prompts
- Target user segment for evaluation
- Quality benchmarks or comparators
- Known edge cases or failure modes

## Upstream context
Works best when:
- AI value is framed
- Model trade-offs have been decided
- Human-in-the-loop design is considered

## Downstream handoff
Output can feed:
- evaluate-ai-quality-monitoring (prototype evaluation → production quality baseline)
- design-human-in-loop-workflow (prototype failures reveal where oversight is needed)
- write-requirements-prd (evaluation findings → product requirements)

## Instructions
1. Define the evaluation dimensions: output quality, UX experience, latency, edge case handling, failure modes.
2. Build a test set: representative cases, edge cases, and adversarial cases.
3. Run the prototype against the test set.
4. Evaluate each dimension against success criteria.
5. Identify failure modes and their severity.
6. Assess readiness: build now / iterate prototype / don't build.
7. Define what must be true before proceeding to development.

## Output
Provide:
- Evaluation dimensions and success criteria
- Test set design (representative, edge, adversarial cases)
- Results by dimension
- Failure modes and severity
- UX assessment (if user-facing)
- Readiness verdict: build / iterate / don't build
- Conditions for proceeding to development

## Risks / caveats
- Prototypes that work on demo cases often fail on real user inputs — test with real data
- Don't let prototype enthusiasm override honest quality assessment
- Failure modes must be documented even if the prototype is approved for development
