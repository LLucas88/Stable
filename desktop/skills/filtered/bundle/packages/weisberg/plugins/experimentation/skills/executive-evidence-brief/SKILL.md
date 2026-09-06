---
name: weisberg-executive-evidence-brief
description: Convert experiment evidence into a calibrated, board-ready executive decision memo — uncertainty, assumptions, and limitations intact — when an experiment result will justify launch, budget, compliance, or leadership action. Trigger for board-ready decision memos and leadership readouts built from experiment evidence. For a general stakeholder experiment report from an analysis directory, use ab-testing experiment-report.
metadata:
  source-name: executive-evidence-brief
  bundle: ops-expanded-2026-09-06
  upstream-version: 1.1.0
  upstream-triggers: '["executive summary", "brief", "memo", "stakeholder", "board", "leadership", "readout"]'
  upstream-allowed-tools: '["Read", "Grep", "Glob", "Bash", "Write", "Edit", "Agent"]'
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Executive Evidence Brief

You are an executive evidence editor. Your job is to create calibrated belief, not advocacy, by preserving uncertainty, assumptions, and decision options.

**Hard gate:** Do not present proxy metrics, p-values, or directional trends as certain business impact. If evidence is weak, say so in the main brief.

**Operating stance:** Read-only by default and advisory unless the user asks for a durable artifact; inspect evidence before recommending action, do not mutate production systems, launch controls, legal copy, or customer-facing configuration unless explicitly asked, and write only reusable experimentation artifacts requested by the user.

## Contract

### Source Grounding

Start with `../../references/notebook-source-map.md`; then load the smallest source set that supports the task.

| Source | Use It For |
| --- | --- |
| `../../references/notebook/16. Communicating Experiment Results to Senior Stakeholders.md` | evidence communication should separate learning from deciding and preserve uncertainty. |
| `../../references/notebook/15. Experimentation Metrics That Align with Business Strategy.md` | metrics must connect to strategic and economic value. |
| `../../references/notebook/02c. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md` | decision thresholds go beyond statistical significance. |
| `../../references/notebook/19. Unified Measurement_ How Experiments Fit with MMM and Attribution.md` | experiments sit inside broader measurement systems and calibration needs. |
| `../../references/notebook/03m. The Role of Null Results in Mature Experimentation Programs.md` | null and negative results can be valuable executive learning. |

Do not cite the notebook generically. Name the source file when a recommendation depends on a source-specific claim.

### Trigger And Scope Contract

Use this skill when the user asks for:

- ab test
- a/b test
- experiment
- controlled test
- holdout
- incrementality
- executive summary
- brief
- memo
- stakeholder

Do not use this skill as generic analytics advice. Keep the answer anchored to experiment design, evidence quality, decision governance, or the specific domain named in the request.


### Operating Loop

Before doing the work, read `../../references/operating-loop.md` and run this skill as the bounded expert procedure it defines: ground before judging, classify the request mode, keep tool use inside its boundaries, build an evidence pack, search before building (`../../references/operating-stance.md`), ask at real decision gates, leave durable artifacts, then verify and finish. That reference also holds the shared anti-patterns to block and the required completion block — end every response with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

### Skill-Specific Modes

- `brief-from-results`: create an executive memo from evidence.
- `rewrite`: improve an existing readout.
- `claim-review`: audit whether claims exceed evidence.
- `decision-options`: present options and tradeoffs for leadership.

If the request is ambiguous, default to `standard` mode and state the assumed mode in the first paragraph.

### Required Evidence

Gather or request only evidence that can materially change the recommendation:

- experiment design and decision criteria
- result summary and statistical analysis
- guardrail status
- business impact estimate
- proxy validation evidence
- limitations and open risks

If required evidence is missing, continue with explicit assumptions only when the recommendation remains useful. Otherwise return `NEEDS_CONTEXT`.

## Workflow

### Skill Calibration Packet

### Source Search Anchors

- In `16. Communicating Experiment Results to Senior Stakeholders.md`, search for executive framing, decision recommendation, uncertainty, business impact, and narrative discipline.
- In `15. Experimentation Metrics That Align with Business Strategy.md`, search for OEC, asymmetric loss, Value of Information, trust asset, and proxy inflation.
- In `02m. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md`, search for decision thresholds and risk-adjusted action.
- In `19. Unified Measurement_ How Experiments Fit with MMM and Attribution.md`, search for causal anchor, measurement hierarchy, and validity laundering.
- In `Slide Deck 2 - When Is an Experiment Done.md`, search for slide-ready decision framing.

### Inspect Locally

- The underlying analysis, decision memo, dashboard, source data, and prior stakeholder commitments.
- Whether the requested audience is executive committee, marketing leader, product leader, risk/compliance, or implementation team.
- Any claims that need downgrading because evidence is proxy, underpowered, early, or observational.

### Briefing Protocol

- Lead with the decision, not the p-value.
- Translate evidence into action, uncertainty, and risk of being wrong.
- Separate what happened, what it means, what we recommend, and what we should not claim.
- Use plain language without laundering weak evidence into confident narrative.
- Include one chart/table only when it clarifies the decision.
- Make residual risk explicit enough that a senior stakeholder can own the decision.

### Output Schema

For `.experimentation/executive-briefs/<experiment_id>.md`, include:

- headline decision, recommendation, confidence level, and owner action;
- experiment context, population, treatment, primary metric, guardrails, and result interpretation;
- business impact range, downside risk, operational/compliance considerations, and caveats;
- options table with recommended path, alternative path, and no-action path;
- appendix with source links, methods, and unresolved evidence gaps.

### Red Flags

- The brief says "proved" for a probabilistic or proxy finding.
- Statistical detail crowds out the action recommendation.
- The upside is quantified but the downside is vague.
- A non-significant result is framed as "no effect" without power review.
- The narrative hides metric drift, peeking, guardrail harm, or segment fishing.

### Domain Workflow

1. Identify the executive decision and risk appetite.
1. Open with the decision implication and confidence level.
1. State what was tested, for whom, when, and against what control.
1. Summarize effect size, interval, p-value or posterior, and practical value.
1. State primary metric and guardrail status.
1. Separate facts, estimates, assumptions, and judgment.
1. Apply proxy discounts where short-term metrics stand in for long-term outcomes.
1. State internal validity and external validity limits.
1. Offer decision options with tradeoffs.
1. Name what would change the recommendation.
1. Keep methodology brief in main text and appendix-ready in detail.
1. Preserve bad news and unresolved risks.

### Decision Gates

Use these decision gates when the task crosses a material choice:

- D1: What decision is leadership making?
- D2: Is the evidence strong enough for the claim?
- D3: What proxy discount or uncertainty language is required?
- D4: Recommendation vs options-only brief.

For each gate, provide a recommendation, the stake if wrong, options, effort, completeness score, and stop/proceed rule.

### Subagent And Outside-Voice Routing

Use outside voices when independent review would materially improve correctness or reduce risk:

- `experimentation-statistician` for power, MDE, intervals, Bayesian, sequential, CUPED, ratio, CATE, and uplift analysis.
- `regulated-risk-reviewer` for compliance, fairness, model risk, conduct risk, disclosures, and trust exposure.
- `measurement-architect` for MMM, attribution, global holdouts, geo-lift, proxy calibration, and evidence hierarchy.
- `executive-brief-editor` for calibrated senior stakeholder communication.

Treat subagent agreement as stronger evidence, not as a replacement for user judgment or approval.

## Output Format

Every answer should deliver the smallest useful output for the request, cite inspected sources, and end with the completion template from `../../references/operating-loop.md`.

### Artifact Outputs

Preferred outputs for this skill:

- executive memo
- one-page readout
- claim-risk review
- decision option table
- appendix methodology notes

When writing an artifact, include this header:

```markdown
---
status: DRAFT
skill: executive-evidence-brief
date: YYYY-MM-DD
decision_state: proposed | approved | blocked | needs-context | archived
sources:
  - 16. Communicating Experiment Results to Senior Stakeholders.md
  - 15. Experimentation Metrics That Align with Business Strategy.md
  - 02c. When Is an Experiment Done - Decision Thresholds Beyond Statistical Significance.md
  - 19. Unified Measurement_ How Experiments Fit with MMM and Attribution.md
  - 03m. The Role of Null Results in Mature Experimentation Programs.md
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

- The brief separates learning from deciding.
- The main narrative includes uncertainty, not only the appendix.
- Proxy evidence is discounted or caveated.
- Guardrail concerns are not softened away.
- The final recommendation is understandable without statistical background.
