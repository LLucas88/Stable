# Advanced Operating Loop — shared by every experimentation skill

Every experimentation skill runs this same bounded expert procedure. It is
extracted here once so the twelve skills stay in sync; each skill's body keeps
only its domain content (source table, trigger/scope contract, modes, required
evidence, calibration packet, domain workflow, decision gates, routing, artifact
outputs, and quality bar) and points here for the loop, the shared anti-patterns,
and the completion format.

This skill is an operating procedure, not a topical note. Run it as a bounded expert workflow.

## 1. Ground Before Judging

- Read `./notebook-source-map.md` first.
- Load only the notebook sources named in the invoking skill, plus any user-supplied files.
- Inspect local `.experimentation/` artifacts before inventing experiment IDs, metric names, repository fields, or governance states.
- If a dashboard, SQL file, notebook, design memo, or experiment record is available, inspect it before giving advice.
- Name the exact sources used in the answer or artifact.
- Mark unsupported conclusions as assumptions, not findings.

## 2. Classify The Request

State the mode internally and keep the response aligned to it:

- `quick`: answer the narrow question with assumptions and stop conditions.
- `standard`: source-grounded recommendation with evidence gaps and decision implications.
- `exhaustive`: full evidence pack, decision gates, artifact schema, verification, and subagent routing.
- `review-only`: critique supplied material without rewriting or authorizing action.
- `artifact-producing`: write or provide a reusable artifact with owners, status, and source list.
- `regulated`: include trust, fairness, privacy, disclosure, approval, and auditability checks.

If the user asks for speed, stay concise but do not drop guardrails that could change the decision.

## 3. Use Tools With Boundaries

- Use Read/Grep/Glob/Bash for grounding, local searches, data checks, and repository status.
- Use Write/Edit only for requested or clearly implied durable artifacts.
- Use Agent/subagents when an independent statistical, risk, measurement, operating-model, or editorial review changes decision quality.
- Do not mutate launch configs, feature flags, allocation rules, legal copy, or production code unless explicitly asked.
- Do not store secrets, regulated personal data, customer identifiers, or confidential policy text in artifacts.

## 4. Build An Evidence Pack

Every substantial answer needs:

- source notebook files consulted;
- user artifacts or data inspected;
- decision owner, evidence owner, and risk owner when relevant;
- primary metric, guardrails, population, exposure unit, and time window when relevant;
- assumptions that could change the recommendation;
- unresolved data gaps;
- verification performed or reason verification was impossible.

## 5. Search Before Building

Follow the three-layer stance from `./operating-stance.md`:

- Layer 1: local artifacts, notebook source map, established statistical methods, and existing platform primitives.
- Layer 2: current common practice only when local material does not answer the question.
- Layer 3: first-principles reasoning when convention fails; explain the causal, statistical, or operational reason.

Prefer established experiment infrastructure over custom process when it meets the requirement.

## 6. Ask At Real Decision Gates

Use a structured decision brief at material choices. If AskUserQuestion tooling exists, use it; otherwise write the brief and pause when the choice is one-way, cost-bearing, legal, trust-affecting, or changes the estimand.

Decision brief format:

- `D<N>: <decision title>`
- Grounding: source files, local artifacts, and current task.
- ELI10: plain-language explanation.
- Stakes: what breaks if this is wrong.
- Recommendation: one default with concrete reason.
- Completeness: score options as `10/10`, `7/10`, or `3/10` when coverage differs.
- Options: pros, cons, human-time cost, AI-agent-time cost.
- Net tradeoff: one sentence.
- Stop rule: proceed, pause, escalate, or ask the user.

Do not ask for trivial confirmations. Make bounded assumptions when the risk is low and name them.

## 7. Leave Durable State When Useful

Use repo-local artifacts unless the user gives another destination:

- `.experimentation/designs/<experiment_id>.md`
- `.experimentation/decision-memos/<experiment_id>.md`
- `.experimentation/monitoring/<experiment_id>.md`
- `.experimentation/reports/<experiment_id>.md`
- `.experimentation/reviews/<experiment_id>.md`
- `.experimentation/measurement/<topic>.md`
- `.experimentation/executive-briefs/<experiment_id>.md`
- `.experimentation/baselines/<metric_or_channel>.json`
- `.experimentation/repository/experiments.jsonl`
- `.experimentation/repository/learnings.jsonl`

Use Markdown for human review, JSON for baselines/thresholds, and JSONL for append-only repositories.

## 8. Verify And Finish

Before final response:

- re-read files you wrote or materially rewrote;
- run deterministic checks for formulas, JSON/YAML, scripts, tables, and source paths;
- compare against prior artifacts when monitoring, maturity, or repository quality is trendable;
- recommend the next skill or subagent only when current evidence cannot carry the next decision;
- end with `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

## Anti-Patterns To Block

- Treating statistical significance as automatic permission to act.
- Treating notebook content as decorative rather than authoritative.
- Hiding uncertainty, assumptions, or evidence gaps.
- Asking the user trivial questions instead of making bounded assumptions.
- Proceeding through compliance, launch, or irreversible decision gates without explicit stop/proceed logic.
- Creating artifacts that cannot be found or reused by later skills.
- Reporting `DONE` without fresh verification evidence.

## Completion Template

End every response with:

```markdown
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Evidence used:
- <source files>
- <user artifacts or data>
Verification:
- <checks performed>
Residual risk:
- <material caveats or none>
Next action:
- <one concrete next step>
```
