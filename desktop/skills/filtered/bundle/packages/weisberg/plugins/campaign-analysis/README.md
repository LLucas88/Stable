# Campaign Analysis

Campaign performance analysis toolkit for measurement, diagnostics, optimization, and stakeholder reporting.

## Skills

| Skill | Description |
|-------|-------------|
| **up-sell-analysis** | Measure the impact of a campaign on existing clients or account owners. Reports reach, CTR, and change in a value metric (sales, balances, AUM). Runs a holdout-vs-treated statistical test when a holdout is available; otherwise reports pre/post descriptive lift and is explicit about the lack of causal attribution. |
| **cross-sell-analysis** | Measure the impact of a campaign that promotes a NEW product to existing customers. Reports reach, CTR, conversion rate (account open rate), funded balance / value per eligible customer, and (with a holdout) a two-proportion test plus value-per-eligible test with bootstrap CIs. Enforces eligibility (excludes customers who already hold the target product) and surfaces cannibalization risk. |

## Status

In active development. Additional skills, agents, references, and scripts can be added under the standard plugin directories:

| Directory | Purpose |
| --- | --- |
| `skills/<name>/SKILL.md` | User-facing campaign analysis workflows |
| `agents/*.md` | Specialized campaign analysis subagents |
| `references/` | Methodology notes, metric definitions, templates, and data contracts |
| `scripts/` | Reusable campaign analysis utilities |

## Installation

```text
/plugin install campaign-analysis@agile-agentic-analytics
```

## Local Testing

```bash
claude --plugin-dir ./plugins/campaign-analysis
```

Reload after edits with `/reload-plugins`. Validate with `claude plugin validate`.
