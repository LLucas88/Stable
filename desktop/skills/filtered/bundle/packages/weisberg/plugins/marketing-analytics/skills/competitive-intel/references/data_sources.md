# Competitive Data Sources Reference

Available competitive data sources, APIs, and their coverage and limitations.

## SEO & Keyword Intelligence

### Semrush

- **Coverage**: 25B+ keywords across 140+ countries
- **Data provided**: Keyword rankings, search volume, keyword difficulty,
  competitor domain analytics, traffic estimates, backlink data
- **API access**: REST API with domain/keyword endpoints
- **Rate limits**: Vary by plan (10-50K requests/month)
- **Limitations**: Traffic estimates are modeled, not measured. Accuracy
  degrades for low-traffic sites and long-tail keywords. Position tracking
  frequency depends on plan tier.
- **Integration**: Export CSV to `workspace/raw/competitor_data.csv` or use
  API for automated pulls.

### Ahrefs

- **Coverage**: 28B+ keywords, 400B+ indexed pages
- **Data provided**: Keyword rankings, search volume, keyword difficulty,
  content gap analysis, backlink profile, referring domains
- **API access**: REST API v3
- **Rate limits**: Plan-dependent (500-10K rows per API call)
- **Limitations**: Search volume data uses clickstream modeling; may differ
  from Google Keyword Planner. Historical data depth varies by plan.
- **Integration**: CSV export or API.

### DataForSEO

- **Coverage**: Google, Bing, Yahoo across 200+ locations
- **Data provided**: SERP results, keyword data, competitor rankings,
  backlinks, on-page SEO data
- **API access**: REST API with pay-per-task pricing
- **Rate limits**: Concurrent task limits vary by plan
- **Limitations**: Raw SERP data requires processing. No pre-built competitive
  analysis — must be assembled from individual API calls.
- **Integration**: API-first; well-suited for automated pipelines.

## Traffic Estimation

### SimilarWeb

- **Coverage**: Top 10M websites globally
- **Data provided**: Traffic estimates (visits, unique visitors, pages/visit,
  bounce rate), traffic sources breakdown, audience overlap, industry benchmarks
- **API access**: REST API (Enterprise plans)
- **Rate limits**: Enterprise-tier dependent
- **Limitations**: Accuracy drops significantly for sites outside the top 100K.
  Data is directional, not precise. Monthly granularity only. Mobile app data
  and desktop data tracked separately.
- **Integration**: CSV export from dashboard or API.

### CTR-Curve Proxy Method

- **Coverage**: Any keyword set you track
- **Data provided**: Estimated organic click volume per keyword per competitor
- **Limitations**: Assumes standard CTR curves that may not hold for SERPs with
  heavy feature presence (ads, featured snippets, knowledge panels). Best used
  as a relative comparison, not absolute traffic estimation.
- **Integration**: Built into `scripts/share_of_voice.py`.

## Ad Creative Intelligence

### Meta Ad Library

- **Coverage**: All active and inactive Meta ads (Facebook, Instagram)
- **Data provided**: Ad creative (text, image, video), active dates, spend
  ranges, targeting (limited), page info
- **API access**: Ad Library API (free, requires Meta developer account)
- **Rate limits**: Standard Graph API limits
- **Limitations**: Spend shown as ranges, not exact values. Targeting info
  limited. No performance metrics (CTR, conversion) available.
- **Integration**: API or manual export.

### Google Ads Transparency Center

- **Coverage**: All Google Ads advertisers
- **Data provided**: Ad creatives, advertiser verification status, ad formats,
  geographic targeting, date ranges
- **API access**: No official API; manual review only
- **Rate limits**: N/A (manual access)
- **Limitations**: No spend or performance data. No bulk export capability.
  Limited historical depth.
- **Integration**: Manual monitoring with structured capture to CSV.

### SpyFu

- **Coverage**: Google Ads advertisers (US-focused, some international)
- **Data provided**: Competitor keywords (paid and organic), ad copy history,
  estimated spend, ad position history
- **API access**: REST API
- **Rate limits**: Plan-dependent
- **Limitations**: Spend estimates are modeled. Historical data accuracy
  decreases beyond 12 months. Coverage outside US is limited.
- **Integration**: CSV export or API.

## Social Media Intelligence

### Native platform analytics

- **Platforms**: Meta Business Suite, LinkedIn Analytics, X/Twitter Analytics,
  TikTok Analytics
- **Data provided**: Your own engagement metrics; limited competitor public data
- **Limitations**: No access to competitor private metrics. Public engagement
  counts only.
- **Integration**: Feed through social-analytics skill.

### Third-party social listening

- **Tools**: Brandwatch, Sprout Social, Hootsuite, Mention
- **Data provided**: Brand mentions, sentiment, share of conversation,
  competitor mention tracking
- **Limitations**: Coverage varies by platform. X/Twitter access increasingly
  restricted. Sentiment accuracy is ~70-80%.
- **Integration**: CSV export to `workspace/raw/competitor_data.csv`.

## Pricing Intelligence

### Public source monitoring

- **Sources**: Competitor websites, app stores, comparison sites, regulatory
  filings
- **Data provided**: Published pricing, feature matrices, promotional offers
- **Limitations**: Requires manual or scheduled scraping within ToS. Dynamic
  pricing may not be captured accurately. B2B pricing often not publicly listed.
- **Integration**: Manual capture to structured CSV.

## Data Quality & Freshness Guidelines

| Source Category    | Typical Freshness | Confidence Level | Cost         |
|--------------------|-------------------|------------------|--------------|
| SEO keyword data   | Daily-weekly      | Medium-high      | Paid plans   |
| Traffic estimates  | Monthly           | Low-medium       | Paid plans   |
| Ad creative        | Near real-time    | High (existence)  | Free-paid   |
| Social metrics     | Daily             | Medium           | Free-paid    |
| Pricing data       | Manual refresh    | High (at capture) | Free        |

### Key principles

1. **Always label confidence**: Every competitive metric must carry a confidence
   indicator (high/medium/low) and source attribution.
2. **Triangulate where possible**: Cross-reference multiple sources before
   drawing conclusions from any single data provider.
3. **Prefer relative over absolute**: Competitive rankings and ratios are more
   reliable than absolute traffic or spend estimates.
4. **Date-stamp everything**: All competitive data must include the date of
   collection. Flag data older than 30 days as potentially stale.
5. **Graceful degradation**: The skill must operate with partial data. If a paid
   source is unavailable, fall back to free alternatives and note the reduced
   coverage in outputs.
