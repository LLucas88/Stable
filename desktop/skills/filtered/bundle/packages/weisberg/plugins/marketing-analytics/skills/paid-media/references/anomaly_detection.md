# Anomaly Detection Methods

Reference documentation for statistical anomaly detection applied to paid media
metrics (spend, CPA, CTR, conversion rate). Three complementary methods are used
to balance sensitivity, interpretability, and multivariate coverage.

## Method 1: Rolling Z-Score

### Overview

Compute a Z-score for each day's metric value relative to a trailing rolling
window. Flag values that exceed a configurable threshold.

### Algorithm

```
z_score(x_t) = (x_t - mean(x_{t-w}...x_{t-1})) / std(x_{t-w}...x_{t-1})
```

Where `w` is the rolling window size (default 28 days).

### Parameters

| Parameter        | Default | Description                                 |
|------------------|---------|---------------------------------------------|
| window_size      | 28      | Number of trailing days for mean/std        |
| threshold        | 2.5     | Absolute Z-score to trigger alert           |
| min_observations | 14      | Minimum days before Z-score is computed     |

### Day-of-Week Adjustment

Paid media metrics exhibit strong day-of-week seasonality (weekday vs weekend
spend patterns). Before computing Z-scores:

1. Compute the day-of-week index for each observation.
2. Calculate the day-of-week adjustment factor as the ratio of that day's
   historical mean to the overall mean.
3. Divide each observation by its adjustment factor before Z-score calculation.

This prevents every Monday from appearing anomalous relative to a weekend-heavy
trailing window.

### Known Events

Maintain a calendar of known events (Black Friday, Cyber Monday, quarter-end
budget flushes, product launches). Suppress anomaly alerts for dates within the
event window, or use event-aware baselines.

## Method 2: Isolation Forest

### Overview

Unsupervised tree-based anomaly detection that isolates observations by randomly
selecting features and split values. Anomalies require fewer splits to isolate,
yielding a lower anomaly score.

### When to Use

- Multivariate anomalies (e.g., spend is normal but CPA and CTR moved together
  in an unusual pattern).
- Detecting novel anomaly shapes that Z-score misses.
- As a secondary confirmation signal alongside Z-score.

### Parameters

| Parameter        | Default | Description                                 |
|------------------|---------|---------------------------------------------|
| n_estimators     | 100     | Number of isolation trees                   |
| contamination    | 0.05    | Expected proportion of anomalies            |
| features         | spend, cpa, ctr, conv_rate | Metric columns used as features |
| max_samples      | 256     | Subsample size per tree                     |

### Feature Engineering

Before fitting, compute the following derived features for each campaign-day:

- Spend delta (day-over-day change)
- CPA ratio to 7-day mean
- CTR ratio to 7-day mean
- Conversion rate ratio to 7-day mean

Normalize all features to zero mean and unit variance before fitting.

### Interpretation

The isolation forest outputs an anomaly score per observation. Map these to
actionable alerts:

| Score Range   | Label    | Action                                     |
|---------------|----------|--------------------------------------------|
| < -0.3        | Anomaly  | Investigate immediately                    |
| -0.3 to -0.1  | Warning  | Monitor for consecutive occurrences        |
| > -0.1        | Normal   | No action                                  |

## Method 3: Seasonal Decomposition (STL)

### Overview

Decompose each metric's time series into trend, seasonal, and residual
components using STL (Seasonal and Trend decomposition using Loess). Flag
anomalies based on residual magnitude.

### Algorithm

1. Apply STL decomposition with period = 7 (weekly seasonality).
2. Extract the residual component.
3. Compute the IQR of residuals.
4. Flag observations where |residual| > k * IQR (default k = 3).

### Parameters

| Parameter      | Default | Description                                 |
|----------------|---------|---------------------------------------------|
| period         | 7       | Seasonal period in days                     |
| seasonal_window| 13      | Loess window for seasonal component         |
| trend_window   | 21      | Loess window for trend component            |
| iqr_multiplier | 3.0     | Residual threshold as multiple of IQR       |

### Advantages Over Z-Score

- Handles gradual trend changes without triggering false positives.
- Explicitly models weekly seasonality rather than relying on adjustment factors.
- Better at distinguishing a metric that is declining steadily (trend) from one
  that spiked unexpectedly (residual).

## Alert Severity Matrix

Combine signals from multiple methods to determine final severity.

| Z-Score Flag | Isolation Forest Flag | STL Flag | Final Severity |
|--------------|----------------------|----------|----------------|
| Yes          | Yes                  | Yes      | Critical       |
| Yes          | Yes                  | No       | High           |
| Yes          | No                   | Yes      | High           |
| No           | Yes                  | Yes      | High           |
| Yes          | No                   | No       | Medium         |
| No           | Yes                  | No       | Low            |
| No           | No                   | Yes      | Low            |

## Root Cause Drill-Down

When an anomaly is confirmed:

1. Identify the metric and date.
2. Drill to campaign level: which campaign(s) contributed most to the deviation.
3. Drill to ad group level within the flagged campaign.
4. For search campaigns, drill to keyword level.
5. Report the entity, metric delta, and percentage contribution to the anomaly.

## Output Schema

```json
{
  "date": "2026-03-18",
  "platform": "google",
  "campaign_id": "12345",
  "metric": "cpa",
  "observed_value": 42.50,
  "expected_value": 28.00,
  "z_score": 3.1,
  "isolation_score": -0.35,
  "severity": "critical",
  "root_cause": "Ad group 'Brand - Exact' CPA spiked due to 40% drop in conversion rate"
}
```
