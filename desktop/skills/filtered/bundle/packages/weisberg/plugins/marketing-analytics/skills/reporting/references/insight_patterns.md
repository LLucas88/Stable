# Insight Patterns

Pattern library for translating statistical results into business language.
Used by `scripts/generate_insights.py` to produce natural language insights
from analytical outputs.

## Pattern Schema

Each pattern defines a detection rule and a set of language templates.

```yaml
pattern_id: string
category: trend | anomaly | comparison | milestone | correlation | forecast
detection:
  metric_type: string
  condition: string        # Logical condition to evaluate
  threshold: float         # Minimum magnitude to trigger
priority_formula: string   # How to compute business impact rank
templates:
  positive: string         # Template when the finding is favorable
  negative: string         # Template when the finding is unfavorable
  neutral: string          # Template when the finding is ambiguous
```

Template variables are enclosed in `{curly_braces}` and populated at runtime.

## Trend Patterns

### Sustained Increase

```yaml
pattern_id: trend_sustained_increase
category: trend
detection:
  metric_type: any_numeric
  condition: "3+ consecutive periods of increase"
  threshold: 5.0  # Cumulative percent change
priority_formula: "abs(cumulative_change_pct) * metric_business_weight"
templates:
  positive: >
    {metric_name} has risen for {consecutive_periods} consecutive {period_type}s,
    climbing {cumulative_change_pct}% from {start_value} to {end_value}
    ({start_date} to {end_date}). This sustained momentum suggests
    {suggested_driver}.
  negative: >
    {metric_name} has increased for {consecutive_periods} consecutive
    {period_type}s, rising {cumulative_change_pct}% to {end_value}. While
    directionally positive, the rate of increase is decelerating — the most
    recent {period_type} grew only {latest_change_pct}%.
```

### Sustained Decrease

```yaml
pattern_id: trend_sustained_decrease
category: trend
detection:
  metric_type: any_numeric
  condition: "3+ consecutive periods of decrease"
  threshold: 5.0
priority_formula: "abs(cumulative_change_pct) * metric_business_weight"
templates:
  negative: >
    {metric_name} has declined for {consecutive_periods} consecutive
    {period_type}s, falling {cumulative_change_pct}% from {start_value} to
    {end_value} ({start_date} to {end_date}). Recommend investigating
    {suggested_investigation_area}.
  positive: >
    {metric_name} has dropped {cumulative_change_pct}% over
    {consecutive_periods} {period_type}s to {end_value}. For this cost metric,
    the downward trend represents a positive efficiency gain.
```

### Trend Reversal

```yaml
pattern_id: trend_reversal
category: trend
detection:
  metric_type: any_numeric
  condition: "direction change after 3+ periods of consistent direction"
  threshold: 3.0  # Percent change in new direction
priority_formula: "abs(reversal_magnitude_pct) * metric_business_weight * 1.5"
templates:
  positive: >
    {metric_name} reversed its {previous_direction} trend, {new_direction}
    {reversal_magnitude_pct}% in the latest {period_type} to {current_value}.
    This follows {previous_periods} {period_type}s of consecutive
    {previous_direction}. The reversal coincides with {potential_catalyst}.
  negative: >
    {metric_name} reversed course after {previous_periods} {period_type}s of
    {previous_direction}, {new_direction} {reversal_magnitude_pct}% to
    {current_value}. Monitor closely over the next {period_type} to determine
    if this is a sustained shift or a one-time fluctuation.
```

## Anomaly Patterns

### Statistical Outlier

```yaml
pattern_id: anomaly_statistical_outlier
category: anomaly
detection:
  metric_type: any_numeric
  condition: "value exceeds 2 standard deviations from trailing 12-period mean"
  threshold: 2.0  # Standard deviations
priority_formula: "abs(z_score) * metric_business_weight * 2.0"
templates:
  positive: >
    {metric_name} reached {current_value} on {date}, which is
    {z_score:.1f} standard deviations above the trailing {lookback_periods}-
    {period_type} average of {trailing_mean}. This is the highest value
    observed since {previous_peak_date}.
  negative: >
    {metric_name} dropped to {current_value} on {date},
    {z_score:.1f} standard deviations below the trailing
    {lookback_periods}-{period_type} average of {trailing_mean}. Investigate
    {suggested_causes} as potential root causes.
```

### Sudden Spike or Drop

```yaml
pattern_id: anomaly_sudden_change
category: anomaly
detection:
  metric_type: any_numeric
  condition: "period-over-period change exceeds 2x the average period change"
  threshold: 20.0  # Percent change
priority_formula: "abs(change_pct) * metric_business_weight * 1.8"
templates:
  positive: >
    {metric_name} {direction} {change_pct}% {period_comparison}, moving from
    {previous_value} to {current_value}. This {change_magnitude} shift is
    {multiple:.1f}x the typical {period_type}-over-{period_type} variation.
  negative: >
    {metric_name} {direction} {change_pct}% {period_comparison}, an unusually
    large move of {multiple:.1f}x the normal variation. Current value of
    {current_value} warrants immediate attention.
```

## Comparison Patterns

### Period-Over-Period Change

```yaml
pattern_id: comparison_period_over_period
category: comparison
detection:
  metric_type: any_numeric
  condition: "comparison period data available"
  threshold: 1.0  # Minimum percent change to report
priority_formula: "abs(change_pct) * metric_business_weight"
templates:
  positive: >
    {metric_name} {direction} {change_pct}% {period_comparison}, from
    {previous_value} to {current_value}. This represents an improvement of
    {absolute_change} in absolute terms.
  negative: >
    {metric_name} {direction} {change_pct}% {period_comparison}, declining from
    {previous_value} to {current_value}. The {absolute_change} drop exceeds
    the acceptable variance threshold of {variance_threshold}%.
  neutral: >
    {metric_name} remained stable at {current_value} {period_comparison},
    changing less than {change_pct}% from {previous_value}.
```

### Cross-Channel Comparison

```yaml
pattern_id: comparison_cross_channel
category: comparison
detection:
  metric_type: channel_metric
  condition: "metric available for 2+ channels"
  threshold: 10.0  # Minimum spread between best and worst
priority_formula: "spread_pct * metric_business_weight"
templates:
  positive: >
    {top_channel} leads in {metric_name} at {top_value}, outperforming
    {bottom_channel} ({bottom_value}) by {spread_pct}%. The portfolio average
    is {avg_value}.
  negative: >
    {metric_name} varies significantly across channels: {top_channel}
    ({top_value}) vs. {bottom_channel} ({bottom_value}), a {spread_pct}% gap.
    Consider reallocating budget from underperformers.
```

### Target Attainment

```yaml
pattern_id: comparison_target_attainment
category: comparison
detection:
  metric_type: any_with_target
  condition: "target value defined for metric"
  threshold: 0.0
priority_formula: "abs(variance_to_target_pct) * metric_business_weight * 1.3"
templates:
  positive: >
    {metric_name} is at {attainment_pct}% of target ({current_value} vs.
    target of {target_value}), exceeding the goal by {surplus_pct}%. On the
    current trajectory, the {period_type}-end projection is {projected_value}.
  negative: >
    {metric_name} is at {attainment_pct}% of target ({current_value} vs.
    target of {target_value}), falling short by {deficit_pct}%. To close the
    gap, {metric_name} needs to average {required_run_rate} per {sub_period}
    for the remainder of the {period_type}.
```

## Milestone Patterns

### Record Value

```yaml
pattern_id: milestone_record
category: milestone
detection:
  metric_type: any_numeric
  condition: "value is the highest or lowest in the available data history"
  threshold: 0.0
priority_formula: "metric_business_weight * 2.5"
templates:
  positive: >
    {metric_name} reached an all-time {high_or_low} of {current_value} on
    {date}, surpassing the previous record of {previous_record} set on
    {previous_record_date}.
  negative: >
    {metric_name} hit a record {high_or_low} of {current_value} on {date}.
    The previous {high_or_low} was {previous_record} on {previous_record_date}.
    This represents a {change_pct}% {deterioration_or_improvement}.
```

### Threshold Crossing

```yaml
pattern_id: milestone_threshold_crossing
category: milestone
detection:
  metric_type: any_numeric
  condition: "value crosses a psychologically significant threshold"
  threshold: 0.0
priority_formula: "metric_business_weight * 1.5"
templates:
  positive: >
    {metric_name} crossed the {threshold_value} mark for the first time,
    reaching {current_value} on {date}. This milestone reflects
    {contributing_factors}.
  negative: >
    {metric_name} fell below {threshold_value} for the first time since
    {last_below_date}, dropping to {current_value}. This breach signals
    {risk_implications}.
```

## Correlation Patterns

### Metric Correlation

```yaml
pattern_id: correlation_metric_pair
category: correlation
detection:
  metric_type: numeric_pair
  condition: "Pearson correlation coefficient > 0.7 or < -0.7"
  threshold: 0.7
priority_formula: "abs(correlation) * combined_business_weight"
templates:
  positive: >
    {metric_a} and {metric_b} show a strong {positive_or_negative} correlation
    (r={correlation:.2f}) over the past {lookback_periods} {period_type}s.
    A {unit_change} increase in {metric_a} is associated with a
    {associated_change} change in {metric_b}.
  neutral: >
    {metric_a} and {metric_b} are correlated (r={correlation:.2f}), but this
    association does not imply causation. Consider running a controlled
    experiment to validate the relationship.
```

## Forecast Patterns

### Projection vs. Target

```yaml
pattern_id: forecast_projection
category: forecast
detection:
  metric_type: any_with_target
  condition: "sufficient data for linear projection"
  threshold: 5.0
priority_formula: "abs(projected_variance_pct) * metric_business_weight * 1.2"
templates:
  positive: >
    At the current trajectory, {metric_name} is projected to reach
    {projected_value} by {target_date}, {surplus_or_deficit} the target of
    {target_value} by {variance_pct}%.
  negative: >
    {metric_name} is trending toward {projected_value} by {target_date},
    {variance_pct}% {above_or_below} the target of {target_value}. Corrective
    action in the next {action_window} could close the gap.
```

## Business Weight Reference

Assign weights to metrics to influence insight priority ranking. Higher weights
surface insights about more business-critical metrics first.

| Metric Category | Default Weight | Rationale |
|---|---|---|
| Revenue / ROAS | 10 | Direct business outcome |
| Conversions / CPA | 8 | Primary performance indicator |
| Pipeline value | 8 | Leading revenue indicator |
| CLV | 7 | Long-term value signal |
| Funnel conversion rate | 6 | Efficiency measure |
| Traffic / sessions | 5 | Volume indicator |
| Engagement rate | 4 | Quality indicator |
| Bounce rate | 4 | Quality indicator (inverse) |
| Impressions / reach | 3 | Awareness-level metric |
| NPS / CSAT | 6 | Customer health signal |

Weights are configurable per client and can be overridden in workspace
configuration files.

## Composing Multi-Insight Summaries

When generating an executive summary from multiple insights:

1. Sort insights by `priority_formula` score descending.
2. Select the top 3-5 insights for the executive summary.
3. Group related insights (same metric or same channel) to avoid repetition.
4. Lead with the single highest-impact finding.
5. Close with a forward-looking projection or recommended action.
6. Use transition phrases between insights: "Meanwhile," "In contrast,"
   "Additionally," "On the positive side," "However," etc.
