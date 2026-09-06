# Agile Agentic Analytics

A dual Claude Code and Codex plugin marketplace for agile agentic analytics.
The repo keeps one canonical plugin catalog in `marketplace.yaml` and renders
the harness-specific files that Claude Code and Codex need.

## Installation

### Claude Code

```bash
# Local checkout
claude plugin marketplace add ./ --scope local
claude plugin install plugin-manager@agile-agentic-analytics --scope local

# GitHub marketplace
claude plugin marketplace add weisberg/agile_agentic_analytics
claude plugin install plugin-manager@agile-agentic-analytics
```

You can also use the slash-command UI:

```text
/plugin marketplace add weisberg/agile_agentic_analytics
/plugin
```

### Codex

```bash
# Local checkout
codex plugin marketplace add ./

# GitHub marketplace
codex plugin marketplace add weisberg/agile_agentic_analytics
```

After adding the marketplace, open the Codex plugin UI and install or enable the
plugin there. Codex deep links use the generated marketplace file:

```text
codex://plugins/plugin-manager?marketplacePath=/absolute/path/to/.agents/plugins/marketplace.json
codex://plugins/plugin-manager?marketplacePath=/absolute/path/to/.agents/plugins/marketplace.json&mode=share
```

URL-encode the `marketplacePath` value when turning those examples into actual
links.

## Generated Structure

| Source | Generated Claude Code file | Generated Codex file |
| --- | --- | --- |
| `marketplace.yaml` | `.claude-plugin/marketplace.json` | `.agents/plugins/marketplace.json` |
| `marketplace.yaml` plugin entry | `plugins/<plugin>/.claude-plugin/plugin.json` | `plugins/<plugin>/.codex-plugin/plugin.json` |
| `plugins/<plugin>/skills/*/SKILL.md` | Shared skill content | Shared skill content |

Do not hand-edit generated marketplace or manifest JSON. Edit
`marketplace.yaml`, then run `npm run render`.

## Available Plugins

### Plugin Manager

**Install:** `/plugin install plugin-manager@agile-agentic-analytics`

Marketplace maintenance workflows for creating, validating, harvesting, syncing,
and publishing shared Claude Code and Codex plugins.

| Component | Description |
|-----------|-------------|
| `/plugin-manager:manage-plugins` | Route plugin maintenance work: create/update plugins, inspect manifests, validate packaging, update marketplace entries, and prepare release steps |
| `/plugin-manager:plugin-health` | Run plugin health, conformance, packaging, manifest, marketplace, skill frontmatter, routing, and generated-artifact audits |
| `/plugin-manager:plugin-quality-gate` | Run or record a cross-model/second-opinion quality gate for high-impact plugin skills before release |
| `/plugin-manager:plugin-release` | Validate, version, document, and gate plugin releases before commit, push, PR, tag, or publish |
| `/plugin-manager:plugin-work-checkpoint` | Save or restore resumable context for long plugin maintenance work |
| `/plugin-manager:plugin-devex-review` | Review fresh-clone onboarding, README flow, local testing paths, prerequisites, and contributor experience |
| `/plugin-manager:skill-improve` | Improve an existing skill in one bounded evidence-backed pass without a full SkillOpt training loop |
| `/plugin-manager:skillopt-training-run` | Orchestrate offline SkillOpt-style optimization for plugin skills |
| `/plugin-manager:skillopt-rollout-evidence` | Capture scored task trajectories, verifier output, and failure modes |
| `/plugin-manager:skillopt-reflection-edits` | Turn rollout successes and failures into bounded structured skill edits |
| `/plugin-manager:skillopt-validation-gate` | Accept candidate skill edits only when held-out validation improves |
| `/plugin-manager:skillopt-slow-meta-update` | Consolidate epoch-level slow guidance and optimizer meta memory |
| `/plugin-manager:skillopt-transfer-release` | Export, transfer-check, document, and promote the best optimized skill |
| `/plugin-manager:upstream-skill-harvest` | Import, adapt, diff, and periodically review skills harvested from GBrain or GStack into marketplace plugins |

### Lead Analyst

**Install:** `/plugin install lead-analyst@agile-agentic-analytics`

Senior analyst workflows for intake, source inventory, analysis planning, metric
contracts, lineage, SQL review, profiling, diagnostics, data-quality audits,
decision-ready briefs, dashboard work, forecasting, reviews, executive readouts,
and decision logs.

| Component | Description |
|-----------|-------------|
| `/lead-analyst:analysis-intake` | Turn vague stakeholder asks into a crisp analytics intake with decision, audience, timing, metric, and route |
| `/lead-analyst:source-inventory` | Map available tables, files, dashboards, notebooks, owners, freshness, grain, and source-of-truth status |
| `/lead-analyst:analysis-planning` | Plan analytical work before execution: decision, metrics, evidence, data-quality gates, candidate methods, and handoff artifact |
| `/lead-analyst:metric-contract` | Define or reconcile KPI contracts with numerator, denominator, grain, source of truth, caveats, and change control |
| `/lead-analyst:metric-lineage` | Trace KPIs from dashboard/report back through SQL, models, events, source tables, and transformation logic |
| `/lead-analyst:sql-review` | Review SQL, dbt models, BI queries, and notebook queries for analytical correctness and decision risk |
| `/lead-analyst:eda-profile` | Profile datasets before analysis: grain, coverage, missingness, duplicates, distributions, and anomalies |
| `/lead-analyst:metric-movement-diagnostic` | Diagnose why a KPI moved by separating measurement issues, mix shift, segments, timing, and plausible drivers |
| `/lead-analyst:cohort-analysis` | Design or run cohort analysis for retention, activation, repeat behavior, lifecycle progression, revenue, or churn |
| `/lead-analyst:segment-diagnostics` | Identify which segments explain a movement or opportunity without overclaiming noisy post-hoc cuts |
| `/lead-analyst:dashboard-spec` | Design dashboards from operating decisions: audience, cadence, metrics, layout, alerts, states, and governance |
| `/lead-analyst:dashboard-audit` | Review dashboards for decision usefulness, metric trust, freshness, misleading charts, filters, and governance |
| `/lead-analyst:forecast-scenario` | Design forecasts, scenarios, sensitivity analyses, targets, capacity models, and what-if plans |
| `/lead-analyst:data-quality-audit` | Audit datasets, SQL, dashboards, extracts, and metric pipelines for decision readiness |
| `/lead-analyst:analysis-brief` | Lead an analysis from question framing through evidence, data-quality checks, interpretation, and recommendation |
| `/lead-analyst:analysis-review` | Review an analysis, dashboard, notebook, report, or KPI claim for analytical validity and decision risk |
| `/lead-analyst:executive-readout` | Turn analytical work into an executive-ready recommendation, decision memo, or operating-review update |
| `/lead-analyst:decision-log` | Capture analytical recommendations, decisions, confidence, follow-up plans, and outcomes |
| `analysis-planner` agent | Planning-focused analyst subagent for metric precision, validity threats, and analysis plan review |
| `metric-steward` agent | Metric-definition specialist for KPI contracts and source-of-truth reconciliation |
| `data-quality-auditor` agent | Evidence-quality specialist for freshness, grain, joins, missingness, and decision risk |
| `lead-analyst` agent | Senior analyst subagent for independent analytical judgment and decision-ready synthesis |
| `insight-editor` agent | Executive narrative specialist for sharpening recommendations without overstating certainty |

### Knowledge Base

**Install:** `/plugin install knowledge-base@agile-agentic-analytics`

50-skill knowledge management system for file-based vaults, ingestion, retrieval,
graph operations, provenance, privacy, publishing, automation, and plugin
maintenance workflows. Includes the bundled `vaultli` CLI plus synthetic sample
vault fixtures.

| Area | Components |
|-----------|-------------|
| Core | `/knowledge-base:kb-ops`, `resolver`, `setup`, `health`, `maintenance`, `dashboard`, `vaultli` |
| Retrieval | `query`, `search-modes`, `source-router`, `graph-ops`, `briefing`, `reports` |
| Ingestion | `ingest`, `signal-detector`, `article-enrichment`, `meeting-ingestion`, `media-ingest`, `voice-note-ingest`, `browser-ingest`, `raw-source`, `cold-start`, `migrate`, `archive-crawler` |
| Knowledge work | `enrich`, `citation-fixer`, `frontmatter-guard`, `filing-rules`, `concept-synthesis`, `book-mirror`, `academic-verify`, `current-research`, `strategic-reading`, `originals`, `task-manager` |
| Governance | `privacy-security`, `quality-gate`, `context-checkpoint`, `integration-contracts`, `release-upgrade`, `devex-review`, `sample-vault`, `skillify` |
| Agents | `kb-curator`, `kb-researcher`, `kb-ops-auditor` |

### A/B Testing

**Install:** `/plugin install ab-testing@agile-agentic-analytics`

Design, analyze, and review A/B tests with statistical rigor.

| Component | Description |
|-----------|-------------|
| `/ab-testing:design-experiment` | Create structured experiment designs with hypothesis, metrics, and guardrails |
| `/ab-testing:sample-size` | Calculate required sample size and experiment duration |
| `/ab-testing:analyze-results` | Statistical analysis with SRM checks, effect sizes, and reproducible code |
| `/ab-testing:experiment-report` | Generate stakeholder-ready reports (technical or executive) |
| `/ab-testing:review-experiment` | Code review for assignment bugs, logging gaps, and bucketing leaks |
| `statistician` agent | Rigorous statistical analysis specialist |
| `experiment-auditor` agent | Systematic experiment lifecycle auditor |

### Marketing Analytics

**Install:** `/plugin install marketing-analytics@agile-agentic-analytics`

15 interconnected marketing analytics skills covering the full lifecycle from data extraction through compliance review.

**P0 — Foundational**

| Skill | Description |
|-------|-------------|
| `/marketing-analytics:attribution-analysis` | Bayesian MMM, multi-touch attribution, budget optimization |
| `/marketing-analytics:experimentation` | A/B testing, CUPED variance reduction, sequential testing |
| `/marketing-analytics:paid-media` | Cross-platform ad performance, anomaly detection, creative fatigue |
| `/marketing-analytics:reporting` | Executive dashboards, cross-skill synthesis, insight generation |
| `/marketing-analytics:compliance-review` | SEC/FINRA/FCA content screening for financial services |

**P1 — Strategic/Tactical**

| Skill | Description |
|-------|-------------|
| `/marketing-analytics:clv-modeling` | BG/NBD, Gamma-Gamma, Bayesian CLV with confidence intervals |
| `/marketing-analytics:audience-segmentation` | RFM scoring, K-Means/DBSCAN clustering, cohort retention |
| `/marketing-analytics:funnel-analysis` | Multi-step funnels, bottleneck identification, revenue impact |
| `/marketing-analytics:email-analytics` | Deliverability, engagement (post-iOS 15), send-time optimization |
| `/marketing-analytics:web-analytics` | GA4 extraction, behavioral patterns, predictive audiences |
| `/marketing-analytics:seo-content` | Search Console, keyword tracking, AI search optimization (GEO) |

**P2 — Supporting**

| Skill | Description |
|-------|-------------|
| `/marketing-analytics:crm-lead-scoring` | Predictive scoring, pipeline velocity, win/loss analysis |
| `/marketing-analytics:social-analytics` | Cross-platform social, sentiment analysis, share of voice |
| `/marketing-analytics:competitive-intel` | Keyword gap, ad creative monitoring, strategic synthesis |
| `/marketing-analytics:voc-analytics` | NPS/CSAT/CES, theme extraction, satisfaction-behavior correlation |

## Creating a Plugin

Each plugin lives in its own directory under `plugins/`. The marketplace metadata
lives in `marketplace.yaml`; the renderer creates both harness manifests.

Minimum source structure:

```
plugins/my-plugin/
  README.md
  skills/
    my-skill/
      SKILL.md
  agents/                  # Optional Claude Code agents
    my-agent.md
  hooks/                   # Optional Claude Code hooks
    hooks.json
  .mcp.json                # Optional shared MCP server config
  .app.json                # Optional Codex app config
```

Skill frontmatter should stay compatible with both harnesses:

```yaml
---
name: my-skill
description: Short routing description.
disable-model-invocation: false
---
```

Add the plugin to `marketplace.yaml` with `path: plugins/my-plugin`, component
flags, version, keywords, and Codex interface copy. Then render and validate:

```bash
npm run render
npm run render:check
npm run validate
```

When a plugin's installable behavior changes, bump its `version` in
`marketplace.yaml`. Claude Code uses manifest versions for update detection, and
Codex receives the same version in its generated manifest.

## Validation

```bash
npm ci
npm run render:check
npm run validate
python3 -m json.tool .claude-plugin/marketplace.json
python3 -m json.tool .agents/plugins/marketplace.json
python3 plugins/plugin-manager/skills/plugin-health/scripts/plugin_audit.py --json
```

Claude Code strict validation is available when the CLI is installed:

```bash
./scripts/smoke-claude.sh
```

Codex does not currently expose a stable local `codex plugin validate` command
for this marketplace shape, so `npm run validate` enforces the Codex structural
contract locally.

## Release Checklist

1. Update plugin content.
2. Bump `plugins[].version` in `marketplace.yaml` for changed installable behavior.
3. Run `npm run render`.
4. Run `npm run render:check` and `npm run validate`.
5. Run Claude/Codex smoke checks where the CLIs are available.
6. Commit the generated marketplace and manifest files.
7. Tell users to refresh with `claude plugin marketplace update agile-agentic-analytics`.
   For Git-backed Codex marketplaces, use
   `codex plugin marketplace upgrade agile-agentic-analytics`; for local
   checkouts, re-add the local root with `codex plugin marketplace add ./` when
   needed.

## License

MIT
