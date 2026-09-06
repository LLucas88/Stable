# Shared Data Contracts

Canonical JSON Schema definitions shared across all 15 marketing analytics skills. Every skill references these schemas for both inputs and outputs, creating implicit structural coupling without explicit dependency declarations.

## Campaign Data Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| campaign_id | string | Yes | Unique campaign identifier |
| platform | enum | Yes | google_ads \| meta \| linkedin \| tiktok \| dv360 |
| date | date (ISO 8601) | Yes | Reporting date |
| spend | decimal | Yes | Daily spend in base currency |
| impressions | integer | Yes | Number of impressions served |
| clicks | integer | Yes | Number of clicks recorded |
| conversions | decimal | Yes | Number of conversions (may be fractional) |
| revenue | decimal | No | Revenue attributed to campaign |

## Segment Definition Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | Yes | Unique customer identifier |
| segment_name | string | Yes | Human-readable segment label |
| segment_method | enum | Yes | rfm \| kmeans \| dbscan \| manual |
| rfm_score | string | No | Three-digit RFM score (e.g., '555') |
| cluster_id | integer | No | Cluster assignment for behavioral clustering |
| probability_alive | decimal | No | From CLV model (0.0 to 1.0) |
| clv_estimate | decimal | No | Predicted CLV from clv-modeling skill |
| assigned_at | datetime | Yes | Timestamp of segment assignment |

## Experiment Result Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| experiment_id | string | Yes | Unique experiment identifier |
| variant | string | Yes | Variant name (control, treatment_a, etc.) |
| metric_name | string | Yes | Name of the measured metric |
| sample_size | integer | Yes | Number of units in this variant |
| point_estimate | decimal | Yes | Estimated metric value or treatment effect |
| ci_lower | decimal | Yes | Lower bound of confidence/credible interval |
| ci_upper | decimal | Yes | Upper bound of confidence/credible interval |
| p_value | decimal | No | Frequentist p-value (if applicable) |
| bayesian_prob_best | decimal | No | Bayesian probability of being best variant |
| cuped_adjusted | boolean | Yes | Whether CUPED variance reduction was applied |

## CLV Prediction Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customer_id | string | Yes | Unique customer identifier |
| prediction_date | date | Yes | Date the prediction was generated |
| horizon_months | integer | Yes | Prediction horizon (6, 12, 24) |
| expected_transactions | decimal | Yes | Predicted number of future transactions |
| expected_monetary_value | decimal | Yes | Predicted average transaction value |
| clv_estimate | decimal | Yes | Combined CLV prediction |
| clv_ci_lower | decimal | Yes | Lower bound of CLV confidence interval |
| clv_ci_upper | decimal | Yes | Upper bound of CLV confidence interval |
| probability_alive | decimal | Yes | Probability customer is still active (0.0-1.0) |
| clv_segment | string | No | CLV tier (top_10pct, top_25pct, etc.) |

## Unified Media Performance Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| campaign_id | string | Yes | Unified campaign identifier |
| platform | enum | Yes | Source platform |
| date | date | Yes | Reporting date |
| spend | decimal | Yes | Spend in base currency (Decimal arithmetic) |
| impressions | integer | Yes | Impressions served |
| clicks | integer | Yes | Clicks recorded |
| conversions | decimal | Yes | Conversions (may be fractional) |
| revenue | decimal | No | Attributed revenue |
| cpm | decimal | Yes | Cost per thousand impressions |
| cpc | decimal | Yes | Cost per click |
| ctr | decimal | Yes | Click-through rate (0.0-1.0) |
| cpa | decimal | No | Cost per acquisition |
| roas | decimal | No | Return on ad spend |
| attribution_window | string | Yes | Attribution model label |

## Compliance Review Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| review_id | string | Yes | Unique review identifier |
| content_path | string | Yes | Path to reviewed content |
| review_timestamp | datetime | Yes | When review was performed |
| jurisdiction | enum | Yes | sec \| finra \| fca \| multiple |
| content_classification | string | Yes | retail \| institutional \| correspondence |
| issues | array | Yes | List of findings (severity, rule_citation, description, remediation) |
| overall_verdict | enum | Yes | pass \| fail \| warning |
| disclosures_required | array | Yes | List of required disclosures |
| archival_required | boolean | Yes | Whether SEC 17a-4 archival is needed |
| retention_period_years | integer | No | Required retention period |

## Workspace Directory Convention

| Directory | Purpose |
|-----------|---------|
| workspace/raw/ | Data extracted from source platforms (CSV, JSON) |
| workspace/processed/ | Normalized, cleaned data ready for analysis |
| workspace/analysis/ | Analytical outputs: model results, scores, anomalies |
| workspace/reports/ | Final deliverables: HTML dashboards, XLSX, PPTX, DOCX |
| workspace/compliance/ | Compliance review artifacts: reports, compliant content, archival manifests |
