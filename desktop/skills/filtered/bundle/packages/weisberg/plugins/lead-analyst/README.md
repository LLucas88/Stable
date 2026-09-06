# Lead Analyst Plugin

Senior analyst workflows for turning messy business and data questions into
well-planned, decision-ready analysis. The plugin acts like the senior analyst
on the team: it scopes the work, defines the metrics, audits the data, produces
the answer, challenges the answer, and turns it into a decision memo.

## Installation

```bash
/plugin install lead-analyst@agile-agentic-analytics
```

## Components

| Component | Description |
|-----------|-------------|
| `/lead-analyst:analysis-intake` | Turn vague stakeholder asks into a crisp analytics intake with decision, audience, timing, metric, and route. |
| `/lead-analyst:source-inventory` | Map available tables, files, dashboards, notebooks, owners, freshness, grain, and source-of-truth status. |
| `/lead-analyst:analysis-planning` | Plan analytical work before execution: decision, metrics, evidence, data-quality gates, candidate methods, and handoff artifact. |
| `/lead-analyst:metric-contract` | Define or reconcile KPI contracts with numerator, denominator, grain, source of truth, caveats, and change control. |
| `/lead-analyst:metric-lineage` | Trace KPIs from dashboard/report back through SQL, models, events, source tables, and transformation logic. |
| `/lead-analyst:sql-review` | Review SQL, dbt models, BI queries, and notebook queries for analytical correctness and decision risk. |
| `/lead-analyst:eda-profile` | Profile datasets before analysis: grain, coverage, missingness, duplicates, distributions, and anomalies. |
| `/lead-analyst:metric-movement-diagnostic` | Diagnose why a KPI moved by separating measurement issues, mix shift, segments, timing, and plausible drivers. |
| `/lead-analyst:cohort-analysis` | Design or run cohort analysis for retention, activation, repeat behavior, lifecycle progression, revenue, or churn. |
| `/lead-analyst:segment-diagnostics` | Identify which segments explain a movement or opportunity without overclaiming noisy post-hoc cuts. |
| `/lead-analyst:dashboard-spec` | Design dashboards from operating decisions: audience, cadence, metrics, layout, alerts, states, and governance. |
| `/lead-analyst:dashboard-audit` | Review dashboards for decision usefulness, metric trust, freshness, misleading charts, filters, and governance. |
| `/lead-analyst:forecast-scenario` | Design forecasts, scenarios, sensitivity analyses, targets, capacity models, and what-if plans. |
| `/lead-analyst:data-quality-audit` | Audit datasets, SQL, dashboards, extracts, and metric pipelines for decision readiness. |
| `/lead-analyst:analysis-brief` | Lead an analysis from question framing through evidence, data-quality checks, interpretation, and recommendation. |
| `/lead-analyst:analysis-review` | Review an existing analysis, dashboard, notebook, report, or KPI claim for validity and decision risk. |
| `/lead-analyst:executive-readout` | Turn analytical work into an executive-ready recommendation, decision memo, or operating-review update. |
| `/lead-analyst:decision-log` | Capture analytical recommendations, decisions, confidence, follow-up plans, and outcomes. |
| `analysis-planner` agent | Planning-focused analyst subagent for analysis design, validity threats, metric precision, and plan review. |
| `metric-steward` agent | Metric-definition specialist for KPI contracts and source-of-truth reconciliation. |
| `data-quality-auditor` agent | Evidence-quality specialist for freshness, grain, joins, missingness, and decision risk. |
| `lead-analyst` agent | Reusable senior analyst subagent for independent analytical judgment, data-quality audit, and decision-ready synthesis. |
| `insight-editor` agent | Executive narrative specialist for sharpening recommendations without overstating certainty. |

## Typical Flow

```text
vague question
  -> /lead-analyst:analysis-intake
  -> /lead-analyst:source-inventory        (if evidence landscape is unclear)
  -> /lead-analyst:analysis-planning
  -> /lead-analyst:metric-contract       (if definitions are loose)
  -> /lead-analyst:metric-lineage         (if dashboards or sources disagree)
  -> /lead-analyst:data-quality-audit    (if evidence trust is unclear)
  -> /lead-analyst:analysis-brief
  -> /lead-analyst:analysis-review
  -> /lead-analyst:executive-readout
  -> /lead-analyst:decision-log
```

## Operating Stance

- Decision first: every analysis starts with the decision or action it should inform.
- Metrics are contracts: no KPI is real until its grain, denominator, owner, and source of truth are explicit.
- Evidence over polish: attractive charts do not outrank source data, metric definitions, and reproducible calculations.
- Causal humility: the plugin labels descriptive, correlational, experimental, and causal claims separately.
- Executive usefulness: outputs say what changed, why it matters, how confident we are, and what to do next.

## Local Testing

```bash
claude --plugin-dir ./plugins/lead-analyst
```

Reload after edits with `/reload-plugins`. Validate with `claude plugin validate`
or the repository plugin-health audit.
