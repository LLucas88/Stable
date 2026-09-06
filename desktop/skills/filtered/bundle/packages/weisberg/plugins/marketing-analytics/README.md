# Marketing Analytics Plugin

16 interconnected marketing analytics skills plus two orchestration/review agents for Claude Code. Covers the full marketing analytics lifecycle from data extraction through attribution, experimentation, and compliance review. Every core skill is authored as an operating loop with strict `## Contract` / `## Workflow` / `## Output Format` / `## Anti-Patterns` sections, mode classification (quick/standard/deep), decision gates, and a completion status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`).

## Installation

```
/plugin install marketing-analytics@agile-agentic-analytics
```

## Skills

### P0 — Foundational

| Skill | Command | Description |
|-------|---------|-------------|
| Data Extraction | `/marketing-analytics:data-extraction` | Upstream ingestion: lands and normalizes source exports into `workspace/raw/` and `workspace/processed/` |
| Attribution Analysis | `/marketing-analytics:attribution-analysis` | Bayesian MMM, multi-touch attribution, budget optimization |
| Experimentation | `/marketing-analytics:experimentation` | A/B testing, CUPED, sequential testing, Bayesian analysis |
| Paid Media | `/marketing-analytics:paid-media` | Cross-platform ad performance, anomaly detection, creative fatigue |
| Reporting | `/marketing-analytics:reporting` | Executive dashboards, cross-skill synthesis, insight generation |
| Compliance Review | `/marketing-analytics:compliance-review` | SEC/FINRA/FCA content screening (financial services) |

### P1 — Strategic/Tactical

| Skill | Command | Description |
|-------|---------|-------------|
| CLV Modeling | `/marketing-analytics:clv-modeling` | BG/NBD, Gamma-Gamma, Bayesian CLV with confidence intervals |
| Audience Segmentation | `/marketing-analytics:audience-segmentation` | RFM scoring, K-Means/DBSCAN clustering, cohort retention |
| Funnel Analysis | `/marketing-analytics:funnel-analysis` | Multi-step funnels, bottleneck identification, revenue impact |
| Email Analytics | `/marketing-analytics:email-analytics` | Deliverability, engagement (post-iOS 15), send-time optimization |
| Web Analytics | `/marketing-analytics:web-analytics` | GA4 extraction, behavioral patterns, predictive audiences |
| SEO & Content | `/marketing-analytics:seo-content` | Search Console, keyword tracking, AI search optimization (GEO) |

### P2 — Supporting

| Skill | Command | Description |
|-------|---------|-------------|
| CRM Lead Scoring | `/marketing-analytics:crm-lead-scoring` | Predictive scoring, pipeline velocity, win/loss analysis |
| Social Analytics | `/marketing-analytics:social-analytics` | Cross-platform social, sentiment analysis, share of voice |
| Competitive Intel | `/marketing-analytics:competitive-intel` | Keyword gap, traffic estimation, ad creative monitoring |
| VoC Analytics | `/marketing-analytics:voc-analytics` | NPS/CSAT/CES, theme extraction, satisfaction-behavior correlation |

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `marketing-analyst` | opus | Orchestrator that chains data-extraction → channel/measurement skills → attribution → reporting over the `workspace/` contracts, verifying each stage's outputs and stopping at real decision points. Tools: Read, Write, Edit, Bash, Grep, Glob. |
| `compliance-screener` | sonnet | Read-only reviewer backing the financial-services gate. Classifies content and screens it against the compliance-review SEC/FINRA/FCA references; advisory only, always recommends human compliance-officer review. Tools: Read, Grep, Glob. |

## Architecture

Skills communicate through three mechanisms:

1. **Shared Data Contracts** — Canonical schemas in `shared/schemas/data_contracts.md`
2. **Filesystem State** — Structured workspace directories (`workspace/raw/`, `workspace/processed/`, `workspace/analysis/`, `workspace/reports/`, `workspace/compliance/`)
3. **Description-Driven Composition** — Each skill's trigger description names prerequisites and downstream consumers

Builder-facing acceptance criteria and engineering conventions for the core skills live in `references/authoring-notes.md` (kept out of the runtime skill bodies). The portfolio map each skill's intake points to is `references/skill-index.md`.

## Financial Services Mode

When the workspace is tagged as financial services, all content-generating skills automatically route through `compliance-review` before distribution. The compliance skill checks against SEC Marketing Rule 206(4)-1, FINRA Rule 2210, and FCA financial promotions requirements.

## License

MIT
