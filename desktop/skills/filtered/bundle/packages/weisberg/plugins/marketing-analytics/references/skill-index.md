# Marketing Analytics Plugin — Skill Index

16 interconnected skills plus two agents for comprehensive marketing analytics. Skills are composable: they communicate through shared data contracts and a structured workspace filesystem. The six core skills (data-extraction, attribution-analysis, experimentation, paid-media, reporting, compliance-review) are authored as operating loops with strict `## Contract` / `## Workflow` / `## Output Format` / `## Anti-Patterns` sections, mode classification, decision gates, and completion status.

## Skills by Priority

### P0 — Foundational

- **data-extraction** — Upstream ingestion: lands CSV/JSON exports, described API pulls, and manual pastes into `workspace/raw/`, validates them against the shared data contracts, and writes normalized copies to `workspace/processed/`. Run first when a downstream skill reports a missing workspace input. Triggers: extract data, pull data from, load CSV/JSON into workspace, connect data source, refresh data, normalize raw data.
- **attribution-analysis** — Bayesian marketing mix modeling, multi-touch attribution, incrementality measurement. Triggers: attribution, ROAS, MMM, channel contribution, budget optimization, adstock, saturation curves, Shapley value, marketing ROI.
- **experimentation** — A/B testing, CUPED variance reduction, sequential testing, causal analysis. Triggers: A/B test, experiment, hypothesis test, p-value, confidence interval, CUPED, power analysis, sample size, MDE, sequential test, Bayesian AB test, uplift modeling.
- **paid-media** — Cross-platform ad performance (Google, Meta, LinkedIn, TikTok, DV360), anomaly detection, creative fatigue. Triggers: paid media, ad performance, Google Ads, Meta Ads, SEM, PPC, ROAS, CPA, CPM, CTR, budget pacing, creative fatigue, negative keywords.
- **reporting** — Executive dashboards, cross-skill synthesis, natural language insight generation. Triggers: dashboard, report, executive summary, KPI dashboard, marketing scorecard, board deck, performance review.
- **compliance-review** — SEC/FINRA/FCA regulatory content screening. Mandatory gate in financial services mode. Triggers: compliance review, regulatory check, SEC, FINRA, FCA, disclosure, disclaimer, GIPS, archival.

### P1 — Strategic / Tactical

- **clv-modeling** — Probabilistic CLV using BG/NBD and Gamma-Gamma with Bayesian extensions. Triggers: CLV, LTV, customer lifetime value, CLV:CAC ratio, BG/NBD, Gamma-Gamma, churn probability, high-value customers.
- **audience-segmentation** — RFM scoring, K-Means/DBSCAN clustering, cohort retention analysis. Triggers: segmentation, customer segments, cohort analysis, RFM, behavioral clustering, personas, retention curves, segment migration.
- **funnel-analysis** — Multi-step funnel tracking, bottleneck identification, revenue impact estimation. Triggers: funnel, conversion funnel, drop-off, CRO, bottleneck, checkout flow, abandonment, user flow.
- **email-analytics** — Deliverability monitoring, click-based engagement analysis, lifecycle flow optimization. Triggers: email analytics, deliverability, bounce rate, click rate, lifecycle email, drip campaign, send-time optimization, SPF/DKIM/DMARC.
- **web-analytics** — GA4 extraction, behavioral pattern detection, anomaly detection, predictive audiences. Triggers: web analytics, GA4, Google Analytics, site traffic, sessions, bounce rate, traffic sources, UTM parameters, Mixpanel, Amplitude.
- **seo-content** — Search Console integration, keyword tracking, content performance, AI search (GEO). Triggers: SEO, keyword ranking, search console, organic search, content audit, technical SEO, AI Overviews, GEO, SERP, page speed.

### P2 — Supporting

- **crm-lead-scoring** — Predictive lead scoring, pipeline velocity, win/loss analysis. Triggers: lead scoring, MQL, SQL, pipeline analytics, pipeline velocity, win rate, CRM analytics, propensity model.
- **social-analytics** — Cross-platform social performance, sentiment analysis, competitive benchmarking. Triggers: social media analytics, Facebook insights, Instagram analytics, LinkedIn analytics, TikTok analytics, social engagement, share of voice, social sentiment.
- **competitive-intel** — Competitor keyword tracking, traffic estimation, ad creative monitoring, pricing intelligence. Triggers: competitive analysis, competitor research, share of voice, market share, SWOT, competitor monitoring, pricing intelligence.
- **voc-analytics** — NPS/CSAT/CES tracking, open-text theme extraction, satisfaction-behavior correlation. Triggers: NPS, CSAT, CES, survey analytics, customer feedback, voice of customer, VoC, feedback themes.

## Skill Dependency Graph

```
data-extraction (upstream ingestion skill; lands workspace/raw/ + workspace/processed/)
    |
    +-- attribution-analysis <-> experimentation (calibration loop)
    |       |
    |       +-> reporting -> compliance-review (FS mode)
    |
    +-- paid-media -> attribution-analysis, reporting, funnel-analysis
    |
    +-- web-analytics -> funnel-analysis, seo-content, paid-media, audience-segmentation
    |
    +-- clv-modeling -> audience-segmentation -> experimentation, email-analytics, paid-media
    |
    +-- email-analytics -> reporting, compliance-review (FS mode)
    |
    +-- seo-content -> competitive-intel, paid-media (keyword overlap)
    |
    +-- social-analytics -> competitive-intel, attribution-analysis
    |
    +-- crm-lead-scoring -> paid-media, email-analytics, reporting
    |
    +-- voc-analytics -> seo-content, email-analytics, reporting
```

## Workspace Directory Structure

| Directory | Purpose |
|-----------|---------|
| `workspace/raw/` | Data extracted from source platforms (CSV, JSON) |
| `workspace/processed/` | Normalized, cleaned data ready for analysis |
| `workspace/analysis/` | Analytical outputs: model results, scores, anomalies |
| `workspace/reports/` | Final deliverables: HTML dashboards, XLSX, PPTX, DOCX |
| `workspace/compliance/` | Compliance review artifacts and archival manifests |
| `shared/schemas/` | Data contracts shared across all skills |
| `shared/definitions/` | Marketing taxonomy, metric glossary, benchmarks |
| `shared/utils/` | Common Python utilities |

## Agents

- **marketing-analyst** (model: opus) — Orchestrator. Chains data-extraction → channel/measurement skills → attribution-analysis → reporting over the `workspace/` contracts, verifying each stage's outputs before advancing and surfacing each skill's decision gates rather than answering them itself. Stops and reports on hard-gate failures, `BLOCKED`/`NEEDS_CONTEXT` from a specialist, real decision points, and the FS-mode compliance gate.
- **compliance-screener** (model: sonnet, read-only) — Backs the financial-services gate. Classifies customer-facing content and screens it against the compliance-review SEC/FINRA/FCA references, returning severity-tagged findings with rule citations. Advisory only; never certifies; always recommends human compliance-officer review.

## Financial Services Mode

When the workspace is tagged as financial services, **compliance-review** acts as a mandatory gate. All customer-facing content from reporting, email-analytics, paid-media, seo-content, social-analytics, and attribution-analysis must route through compliance-review before distribution. The skill checks SEC Marketing Rule 206(4)-1, FINRA Rule 2210, and FCA requirements. It is advisory only — always requires human compliance officer confirmation.
