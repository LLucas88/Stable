---
name: weisberg-competitive-intel
description: Use when the user mentions competitive analysis, competitor research, competitive intelligence, competitor keywords, competitor ads, share of voice, market share, competitive benchmarking, competitor traffic, competitor strategy, competitive landscape, SWOT, competitor monitoring, ad spy, competitor ad creative, pricing intelligence, or market positioning. Also trigger on 'what are competitors doing' or 'how do we compare to [competitor].' For your own organic keyword rankings use seo-content; for your own social performance and sentiment use social-analytics; this skill synthesizes an outward, cross-channel competitor view. Consumes keyword data from seo-content and social benchmarks from social-analytics.
metadata:
  source-name: competitive-intel
  bundle: ops-expanded-2026-09-06
  upstream-disable-model-invocation: 'False'
  upstream-metadata: '{}'
---

> 接入自研 Agent 前阅读本目录 ADAPTATION.md；本技能按任务加载，工具调用服从你的系统规则与用户授权。

# Competitive Intelligence

Competitor keyword-gap and traffic estimation, ad-creative and pricing monitoring,
cross-channel share-of-voice aggregation, and data-grounded strategic synthesis.

## Contract

**Role:** Advisory analyst. Synthesizes public competitive signals into strategy;
does not scrape restricted sources or make claims beyond the data. Computation runs
in deterministic Python scripts.

**Mode:**
- `quick` — keyword-gap + single-channel SOV.
- `standard` (default) — add cross-channel SOV aggregation and a competitor
  scorecard.
- `deep` — add traffic estimation, pricing intelligence, and change-detection
  alerting.

**When to use:** competitor keyword/traffic/ad/pricing benchmarking, cross-channel
share of voice, competitive scorecards and strategy shifts.

**When NOT to use:** your own organic SEO → `seo-content`; your own social
performance → `social-analytics`; your own paid-ad metrics → paid-media. See
`../../references/skill-index.md`.

**Evidence required (inputs):**
- `workspace/analysis/keyword_performance.json` — your keyword data from
  seo-content (recommended).
- `workspace/analysis/social_benchmarks.json` — social SOV from social-analytics
  (optional).
- `workspace/raw/competitor_data.csv` — third-party exports (Semrush, SimilarWeb,
  SpyFu). Optional but drives most of the analysis.

**Depends on:** seo-content, social-analytics, paid-media (upstream signals).
**Feeds into:** attribution-analysis (MMM control variables), reporting. Builder
detail in `references/authoring-notes.md`.

**Hard STOP (sourcing integrity):** STOP and refuse if the only path to a data
point is scraping a competitor site in violation of its terms of service, or
presenting a non-public/proprietary competitor figure. Use public sources only;
label every traffic estimate with methodology and confidence.

Parse `$ARGUMENTS` for the competitor list, channel weights, or data sources.

## Workflow

1. **Scope gate (AskUserQuestion).** Competitive scope and available data drive the
   whole analysis. Confirm before running:
   - **Question:** "Which competitors and which data do we have?"
   - **Options:** (a) *Named competitors + third-party export* — full scorecard;
     (b) *Named competitors, owned data only* — keyword overlap from seo-content /
     social benchmarks, gaps labeled partial; (c) *Discovery help* — I propose a
     shortlist from provided signals for you to confirm (no auto-monitoring).
   Do not auto-discover competitors beyond a proposed, user-confirmed list.

2. **Keyword gap.** Run `scripts/keyword_gap.py`: classify each keyword
   missing/weak/strong/shared/unique; score gaps with
   `search_volume * (1 - keyword_difficulty) * business_relevance`.

3. **Traffic estimation** (deep mode). Estimate competitor traffic via third-party
   estimates, CTR-curve proxy, or relative indexing — each labeled with method and
   confidence.

4. **Ad-creative monitoring** (deep mode). Track ad copy, offers, landing pages,
   and messaging themes from public sources (Meta Ad Library, Google Ads
   Transparency, exports in `workspace/raw/competitor_data.csv`). Flag potentially
   non-compliant performance claims.

5. **Share of voice.** Run `scripts/share_of_voice.py`: aggregate organic, paid,
   social, and earned signals into a composite SOV with configurable channel
   weights (default equal). See `references/competitive_methodology.md`.

6. **Pricing intelligence** (deep mode). Track public pricing, promo patterns, and
   positioning; label stale data with a last-verified date. Apply the sourcing Hard
   STOP.

7. **Synthesize.** Run `scripts/competitive_synthesis.py`: per-competitor
   scorecard (search, paid, social, pricing, trajectory). Every recommendation
   links to a specific data point.

8. **Change detection** (deep mode). Run `scripts/competitive_alerting.py`:
   percentage-based thresholds flag new keyword targeting, ad/offer changes,
   traffic shifts, pricing changes, and social spikes.

9. **Report.** Write outputs and the HTML briefing.

## Output Format

Artifacts:

| File | Contents |
|------|----------|
| `workspace/analysis/competitive_landscape.json` | Aggregated competitive intelligence across channels |
| `workspace/analysis/keyword_gap.json` | Keyword opportunities with volume, difficulty, score |
| `workspace/analysis/competitive_alerts.json` | New activities and strategy shifts |
| `workspace/reports/competitive_briefing.html` | Executive competitive briefing |

Report states: competitor list, channels covered, data sources used, and coverage
gaps. Traffic estimates carry method + confidence labels.

**Financial services mode:** use only public information; competitor performance
claims sourced from public filings (SEC EDGAR, FINRA BrokerCheck) are acceptable,
internal estimates are not; flag competitor claims that look non-compliant
(guaranteed returns, missing risk disclosures) for internal awareness; make no
investment-performance comparisons without disclaimers and matched time periods.
Customer-facing competitive claims route through **compliance-review**.

**Completion status:**
- `DONE` — scorecard, keyword gap, and requested SOV/alerts written.
- `DONE_WITH_CONCERNS` — e.g., no third-party data (partial coverage), stale
  pricing, single-channel SOV only.
- `BLOCKED` — sourcing Hard STOP tripped or no usable inputs; state the fix.
- `NEEDS_CONTEXT` — competitor scope unresolved by the user.

## Anti-Patterns

- Scraping competitor sites against terms of service, or citing non-public data.
- Presenting third-party traffic estimates as precise figures.
- Auto-discovering competitors and expanding scope without user confirmation.
- Generic "best practice" recommendations not tied to a specific data point.
- Absolute-value change thresholds that misfire across differently sized
  competitors.
- Float arithmetic on monetary values instead of `decimal.Decimal`.
