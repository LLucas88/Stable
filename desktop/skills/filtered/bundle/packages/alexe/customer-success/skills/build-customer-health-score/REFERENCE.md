# Reference: Build Customer Health Score

## Why this reference exists

This skill is calculation-aware.

Its job is to design a health score model that is grounded in actual signal data and calibrated against real churn outcomes. A health score that hasn't been validated against historical churn is a guess. This reference defines how to build one that isn't.

This reference defines:
- the weighted health score formula
- signal normalization logic
- weight assignment rules
- tier thresholds
- calibration approach
- signal categories
- invalid-use conditions

---

## Weighted health score formula

```
health_score = sum_i ( weight_i × normalized_signal_i )
```

Where:
- Each signal is normalized to a 0-100 scale
- All weights sum to 100%
- The resulting score is on a 0-100 scale

Example with 3 signals:
- Usage ratio (weight 40%): normalized score 65
- Feature adoption (weight 35%): normalized score 40
- Support health (weight 25%): normalized score 80

```
health_score = 0.40 × 65 + 0.35 × 40 + 0.25 × 80
health_score = 26 + 14 + 20 = 60
```

A score of 60 would fall in the yellow/at-risk tier under standard thresholds.

---

## Signal normalization

### Continuous signals

```
normalized = (value - min) / (max - min) × 100
```

Where min and max are the expected practical range for that signal, not the theoretical extremes.

Example: weekly active users / licensed seats (usage ratio)
- min = 0% (no active users)
- max = 80%+ (practical ceiling; normalize anything above 80% to 100)

```
For a usage ratio of 35%:
normalized = (35 - 0) / (80 - 0) × 100 = 43.75 ≈ 44
```

### Stepped signals

For signals where impact is non-linear, use a step function.

Example: days since last login
- 0-7 days: 100
- 8-14 days: 75
- 15-30 days: 40
- 31+ days: 0

### Binary signals

Binary signals (yes/no) normalize to 0 or 100.

Example: on-time payment status
- On time: 100
- Late or disputed: 0

---

## Weight assignment rules

1. Weights must sum to 100%.

2. Leading indicators (predict future churn) should get higher weight than lagging indicators (confirm churn that has already started).
   - Leading: usage trends, feature adoption breadth, login frequency
   - Lagging: NPS score, payment disputes, support escalations

3. Weight signals based on historical correlation with churn, not intuition. If 82% of churned accounts had low usage ratios, usage ratio should be the highest-weighted signal.

4. Keep the model to 5-8 signals maximum. More signals add noise and make the score harder to explain to CSMs.

5. If no historical churn data is available to validate weights, assign tentative weights based on product logic and plan to calibrate as data accumulates.

---

## Tier thresholds

Default starting thresholds:
- Green / Healthy: score 70-100 (low churn risk)
- Yellow / At-risk: score 40-69 (monitor closely, proactive outreach)
- Red / Critical: score 0-39 (immediate intervention)

These defaults are starting points. Calibrate them against actual churn data.

Calibration target: at least 70% of accounts that churned in the last 12 months should have scored Critical or At-risk in the 30-60 days before churn. If this threshold isn't met, revisit signal weights or tier boundaries.

---

## Calibration

After building the model:

1. Apply the scoring formula retroactively to all accounts with known outcomes (churned vs. retained) in the last 12 months.

2. Calculate the percentage of churned accounts that would have been flagged Critical or At-risk before their churn date.

3. Calculate false positive rate: what percentage of retained accounts are currently scoring in the red zone?

4. Adjust weights and tier thresholds to improve prediction accuracy before acting on the score.

A health score that has not been validated against historical churn data should not be used to drive account intervention decisions.

---

## Signal categories

Common signal groupings for SaaS products:

**Usage depth (typically 30-40% total weight)**
- Sessions per week / login frequency
- Core feature usage rate
- Advanced feature adoption

**Engagement breadth (typically 20-30% total weight)**
- Number of distinct active users / seats
- Days since last login across the account
- Breadth of features used

**Support and relationship (typically 15-25% total weight)**
- Open support tickets older than threshold
- Number of escalations in the last 90 days
- NPS score (if collected regularly enough to be current)

**Commercial health (typically 10-20% total weight)**
- Billing status (on-time vs. late)
- Contract renewal proximity
- Expansion or contraction signals

Adjust categories and weights based on what your product data shows is predictive for your specific customer base.

---

## Invalid-use conditions

Do not use the health score to drive account interventions if:
- The score has not been calibrated against historical churn data
- All signals are given equal weight without validation
- The score relies only on lagging indicators (by the time they fire, churn is often already decided)
- The signal definitions changed recently without recalibrating the model
- The score is being applied to a customer segment with different behavior than the segment used to calibrate it (e.g., applying an SMB-calibrated score to enterprise accounts)
