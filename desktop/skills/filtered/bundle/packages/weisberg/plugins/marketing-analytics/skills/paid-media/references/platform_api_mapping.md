# Platform API Metric Mapping

Canonical metric taxonomy mapping across Google Ads, Meta Ads, LinkedIn Ads,
TikTok Ads, and DV360. Use this reference when normalizing raw platform exports
into the unified media schema.

## Core Metrics

### Impressions

| Platform    | API Field            | Notes                                    |
|-------------|----------------------|------------------------------------------|
| Google Ads  | `metrics.impressions`| Includes search, display, video          |
| Meta Ads    | `impressions`        | Deduplicated across placements           |
| LinkedIn    | `impressions`        | Sponsored content + message ads          |
| TikTok      | `impressions`        | In-feed, TopView, branded effects        |
| DV360       | `metrics.impressions`| Includes viewable and non-viewable       |

### Clicks

| Platform    | API Field           | Notes                                     |
|-------------|---------------------|-------------------------------------------|
| Google Ads  | `metrics.clicks`    | Excludes invalid clicks                   |
| Meta Ads    | `clicks`            | All clicks (link, outbound, other)        |
| LinkedIn    | `clicks`            | Includes social actions unless filtered   |
| TikTok      | `clicks`            | Destination clicks only                   |
| DV360       | `metrics.clicks`    | Post-dedup                                |

**Meta clarification**: Use `outbound_clicks` for link click equivalence with
other platforms. The generic `clicks` field inflates counts with social actions.

### Spend

| Platform    | API Field                      | Currency handling                    |
|-------------|--------------------------------|--------------------------------------|
| Google Ads  | `metrics.cost_micros`          | Micros (divide by 1,000,000)         |
| Meta Ads    | `spend`                        | Account currency, string format      |
| LinkedIn    | `costInLocalCurrency`          | Local currency decimal               |
| TikTok      | `spend`                        | Account currency float               |
| DV360       | `metrics.revenue_advertiser_currency` | Advertiser currency            |

**Important**: Google Ads returns cost in micros. Always divide by 1e6 and
convert to `Decimal` before any arithmetic.

### Conversions

| Platform    | API Field                          | Default window   |
|-------------|------------------------------------|------------------|
| Google Ads  | `metrics.conversions`              | 30-day click     |
| Meta Ads    | `actions` (filtered by action_type)| 7-day click, 1-day view |
| LinkedIn    | `externalWebsiteConversions`       | 30-day click     |
| TikTok      | `conversions`                      | 7-day click      |
| DV360       | `metrics.total_conversions`        | Floodlight config|

**Attribution window warning**: Meta's default 7-day click window will
systematically under-count relative to Google's 30-day window. Label every
conversion metric with its attribution window in the normalized output.

### Revenue / Conversion Value

| Platform    | API Field                           | Notes                          |
|-------------|-------------------------------------|--------------------------------|
| Google Ads  | `metrics.conversions_value`         | Sum of all conversion values   |
| Meta Ads    | `action_values` (purchase)          | Filter to purchase action type |
| LinkedIn    | `conversionValueInLocalCurrency`    | May be zero if not configured  |
| TikTok      | `value`                             | Total value of conversions     |
| DV360       | `metrics.total_conversion_value`    | Floodlight revenue variable    |

## Derived Metrics

Compute these after normalization. Use `Decimal` division with explicit
rounding.

| Metric | Formula                        | Precision |
|--------|--------------------------------|-----------|
| CPC    | spend / clicks                 | 2 decimals|
| CTR    | clicks / impressions           | 4 decimals|
| CPA    | spend / conversions            | 2 decimals|
| ROAS   | revenue / spend                | 2 decimals|
| CPM    | (spend / impressions) * 1000   | 2 decimals|

Handle division-by-zero: return `None` when the denominator is zero.

## Campaign Structure Mapping

| Unified Term | Google Ads   | Meta Ads   | LinkedIn    | TikTok       | DV360           |
|--------------|-------------|------------|-------------|--------------|-----------------|
| Campaign     | Campaign    | Campaign   | Campaign    | Campaign     | Insertion Order |
| Ad Group     | Ad Group    | Ad Set     | Campaign Group | Ad Group  | Line Item       |
| Ad           | Ad          | Ad         | Creative    | Ad           | Creative        |

## Audience Dimensions

| Dimension   | Google Ads          | Meta Ads           | LinkedIn         | TikTok          |
|-------------|---------------------|--------------------|------------------|-----------------|
| Age         | `age_range_type`    | `age`              | `member_age`     | `age`           |
| Gender      | `gender_type`       | `gender`           | `member_gender`  | `gender`        |
| Device      | `device`            | `device_platform`  | N/A              | `device_type`   |
| Placement   | `network`           | `publisher_platform`| N/A             | `placement`     |
| Geography   | `geo_target_city`   | `country`          | `member_country` | `country_code`  |

## Date and Timezone Handling

- Google Ads: reports in account timezone by default.
- Meta Ads: reports in ad account timezone.
- LinkedIn: reports in UTC.
- TikTok: reports in ad account timezone.
- DV360: reports in advertiser timezone.

Normalize all dates to UTC before cross-platform aggregation. Store the original
platform timezone alongside for auditability.
