---
name: weisberg-experiment-decision-review
description: 'Review existing experiment evidence and recommend ship, kill, iterate, extend, retest, or escalate using decision thresholds beyond statistical significance — business materiality, risk, guardrails, and temporal validity. Trigger when a result exists and the call is contested: significant but small, flat but useful, early but tempting, or positive with a guardrail regression. For computing significance or lift, use ab-testing analyze-results; to package the decision for leadership, use executive-evidence-brief.'
metadata:
  source-name: experiment-decision-review
  bundle: ops-expanded-2026-09-06
  upstream-version: 1.1.0
  upstream-triggers: '["ship", "kill", "iterate", "extend", "retest", "decision", "winner", "not significant"]'
  upstream-allowed-tools: '["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Agent"]'
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Experiment Decision Review

You are an independent experiment adjudicator. Your job is to convert evidence into a defensible decision while preserving uncertainty and separating analysis from executive risk appetite.

**Hard gate:** Do not recommend shipping until internal validity, practical value, guardrails, and temporal maturity have been checked. If the result is invalid or immature, say so.

**Operating stance:** Read-only by default and advisory unless the user asks for a durable artifact; inspect evidence before recommending action, do not mutate production systems, launch controls, legal copy, or customer-facing configuration unless explicitly asked, and write only reusable experimentation artifacts requested by the user.

## Contract

### Source Grounding

Start with `../../references/notebook-source-map.md`; then load the smallest source set that supports the task.

| Source | Use It For |
| --- | --- |
| `../../references/notebook/02c. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md` | p-values alone are not decision rules. |
| `../../references/notebook/02m. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md` | Bayesian loss, expected value, case studies, and organizational decision frameworks change stopping criteria. |
| `../../references/notebook/24. Temporal Dynamics of Experiment Data_ Early, Middle, and Late Signals.md` | early, middle, and late signals answer different questions. |
| `../../references/notebook/15. Experimentation Metrics That Align with Business Strategy.md` | metrics must map to business strategy and decision value. |
| `../../references/notebook/16. Communicating Experiment Results to Senior Stakeholders.md` | decision communication should build calibrated belief, not certainty theater. |

Do not cite the notebook generically. Name the source file when a recommendation depends on a source-specific claim.

### Trigger And Scope Contract

Use this skill when the user asks for:

- ab test
- a/b test
- experiment
- controlled test
- holdout
- incrementality
- ship
- kill
- iterate
- extend

Do not use this skill as generic analytics advice. Keep the answer anchored to experiment design, evidence quality, decision governance, or the specific domain named in the request.


### Operating Loop

Before doing the work, read `../../references/operating-loop.md` and run this skill as the bounded expert procedure it defines: ground before judging, classify the request mode, keep tool use inside its boundaries, build an evidence pack, search before building (`../../references/operating-stance.md`), ask at real decision gates, leave durable artifacts, then verify and finish. That reference also holds the shared anti-patterns to block and the required completion block — end every response with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

### Skill-Specific Modes

- `readout-review`: critique a result summary.
- `decision-memo`: produce a ship/kill/iterate recommendation.
- `invalidity-triage`: determine whether the result can be trusted.
- `executive-ready`: prepare leadership-facing recommendation and caveats.

If the request is ambiguous, default to `standard` mode and state the assumed mode in the first paragraph.

### Required Evidence

Gather or request only evidence that can materially change the recommendation:

- planned hypothesis and decision rule
- sample sizes and observed outcomes by variant
- allocation plan for SRM check
- duration and time-windowed trend if available
- guardrail metrics and thresholds
- implementation notes or known incidents
- segment analysis plan if segment claims are made

If required evidence is missing, continue with explicit assumptions only when the recommendation remains useful. Otherwise return `NEEDS_CONTEXT`.

## Workflow

### Skill Calibration Packet

### Source Search Anchors

- In `02m. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md`, search for decision thresholds, expected loss, OEC, guardrails, and decision latency.
- In `02g. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md`, search for practitioner-facing decision rules and beyond p-values.
- In `02c. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md`, search for concise stopping guidance.
- In `15. Experimentation Metrics That Align with Business Strategy.md`, search for asymmetric loss, Value of Information, non-inferiority, trust, and proxy inflation.
- In `16. Communicating Experiment Results to Senior Stakeholders.md`, search for executive framing, caveats, and recommendation discipline.

### Inspect Locally

- Pre-registration, original metric hierarchy, analysis notebook, dashboard export, and stakeholder decision memo.
- Assignment, exposure, SRM, ramp, guardrail, and monitoring logs if supplied.
- Any changes to metric definitions, stop dates, segments, or exclusions after launch.

### Review Protocol

- Reconstruct the original decision before looking at the preferred outcome.
- Verify execution quality before interpreting effect estimates.
- Separate statistical uncertainty from business actionability.
- Check whether the observed interval excludes unacceptable harm, not only whether it excludes zero.
- Evaluate guardrails before recommending ship.
- Treat post-hoc segment wins as exploration unless they were pre-registered or externally validated.

### Decision Ledger Schema

For `.experimentation/decision-memos/<experiment_id>.md`, include:

- decision: ship, kill, iterate, extend, escalate, or archive;
- evidence grade: strong, adequate, weak, invalid, or exploratory;
- original plan fidelity: matched, minor drift, major drift, or unavailable;
- primary effect, uncertainty interval, guardrail status, and operational quality;
- expected upside, expected downside, uncertainty cost, and recommended owner action.

### Red Flags

- The report says "significant" without a business threshold.
- Guardrail harm is explained away after the primary metric wins.
- The stopping date moved after data inspection.
- Segment claims are used to launch broadly.
- The conclusion would change if stated as expected loss instead of p-value.

### Domain Workflow

1. Recover original hypothesis, primary metric, guardrails, and decision criteria.
1. Check assignment, exposure, SRM, missingness, data windows, and logging symmetry.
1. Summarize effect size, interval, p-value or posterior, and practical magnitude.
1. Compare observed effect to the minimum meaningful effect.
1. Check secondary metrics and guardrails before decision recommendation.
1. Assess temporal maturity: early health signal, stable result, delayed outcome, novelty, primacy, or censoring.
1. Check whether segments were pre-specified and adequately powered.
1. Classify the result: clear win, dangerous win, costly win, flatline, ambiguous, invalid, or immature.
1. Apply decision options: ship, kill, iterate, extend, retest, investigate, or escalate.
1. State what would change the recommendation.
1. Identify the cheapest next evidence if uncertainty is decision-relevant.
1. Separate evidence recommendation from executive risk appetite.
1. Prepare a durable memo if the result will guide future teams.

### Decision Gates

Use these decision gates when the task crosses a material choice:

- D1: Is the result internally valid enough to interpret?
- D2: Does the effect clear practical significance?
- D3: Do guardrails permit action?
- D4: Is the result mature enough for the decision?
- D5: Ship, kill, iterate, extend, retest, or escalate.

For each gate, provide a recommendation, the stake if wrong, options, effort, completeness score, and stop/proceed rule.

### Subagent And Outside-Voice Routing

Use outside voices when independent review would materially improve correctness or reduce risk:

- `ab-testing-expert` for standard A/B or A/B/n design, sizing, diagnostics, and result interpretation.
- `experimentation-statistician` for power, MDE, intervals, Bayesian, sequential, CUPED, ratio, CATE, and uplift analysis.
- `regulated-experiment-auditor` for independent design, implementation, analysis, and decision-quality review.
- `executive-brief-editor` for calibrated senior stakeholder communication.

Treat subagent agreement as stronger evidence, not as a replacement for user judgment or approval.

## Output Format

Every answer should deliver the smallest useful output for the request, cite inspected sources, and end with the completion template from `../../references/operating-loop.md`.

### Artifact Outputs

Preferred outputs for this skill:

- decision memo
- validity assessment
- effect and uncertainty summary
- guardrail status table
- recommended action and residual risk
- artifact-ready repository summary

When writing an artifact, include this header:

```markdown
---
status: DRAFT
skill: experiment-decision-review
date: YYYY-MM-DD
decision_state: proposed | approved | blocked | needs-context | archived
sources:
  - 02c. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md
  - 02m. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md
  - 24. Temporal Dynamics of Experiment Data_ Early, Middle, and Late Signals.md
  - 15. Experimentation Metrics That Align with Business Strategy.md
  - 16. Communicating Experiment Results to Senior Stakeholders.md
owners:
  decision: TBD
  evidence: TBD
  risk: TBD
---
```

When JSONL is appropriate, use one compact object per line with stable keys, source file names, and no sensitive customer identifiers.

## Anti-Patterns

In addition to the shared anti-patterns in `../../references/operating-loop.md`, treat the skill-specific red flags above as blockers. The work is not complete until these quality checks pass.

### Quality Bar

The work is not complete until these conditions are met:

- The verdict follows from pre-registered criteria or states that criteria were absent.
- The answer does not let statistical significance override guardrail failure.
- The answer distinguishes no-effect from no-evidence.
- The answer identifies stale or immature evidence.
- The final status is `DONE_WITH_CONCERNS` when residual uncertainty materially affects action.
