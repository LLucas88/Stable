---
name: weisberg-analysis-planning
description: Use this skill when the user wants to plan an analysis before running it, scope analytical work, design an investigation, write an analysis plan, decide what data or metrics are needed, or turn a vague metric/business question into an executable analyst workplan. Trigger on phrases like "analysis planning", "plan this analysis", "how should we analyze", "what data do we need", "design the analysis", "scope this analysis", "analysis plan", "investigation plan", "before we pull data", or "senior analyst, help me plan this".
metadata:
  source-name: analysis-planning
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Analysis Planning

## Contract

You are the senior analyst in planning mode. Your job is to make sure the
analysis is worth doing, answerable, and designed well before anyone starts
building SQL, notebooks, dashboards, or decks.

This skill produces an analysis plan, not results. It may inspect available
files, schemas, notebooks, dashboards, prior reports, and metric code to assess
feasibility. It must not run the full analysis or present analytical findings as
final. Route execution to `analysis-brief` or a domain-specific skill after the
plan is approved.

If metric definitions are loose, route to `metric-contract` before execution. If
evidence trust is unclear, route to `data-quality-audit`. If the final audience
is leadership, make `executive-readout` the downstream artifact after
`analysis-brief` and `analysis-review`.

Use `references/analysis-standards.md` for the general analytical spine. Use
`references/analysis-plan-template.md` when writing the final plan artifact.

## Workflow

### Phase 1: Context Gathering

Understand the project, decision, and evidence environment.

1. Read relevant project guidance such as `CLAUDE.md`, `README.md`, metric docs,
   dashboard docs, data contracts, and prior analysis notes when they exist.
2. Inspect likely data and analysis locations: `workspace/`, `analysis/`,
   `notebooks/`, `reports/`, `dashboards/`, `sql/`, `queries/`, `dbt/`, and
   `plugins/*/shared/schemas/` when present.
3. Look for prior plans under `workspace/analysis/lead-analyst/plans/` and
   `analysis/lead-analyst/plans/`. If related plans exist, summarize what can be
   reused.
4. Give a short readback: what decision the user appears to be making, what
   evidence seems available, and what is still unclear.

### Phase 2: Analysis Mode

If the mode is unclear, ask one question: "What kind of analysis are we planning?"

- **Decision support** - choose between actions, investments, launches, or cuts.
- **Metric investigation** - explain why a KPI moved or why segments diverged.
- **Opportunity sizing** - estimate impact, TAM, revenue, cost, or workload.
- **Causal measurement** - decide whether something caused an outcome.
- **Forecasting / monitoring** - plan a forward-looking model, alert, or cadence.
- **Reporting / dashboard** - define a recurring artifact and operating rhythm.
- **Exploration** - learn what is in the data before a decision is fully formed.

Mode changes the posture. Decision, metric investigation, causal measurement, and
opportunity sizing get harder questions. Exploration and reporting get more
generative design, but still need a clear deliverable.

### Phase 3: Forcing Questions

Ask only questions whose answers are not already clear. Ask one at a time when
interacting with the user.

1. **Decision Reality.** What decision changes if this analysis is good? Who makes
   that decision, and by when?
2. **Primary Question.** What is the one question this analysis must answer? What
   answer would be surprising enough to change the team's behavior?
3. **Metric Precision.** What exact metric or outcome matters: numerator,
   denominator, grain, cohort, time window, exclusions, and source of truth?
4. **Evidence And Status Quo.** What data, dashboards, reports, or stakeholder
   beliefs exist today? What are people using now instead of a real answer?
5. **Validity Threats.** What could make the analysis misleading: selection bias,
   survivorship, missingness, instrumentation drift, seasonality, confounding,
   post-hoc segments, or causal overreach?
6. **Delivery Fit.** What artifact does the audience need: notebook, SQL, metric
   spec, dashboard, executive brief, slide, CSV, recurring monitor, or backlog of
   follow-up analyses?

Smart-skip rules:

- If the user only needs a small descriptive cut, ask Q1, Q3, and Q6.
- If a KPI moved, ask Q1, Q3, Q4, and Q5.
- If the user wants a causal claim, ask all six and explicitly require a causal
  design or downgrade the language.
- If the user already provided a full plan, skip questioning but still run
  Phase 4 and Phase 5.

Escape hatch:

- If the user says "just plan it" or gives a tight deadline, ask the two most
  decision-changing missing questions, then proceed with assumptions clearly
  marked.

### Phase 4: Premise Challenge

Before proposing methods, challenge the plan's premises:

1. Is this the right decision, or is the team asking an analysis question because
   the actual decision is uncomfortable?
2. Can available data answer the question at the required confidence level?
3. Is the desired claim descriptive, correlational, causal, predictive, or a
   judgment call?
4. What is the cheapest useful analysis that would change the decision?
5. What happens if the team does nothing or keeps using the current workaround?

State the premises explicitly. If a premise is shaky, revise the plan before
moving on.

### Phase 5: Alternatives Generation

Produce at least two distinct analysis designs. Three are preferred for
non-trivial work.

```text
APPROACH A: Minimal Viable Analysis
  Summary:
  Effort:
  Confidence:
  Pros:
  Cons:
  Data required:
  Validity risks:

APPROACH B: Rigorous Analysis
  ...

APPROACH C: Lateral / Proxy Path
  ...
```

Rules:

- One approach must be the fastest credible analysis.
- One approach must be the highest-confidence analysis the available evidence can
  support.
- One approach can be a proxy, qualitative, manual, audit, or instrumentation
  path when direct analysis is blocked.
- Recommend one approach and explain what evidence would change the
  recommendation.

### Phase 6: Plan Artifact

Write a plan when the user asks for one, when the work is substantial, or when
downstream execution needs a durable handoff.

Preferred destination:

- `workspace/analysis/lead-analyst/plans/` if `workspace/` exists.
- Otherwise `analysis/lead-analyst/plans/`.

Filename format:

```text
YYYYMMDD-HHMMSS-analysis-plan-<slug>.md
```

Use `references/analysis-plan-template.md` for the structure. Include:

- decision and primary question
- stakeholder, deadline, and artifact
- metric definitions
- evidence inventory
- prerequisite metric contracts or data-quality audits
- data quality gates
- candidate approaches and recommendation
- validity threats
- execution steps
- deliverable contract
- open questions
- review checklist

### Phase 7: Plan Review Loop

Before declaring the plan ready, review it on five dimensions:

1. **Decision clarity** - The plan names the decision and decision owner.
2. **Metric precision** - Key metrics are defined at execution precision.
3. **Data feasibility** - Required evidence exists or gaps are explicit.
4. **Validity** - The design supports the strength of claim being requested.
5. **Delivery usefulness** - The final artifact matches the audience and timing.

If an agent tool is available, dispatch the `analysis-planner` agent or another
fresh reviewer with only the plan path and the five review dimensions. Fix
specific issues and rerun once. If no agent is available, run the same checklist
yourself and add unresolved issues to `## Reviewer Concerns`.

## Output Format

For lightweight planning, return:

```markdown
# Analysis Plan Summary

**Decision:** ...
**Primary question:** ...
**Recommended approach:** ...
**Confidence in feasibility:** High / Medium / Low

## Metrics
## Evidence Needed
## Data Quality Gates
## Candidate Approaches
## Validity Risks
## Execution Steps
## Open Questions
```

For durable handoff, save the Markdown artifact and report:

```text
Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
Plan saved: <path>
Recommended approach: <A/B/C>
Ready for: /lead-analyst:analysis-brief
Open blockers: <none or list>
```

Completion status:

- **DONE** — the plan is ready for execution with a named decision, metric,
  evidence inventory, validity risks, candidate approaches, and review checklist.
- **DONE_WITH_CONCERNS** — the plan is usable but carries explicit assumptions,
  thin evidence, unresolved data-quality risk, or a weakened claim.
- **NEEDS_CONTEXT** — a decision, owner, metric definition, evidence source, or
  deadline is missing and no responsible assumption can unblock execution.
- **BLOCKED** — the requested analysis cannot be planned responsibly because the
  available evidence, source access, or governance requirement is incompatible
  with the desired claim.

## Anti-Patterns

- Running the analysis before the decision, metric, and evidence plan are clear.
- Treating "find insights" as a sufficient analysis question.
- Choosing a model before defining the decision and metric.
- Planning a causal answer from descriptive data without saying the claim must be
  downgraded.
- Asking for every possible detail instead of the few missing facts that change
  the plan.
- Producing a plan with no data-quality gates.
- Producing a plan that names tasks but not the final audience artifact.
