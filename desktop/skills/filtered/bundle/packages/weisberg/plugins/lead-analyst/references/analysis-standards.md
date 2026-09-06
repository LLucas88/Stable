# Lead Analyst Analysis Standards

Use these standards across lead-analyst skills and agents.

## Skill Flow

| Stage | Skill | Purpose |
|-------|-------|---------|
| Intake | `analysis-intake` | Convert vague stakeholder asks into a crisp decision, audience, metric, timing, and route. |
| Inventory | `source-inventory` | Map available evidence, grain, owners, freshness, access, and source-of-truth status. |
| Plan | `analysis-planning` | Decide the question, evidence, approach, validity threats, and deliverable. |
| Define | `metric-contract` | Lock down metric meaning, source of truth, caveats, and governance. |
| Trace | `metric-lineage` | Follow a KPI from visible number back through transformations to source systems. |
| Review Query | `sql-review` | Catch grain, join, denominator, filter, time-window, and null bugs in SQL. |
| Profile | `eda-profile` | Make unfamiliar data legible before analysis or trust review. |
| Diagnose | `metric-movement-diagnostic`, `segment-diagnostics`, `cohort-analysis` | Explain movements, segment contributions, and cohort patterns without causal overreach. |
| Trust | `data-quality-audit` | Decide whether the evidence is safe for the intended decision. |
| Answer | `analysis-brief` | Produce the analytical answer and recommendation. |
| Design Surface | `dashboard-spec`, `dashboard-audit` | Create or review operating dashboards around decisions, metric trust, and cadence. |
| Project Future | `forecast-scenario` | Make ranges, assumptions, sensitivities, and trigger points explicit. |
| Challenge | `analysis-review` | Adversarially test claims, definitions, methods, and decision risk. |
| Communicate | `executive-readout` | Turn the answer into an executive-ready decision artifact. |
| Remember | `decision-log` | Record recommendation, owner decision, confidence, follow-up, and outcome. |

## The Analytical Spine

1. **Decision.** What decision, recommendation, or next action should this analysis inform?
2. **Metric.** What is the exact numerator, denominator, grain, time window, and ownership of each metric?
3. **Population.** Who or what is included, excluded, and newly missing because of filters or joins?
4. **Evidence.** What data, documents, notes, dashboards, or prior analyses support the answer?
5. **Quality.** Is the evidence fresh, complete, deduplicated, comparable, and measured consistently?
6. **Interpretation.** Which claims are descriptive, correlational, experimental, causal, or judgment calls?
7. **Decision.** What should the team do, how confident are we, and what would change the recommendation?

## Evidence Ladder

| Level | Evidence Type | How To Use It |
|-------|---------------|---------------|
| L1 | Anecdote, stakeholder memory, single quote | Useful for hypotheses, not for sizing or decisions alone. |
| L2 | Dashboard or report without raw query/provenance | Treat as directional until definitions and filters are verified. |
| L3 | Reproducible query, notebook, or source extract | Good for descriptive decisions if quality checks pass. |
| L4 | Controlled experiment, holdout, or strong quasi-experiment | Best for causal claims when design and instrumentation hold up. |
| L5 | Repeated evidence across methods and time | Strongest basis for durable operating decisions. |

## Default Quality Checks

- Freshness and coverage by time period.
- Duplicates at the analysis grain.
- Missingness by key segment and time.
- Join loss and unmatched IDs.
- Metric definition drift across source systems.
- Outliers, censoring, and unit/currency mismatches.
- Selection bias from filters, eligibility, survivorship, or channel exposure.

## Communication Standard

Lead with the answer. Then show the evidence, caveats, and next action. A useful
brief makes a decision easier without hiding uncertainty.

## Artifact Taxonomy

Use predictable locations when writing durable work:

| Artifact | Preferred Path |
|----------|----------------|
| Intake briefs | `workspace/analysis/lead-analyst/intake/` or `analysis/lead-analyst/intake/` |
| Source inventories | `workspace/analysis/lead-analyst/sources/` or `analysis/lead-analyst/sources/` |
| Analysis plans | `workspace/analysis/lead-analyst/plans/` or `analysis/lead-analyst/plans/` |
| Metric contracts | `workspace/analysis/lead-analyst/metrics/` or `analysis/lead-analyst/metrics/` |
| Metric lineage maps | `workspace/analysis/lead-analyst/lineage/` or `analysis/lead-analyst/lineage/` |
| SQL reviews | `workspace/analysis/lead-analyst/sql-reviews/` or `analysis/lead-analyst/sql-reviews/` |
| Dataset profiles | `workspace/analysis/lead-analyst/profiles/` or `analysis/lead-analyst/profiles/` |
| Diagnostics | `workspace/analysis/lead-analyst/diagnostics/` or `analysis/lead-analyst/diagnostics/` |
| Dashboard specs/audits | `workspace/analysis/lead-analyst/dashboards/` or `analysis/lead-analyst/dashboards/` |
| Forecasts/scenarios | `workspace/analysis/lead-analyst/forecasts/` or `analysis/lead-analyst/forecasts/` |
| Data-quality audits | `workspace/analysis/lead-analyst/audits/` or `analysis/lead-analyst/audits/` |
| Analysis briefs | `workspace/analysis/lead-analyst/` or `analysis/lead-analyst/` |
| Executive readouts | `workspace/reports/lead-analyst/` or `analysis/lead-analyst/readouts/` |
| Decision logs | `workspace/analysis/lead-analyst/decision-log.md` or `analysis/lead-analyst/decision-log.md` |
