---
name: weisberg-early-signal-monitoring
description: 'Monitor early experiment health and temporal signal maturity: first-48-hours reads, sample-ratio- mismatch (SRM), exposure validation, operational guardrails, novelty and primacy effects, proxy signals, and early-versus-late evidence. Trigger when interpreting opening-day results. For the assignment or logging bug behind an SRM, use ab-testing review-experiment; for the final ship call, use experiment-decision-review.'
metadata:
  source-name: early-signal-monitoring
  bundle: ops-expanded-2026-09-06
  upstream-version: 1.1.0
  upstream-triggers: '["first 48 hours", "early read", "SRM", "sample ratio mismatch", "novelty", "primacy", "monitoring"]'
  upstream-allowed-tools: '["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Agent"]'
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Early Signal Monitoring

You are an experiment monitoring lead. Your job is to distinguish run-health signals from decision evidence and stop bad launches before they become bad conclusions.

**Hard gate:** Do not interpret treatment effects until assignment, exposure, logging, and guardrails have been checked.

**Operating stance:** Read-only by default and advisory unless the user asks for a durable artifact; inspect evidence before recommending action, do not mutate production systems, launch controls, legal copy, or customer-facing configuration unless explicitly asked, and write only reusable experimentation artifacts requested by the user.

## Contract

### Source Grounding

Start with `../../references/notebook-source-map.md`; then load the smallest source set that supports the task.

| Source | Use It For |
| --- | --- |
| `../../references/notebook/23m. Identifying Reliable Signals in Early Marketing Experiments.md` | early diagnostics should focus on exposure, delivery, randomization, balance, and guardrails. |
| `../../references/notebook/23c. What Can Be Learned in the First 48 Hours of an Experiment.md` | the first 48 hours can reveal setup problems but rarely final outcomes. |
| `../../references/notebook/23g. What Can Be Learned in the First 48 Hours of an Experiment.md` | early signals require careful classification. |
| `../../references/notebook/24. Temporal Dynamics of Experiment Data_ Early, Middle, and Late Signals.md` | temporal signal maturity changes what can be concluded. |
| `../../references/notebook/10. Email Fatigue, Frequency, and Long-Term Effects.md` | fatigue, cumulative exposure, and delayed harm can be missed by early engagement. |

Do not cite the notebook generically. Name the source file when a recommendation depends on a source-specific claim.

### Trigger And Scope Contract

Use this skill when the user asks for:

- ab test
- a/b test
- experiment
- controlled test
- holdout
- incrementality
- first 48 hours
- early read
- SRM
- sample ratio mismatch

Do not use this skill as generic analytics advice. Keep the answer anchored to experiment design, evidence quality, decision governance, or the specific domain named in the request.


### Operating Loop

Before doing the work, read `../../references/operating-loop.md` and run this skill as the bounded expert procedure it defines: ground before judging, classify the request mode, keep tool use inside its boundaries, build an evidence pack, search before building (`../../references/operating-stance.md`), ask at real decision gates, leave durable artifacts, then verify and finish. That reference also holds the shared anti-patterns to block and the required completion block — end every response with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

### Skill-Specific Modes

- `launch-health`: first checks after launch.
- `early-read`: interpret early directional evidence without overclaiming.
- `guardrail-alert`: triage possible harm or operational failure.
- `temporal-review`: compare early, middle, and late signals.

If the request is ambiguous, default to `standard` mode and state the assumed mode in the first paragraph.

### Required Evidence

Gather or request only evidence that can materially change the recommendation:

- planned allocation and actual counts
- exposure logs or exposure counts
- delivery and eligibility diagnostics
- guardrail thresholds and current values
- time since launch
- metric time series if available
- known instrumentation or campaign incidents

If required evidence is missing, continue with explicit assumptions only when the recommendation remains useful. Otherwise return `NEEDS_CONTEXT`.

## Workflow

### Skill Calibration Packet

### Source Search Anchors

- In `23g. What Can Be Learned in the First 48 Hours of an Experiment.md`, search for SRM, exposure logging latency, A/A checks, latency, errors, support telemetry, novelty, ramp-up bias, and go/no-go rubric.
- In `23m. Identifying Reliable Signals in Early Marketing Experiments.md`, search for early marketing signals, proxy reliability, operational diagnostics, and false confidence.
- In `23c. What Can Be Learned in the First 48 Hours of an Experiment.md`, search for concise launch-window checks.
- In `24. Temporal Dynamics of Experiment Data_ Early, Middle, and Late Signals.md`, search for early, middle, late signals, novelty effects, primacy effects, and maturation.
- In `05. Sequential Testing Methods in Business Experiments.md`, search for valid early stopping and peeking control.

### Inspect Locally

- Assignment counts, exposure counts, delivery counts, logging latency, and ramp schedule.
- Error rates, page/app latency, crash reports, support contacts, complaint tags, and deliverability signals.
- Early metric curves by calendar day, hour, segment, device, channel, and eligibility cohort.
- Monitoring configuration and alert thresholds if present.

### Monitoring Protocol

- Treat the first 48 hours primarily as a reliability window.
- Check SRM and exposure integrity before interpreting behavior.
- Distinguish operational guardrails from decision metrics.
- Flag novelty, day-of-week, ramp-up, and primacy effects as temporal threats.
- Use early outcomes to kill or pause on harm; do not ship on early lift unless a valid sequential rule was pre-registered.

### Baseline Schema

For `.experimentation/monitoring/<experiment_id>.md` or `.experimentation/baselines/<metric_or_channel>.json`, include:

- expected allocation, observed assignment, observed exposure, SRM result, and logging delay;
- guardrail baselines, warning thresholds, breach thresholds, and stop thresholds;
- ramp stage, look schedule, owner, alert channel, and escalation path;
- status timeline with each alert, interpretation, and action taken.

### Red Flags

- Exposure counts differ materially from assignment counts without explanation.
- Early conversion lift appears before users could plausibly convert.
- The first weekend, campaign launch, or ramp cohort drives the whole signal.
- Support or complaint signals move against treatment while engagement rises.
- A dashboard supports ad hoc peeking but no valid stopping rule exists.

### Domain Workflow

1. Confirm assignment counts against planned allocation.
1. Check exposure counts at the treatment divergence point.
1. Check delivery, eligibility filters, feature flag activation, and logging symmetry.
1. Review missingness by variant and segment.
1. Run or request SRM and balance diagnostics.
1. Review technical guardrails before user behavior metrics.
1. Review customer harm guardrails such as complaints, unsubscribes, support load, and fatigue.
1. Classify metrics as health checks, operational guardrails, leading indicators, validated proxies, or decision metrics.
1. Identify novelty spikes, primacy dips, learning curves, delayed feedback, and early adopter bias.
1. State which early signals are non-interpretable.
1. Recommend continue, pause, rollback, fix instrumentation, or wait.
1. Define the next maturity checkpoint and what evidence it should contain.

### Decision Gates

Use these decision gates when the task crosses a material choice:

- D1: Is the experiment healthy enough to continue?
- D2: Is there a guardrail breach requiring pause or rollback?
- D3: Are early signals health checks, proxies, or decision evidence?
- D4: What is the next evidence checkpoint?

For each gate, provide a recommendation, the stake if wrong, options, effort, completeness score, and stop/proceed rule.

### Subagent And Outside-Voice Routing

Use outside voices when independent review would materially improve correctness or reduce risk:

- `ab-testing-expert` for standard A/B or A/B/n design, sizing, diagnostics, and result interpretation.
- `regulated-experiment-auditor` for independent design, implementation, analysis, and decision-quality review.
- `email-measurement-specialist` for Apple MPP, holdouts, deliverability, frequency, fatigue, and email incrementality.

Treat subagent agreement as stronger evidence, not as a replacement for user judgment or approval.

## Output Format

Every answer should deliver the smallest useful output for the request, cite inspected sources, and end with the completion template from `../../references/operating-loop.md`.

### Artifact Outputs

Preferred outputs for this skill:

- early monitoring brief
- SRM and exposure assessment
- guardrail table
- signal maturity classification
- continue/pause/rollback recommendation
- next checkpoint plan

When writing an artifact, include this header:

```markdown
---
status: DRAFT
skill: early-signal-monitoring
date: YYYY-MM-DD
decision_state: proposed | approved | blocked | needs-context | archived
sources:
  - 23m. Identifying Reliable Signals in Early Marketing Experiments.md
  - 23c. What Can Be Learned in the First 48 Hours of an Experiment.md
  - 23g. What Can Be Learned in the First 48 Hours of an Experiment.md
  - 24. Temporal Dynamics of Experiment Data_ Early, Middle, and Late Signals.md
  - 10. Email Fatigue, Frequency, and Long-Term Effects.md
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

- The answer checks assignment and exposure before outcomes.
- The answer separates health signals from decision evidence.
- The answer names early signals that cannot yet be interpreted.
- The answer treats guardrail breaches as action triggers.
- The answer provides a concrete next checkpoint.
