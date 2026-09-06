# Competitive Methodology Reference

Share of voice calculation, competitive scoring framework, and analysis methodology.

## Share of Voice Calculation

### Organic Search SOV

Organic share of voice measures the proportion of total available search
visibility captured by each competitor across a tracked keyword set.

#### Formula

For each keyword `k` in the tracked set:

```
visibility(k, competitor) = search_volume(k) * ctr_curve(position(k, competitor))
```

Where `ctr_curve(position)` maps ranking position to expected click-through rate:

| Position | Estimated CTR |
|----------|---------------|
| 1        | 0.316         |
| 2        | 0.152         |
| 3        | 0.097         |
| 4        | 0.068         |
| 5        | 0.049         |
| 6        | 0.037         |
| 7        | 0.029         |
| 8        | 0.024         |
| 9        | 0.020         |
| 10       | 0.017         |
| 11-20    | 0.005         |
| 21+      | 0.001         |
| Not ranked | 0.0         |

Then:

```
organic_sov(competitor) = sum(visibility(k, competitor) for all k) /
                          sum(max(visibility(k, c) for all c) for all k)
```

This produces a 0-1 score representing the share of maximum possible visibility.

#### Adjustments

- Apply category weighting if keywords span multiple product/service categories.
- Exclude branded keywords from competitive SOV (track separately).
- Update CTR curves periodically — SERP feature presence (featured snippets,
  ads) reduces organic CTR.

### Paid Search SOV

Paid SOV uses impression share data where available:

```
paid_sov(competitor) = competitor_impression_share / sum(all_impression_shares)
```

When impression share data is unavailable, proxy with ad position frequency
from third-party tools.

### Social Media SOV

Social SOV measures relative share of engagement-weighted social activity:

```
social_sov(competitor) = weighted_engagements(competitor) /
                         sum(weighted_engagements(all))
```

Engagement weights:
- Shares/Retweets: 3x
- Comments: 2x
- Likes/Reactions: 1x
- Posts (volume): 0.5x

### Composite SOV

```
composite_sov = w_organic * organic_sov +
                w_paid * paid_sov +
                w_social * social_sov +
                w_earned * earned_sov
```

Default weights (equal): `w_organic = w_paid = w_social = w_earned = 0.25`.
Override via workspace configuration when channel importance differs.

## Competitive Scoring Framework

### Per-Competitor Scorecard Dimensions

Each competitor is scored across five dimensions on a 0-100 scale:

| Dimension          | Inputs                                                    | Weight |
|--------------------|-----------------------------------------------------------|--------|
| Search strength    | Organic SOV, keyword count, content velocity              | 0.25   |
| Paid intensity     | Paid SOV, ad creative freshness, offer frequency          | 0.20   |
| Social presence    | Social SOV, audience growth rate, engagement quality      | 0.20   |
| Content quality    | Backlink profile, domain authority delta, content depth   | 0.20   |
| Market positioning | Pricing position, offer differentiation, brand mentions   | 0.15   |

### Scoring methodology

For each dimension, normalize raw metrics to 0-100 using min-max scaling across
the competitive set:

```
score(competitor, dimension) = (raw_value - min_value) / (max_value - min_value) * 100
```

### Composite competitive score

```
competitive_score(competitor) = sum(score(d) * weight(d) for d in dimensions)
```

### Trajectory detection

Determine whether each competitor is accelerating, stable, or decelerating by
computing the slope of their composite score over the trailing 4 analysis
periods:

- Slope > +5 points/period: accelerating
- Slope between -5 and +5: stable
- Slope < -5 points/period: decelerating

## Opportunity Scoring for Keyword Gaps

### Formula

```
opportunity_score = search_volume * (1 - keyword_difficulty) * business_relevance
```

### Business relevance scoring

Business relevance is assigned per keyword based on:

| Relevance Tier | Score | Criteria                                           |
|----------------|-------|----------------------------------------------------|
| Core           | 1.0   | Directly describes a product or service offered     |
| Adjacent       | 0.7   | Related topic that qualified prospects search for   |
| Informational  | 0.4   | Top-of-funnel educational content opportunity       |
| Tangential     | 0.1   | Loosely related; low commercial intent              |

### Prioritization matrix

After scoring, bucket opportunities into:

| Bucket       | Criteria                              | Recommended action            |
|--------------|---------------------------------------|-------------------------------|
| Quick wins   | High score, low difficulty            | Create content immediately    |
| Strategic    | High score, high difficulty           | Long-term content investment  |
| Fill gaps    | Medium score, low difficulty          | Batch content production      |
| Monitor      | Low score                             | Track but do not prioritize   |

## Change Detection Methodology

### Percentage-based thresholds

All change detection uses percentage change to normalize across competitors of
varying sizes:

```
pct_change = (current_value - previous_value) / previous_value * 100
```

### Default alert thresholds

| Metric                | Threshold | Alert Level |
|-----------------------|-----------|-------------|
| Keyword position gain | > 20%     | Medium      |
| New keywords detected | > 10      | Medium      |
| Ad copy change        | Any       | Low         |
| Traffic share shift   | > 15%     | High        |
| Pricing change        | Any       | High        |
| SOV composite shift   | > 10%     | Medium      |

### Smoothing

Apply a 7-day rolling average before computing change percentages to avoid
false alerts from daily volatility.
