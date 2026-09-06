# Experimentation Plugin

Claude Code plugin for regulated, low-velocity, high-trust experimentation. It packages the Experimentation Notebook as references and exposes focused skills for experiment design, analysis, decision governance, email incrementality, compliance review, operating model design, and executive communication.

## Scope — when to use this plugin

This plugin owns **regulated / high-trust experimentation governance**: decision reviews
that go beyond statistical significance, compliance and conduct-risk review, experimentation
operating models and program design, calibrated executive evidence, and safe experiment
design. It governs and advises; it does **not** run the sample-size or analysis computations
itself.

For neighboring intents, use a different surface instead:

- **Hands-on experiment lifecycle** — designing a standard A/B test, calculating sample size
  and duration ("how long should I run this test"), analyzing results, reviewing bucketing
  code, writing the readout — use the **ab-testing** plugin.
- **Scripted marketing-workspace statistics** — CUPED, SRM, sequential tests wired to the
  `workspace/` data contracts — use **marketing-analytics/experimentation**.

Each skill's `description` names the specific neighbor to defer to at its boundary.

## Installation

```text
/plugin install experimentation@agile-agentic-analytics
```

## Skills

| Skill | Command | Description |
| --- | --- | --- |
| Safe Experiment Design | `/experimentation:safe-experiment-design` | Design experiments with hypotheses, metrics, guardrails, compliance constraints, risk tiers, kill switches, and audit trail. |
| Power Duration Planning | `/experimentation:power-duration-planning` | Plan sample size, MDE, duration, low-traffic feasibility, and alternatives to default 30-day tests. |
| Experiment Decision Review | `/experimentation:experiment-decision-review` | Decide ship, kill, iterate, extend, or retest using statistical, business, risk, and temporal evidence. |
| Early Signal Monitoring | `/experimentation:early-signal-monitoring` | Review first 48 hours, SRM, exposure checks, operational guardrails, novelty effects, and temporal signal maturity. |
| Advanced Experiment Analysis | `/experimentation:advanced-experiment-analysis` | Analyze sequential tests, Bayesian evidence, CUPED/CUPAC, ratio metrics, clustered behavior, CATE, uplift, and bandits. |
| Email Incrementality | `/experimentation:email-incrementality` | Design and evaluate email tests after Apple MPP, including holdouts, fatigue, frequency, proxies, and delayed outcomes. |
| Personalization Governance | `/experimentation:personalization-governance` | Decide whether CATE, uplift, segmentation, or personalization evidence is strong and safe enough to deploy. |
| Measurement Integration | `/experimentation:measurement-integration` | Connect experiments to MMM, attribution, geo-lift, global holdouts, proxy calibration, and marketing measurement governance. |
| Experiment Operating Model | `/experimentation:experiment-operating-model` | Build CoE, review board, maturity curve, null result repository, and first-year experimentation roadmap. |
| Executive Evidence Brief | `/experimentation:executive-evidence-brief` | Convert experiment evidence into senior stakeholder decision memos with uncertainty, assumptions, and limitations. |
| Compliance Trust Review | `/experimentation:compliance-trust-review` | Review experiments for financial services compliance, dark patterns, fairness, disclosures, and trust erosion. |
| Null Results Registry | `/experimentation:null-results-registry` | Capture flat, negative, and inconclusive results into an experiment-learnings registry so they compound into institutional memory. |

## Agents

| Agent | Description |
| --- | --- |
| `ab-testing-expert` | End-to-end A/B **design consultant** — shapes the whole test (hypothesis, OEC, randomization, sizing, decision rules) across the lifecycle. Pairs with `experimentation-statistician` for the method review. |
| `experimentation-statistician` | **Analysis and method-review** specialist — selects, computes, and critiques the statistics (power, intervals, CUPED, sequential, ratio metrics) and flags inference errors. Scrutinizes the numbers, not the whole design. |
| `regulated-experiment-auditor` | Independent auditor for experiment design, implementation, analysis, and decision quality. |
| `regulated-risk-reviewer` | Compliance, fairness, model risk, conduct risk, disclosure, and trust reviewer. |
| `email-measurement-specialist` | Email experimentation, Apple MPP, holdouts, fatigue, and delayed outcome specialist. |
| `measurement-architect` | MMM, attribution, global holdout, proxy calibration, and unified measurement specialist. |
| `operating-model-advisor` | CoE, governance, review boards, maturity model, and adoption specialist. |
| `executive-brief-editor` | Senior stakeholder communication and calibrated evidence memo specialist. |
| `experiment-librarian` | Experiment repository, taxonomy, null result, and meta-analysis specialist. |

## References

The notebook markdown is bundled in `references/notebook/`. Start with `references/notebook-source-map.md` to choose the smallest relevant source set for a skill invocation.

Top-level notebook markdown in `references/notebook/` is generated from
`knowledge/experimentation/` using `scripts/sync_experimentation_notebook.py`.
After changing source docs, run:

```text
python3 scripts/sync_experimentation_notebook.py
python3 scripts/sync_experimentation_notebook.py --check
```

The sync preserves plugin-only extras such as slide decks and research-note
folders; the generated `references/notebook/NOTEBOOK_SYNC_MANIFEST.json`
declares the managed mirror files.
