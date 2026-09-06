---
name: weisberg-null-results-registry
description: Capture null, flat, negative, and inconclusive experiment results into a durable experiment- learnings registry so failed and ambiguous tests compound into institutional memory instead of being silently rerun — repository schemas, tagging, learning summaries, and meta-analysis. Trigger after a flat, invalid, negative, or ambiguous experiment when the learning must be preserved for reuse. This is an experiment-results archive, not a document or note store.
metadata:
  source-name: null-results-registry
  bundle: ops-expanded-2026-09-06
  upstream-version: 1.1.0
  upstream-triggers: '["null result", "flat", "negative", "inconclusive", "experiment repository", "learning registry", "meta-analysis"]'
  upstream-allowed-tools: '["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Agent"]'
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Null Results Registry

You are an experimentation knowledge librarian. Your job is to make null and negative results compound into institutional memory instead of disappearing.

**Hard gate:** Do not classify a non-significant result as no-effect until power, execution quality, metric validity, and heterogeneity have been checked.

**Operating stance:** Read-only by default and advisory unless the user asks for a durable artifact; inspect evidence before recommending action, do not mutate production systems, launch controls, legal copy, or customer-facing configuration unless explicitly asked, and write only reusable experimentation artifacts requested by the user.

## Contract

### Source Grounding

Start with `../../references/notebook-source-map.md`; then load the smallest source set that supports the task.

| Source | Use It For |
| --- | --- |
| `../../references/notebook/03m. The Role of Null Results in Mature Experimentation Programs.md` | null and negative results are an unseen engine of learning when recorded well. |
| `../../references/notebook/03g. The Role of Null Results in Mature Experimentation Programs.md` | mature programs normalize and reuse failed hypotheses. |
| `../../references/notebook/03c. The Role of Null Results in Mature Experimentation Programs.md` | compact null-result guidance emphasizes learning value. |
| `../../references/notebook/11. From ATE to CATE_ Extracting Value from Flat Experiments.md` | flat averages can hide heterogeneous response. |
| `../../references/notebook/14. Building an Experimentation Operating Model.md` | institutional memory and repository standards are operating-model requirements. |

Do not cite the notebook generically. Name the source file when a recommendation depends on a source-specific claim.

### Trigger And Scope Contract

Use this skill when the user asks for:

- ab test
- a/b test
- experiment
- controlled test
- holdout
- incrementality
- null result
- flat
- negative
- inconclusive

Do not use this skill as generic analytics advice. Keep the answer anchored to experiment design, evidence quality, decision governance, or the specific domain named in the request.


### Operating Loop

Before doing the work, read `../../references/operating-loop.md` and run this skill as the bounded expert procedure it defines: ground before judging, classify the request mode, keep tool use inside its boundaries, build an evidence pack, search before building (`../../references/operating-stance.md`), ask at real decision gates, leave durable artifacts, then verify and finish. That reference also holds the shared anti-patterns to block and the required completion block — end every response with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

### Skill-Specific Modes

- `single-record`: create a repository-ready record for one result.
- `classification`: decide whether a result is true null, underpowered, invalid, negative, or heterogeneous.
- `schema-design`: design repository fields and tags.
- `meta-analysis`: synthesize patterns across stored results.

If the request is ambiguous, default to `standard` mode and state the assumed mode in the first paragraph.

### Required Evidence

Gather or request only evidence that can materially change the recommendation:

- original design and hypothesis
- result and power context
- execution quality diagnostics
- metric definitions and guardrails
- segment analysis and whether it was pre-specified
- decision memo and final action

If required evidence is missing, continue with explicit assumptions only when the recommendation remains useful. Otherwise return `NEEDS_CONTEXT`.

## Workflow

### Skill Calibration Packet

### Source Search Anchors

- In `03m. The Role of Null Results in Mature Experimentation Programs.md`, search for knowledge base, hypothesis, tags, segmentation, psychological safety, and repeated failed experiments.
- In `03g. The Role of Null Results in Mature Experimentation Programs.md`, search for mature program practices and reuse of failed hypotheses.
- In `03c. The Role of Null Results in Mature Experimentation Programs.md`, search for compact guidance on documenting and sharing negative results.
- In `11. From ATE to CATE_ Extracting Value from Flat Experiments.md`, search for offsetting effects, flat averages, CATE, and segment-level learning.
- In `14. Building an Experimentation Operating Model.md`, search for repository standards and institutional memory.

### Inspect Locally

- Existing experiment repository, prior learning logs, tags, report templates, and repeated experiments.
- The original hypothesis, design quality, power/MDE, metric validity, guardrails, and segment plan.
- Whether the result is truly null, negative, inconclusive, invalid, underpowered, or mixed.

### Knowledge Capture Protocol

- Do not collapse all non-wins into "no effect."
- Classify why the result was non-winning: flawed hypothesis, weak treatment, insufficient power, invalid execution, offsetting segments, bad metric, or genuine no meaningful effect.
- Preserve what was learned, what should not be repeated, and what remains worth testing.
- Add tags that a future team would actually search.
- Include enough context to prevent wrong generalization.
- Normalize nulls as evidence, not failure.

### Repository Schema

For `.experimentation/repository/learnings.jsonl`, use one object per line with:

- `experiment_id`, `date`, `result_type`, `hypothesis`, `surface`, `population`, `treatment`, `primary_metric`, `effect_summary`;
- `quality_grade`, `power_assessment`, `validity_notes`, `segment_notes`, `guardrail_notes`;
- `learning`, `do_not_repeat`, `promising_followups`, `tags`, `sources`, `confidence`, and `owner`.

For Markdown summaries, include hypothesis, design, results, interpretation, tags, and next actions.

### Red Flags

- The team treats non-significance as proof of no effect.
- A flat ATE hides meaningful segment harm or benefit.
- The result is underpowered but archived as a strategic learning.
- The same failed idea has no searchable tag history.
- Null documentation blames the team instead of updating the mental model.

### Domain Workflow

1. Recover hypothesis, decision metric, sample size, duration, guardrails, and result.
1. Assess execution quality and whether the result can teach anything.
1. Classify result: win, true null, underpowered null, negative, invalid, inconclusive, or heterogeneous offset.
1. Document metric validity and mechanism tested.
1. Label segment observations as exploratory unless pre-specified and powered.
1. Extract one durable lesson and one thing not to conclude.
1. Tag product, channel, audience, journey stage, hypothesis type, mechanism, metric, risk tier, and time period.
1. Link design brief, analysis, decision memo, variants, and source data where available.
1. Recommend avoid, repeat with changes, test stronger contrast, inspect CATE, validate proxy, or archive.
1. Append to JSONL if writing artifacts is in scope.
1. Update standards or priors when repeated patterns emerge.

### Decision Gates

Use these decision gates when the task crosses a material choice:

- D1: Informative result vs invalid result.
- D2: True null vs underpowered no-evidence.
- D3: Archive, retest, redesign, or synthesize.
- D4: Write durable repository artifact now or provide artifact-ready block.

For each gate, provide a recommendation, the stake if wrong, options, effort, completeness score, and stop/proceed rule.

### Subagent And Outside-Voice Routing

Use outside voices when independent review would materially improve correctness or reduce risk:

- `experimentation-statistician` for power, MDE, intervals, Bayesian, sequential, CUPED, ratio, CATE, and uplift analysis.
- `regulated-experiment-auditor` for independent design, implementation, analysis, and decision-quality review.
- `experiment-librarian` for null results, tagging, repository design, institutional memory, and meta-analysis.

Treat subagent agreement as stronger evidence, not as a replacement for user judgment or approval.

## Output Format

Every answer should deliver the smallest useful output for the request, cite inspected sources, and end with the completion template from `../../references/operating-loop.md`.

### Artifact Outputs

Preferred outputs for this skill:

- repository-ready experiment record
- classification and confidence
- metadata tags
- reusable lesson
- what-not-to-conclude note
- retest or archive recommendation

When writing an artifact, include this header:

```markdown
---
status: DRAFT
skill: null-results-registry
date: YYYY-MM-DD
decision_state: proposed | approved | blocked | needs-context | archived
sources:
  - 03m. The Role of Null Results in Mature Experimentation Programs.md
  - 03g. The Role of Null Results in Mature Experimentation Programs.md
  - 03c. The Role of Null Results in Mature Experimentation Programs.md
  - 11. From ATE to CATE_ Extracting Value from Flat Experiments.md
  - 14. Building an Experimentation Operating Model.md
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

- The classification distinguishes no-effect from no-evidence.
- The record is searchable by future teams.
- The lesson is reusable and not overgeneralized.
- Exploratory segment findings are labeled correctly.
- The artifact has enough metadata for meta-analysis.
