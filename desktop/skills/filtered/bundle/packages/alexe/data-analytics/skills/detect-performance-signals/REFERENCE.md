# Reference: Detect Performance Signals

## Why this reference exists

This skill is calculation-aware.

Its job is to determine whether a metric movement is a real signal or noise, and to guide the investigation toward a cause. That requires actual math, not just pattern-matching.

This reference defines:
- core signal detection formulas
- practical thresholds for investigation
- minimum data requirements
- data quality check order
- invalid-use conditions

---

## Core formulas

### Week-over-week change

```
WoW% = (current_week - prior_week) / prior_week × 100
```

Example: conversion was 4.1% last week, 3.3% this week
```
WoW% = (3.3 - 4.1) / 4.1 × 100 = -19.5%
```

Use absolute change (pp) alongside relative change (%) for rate metrics. A 1pp drop from 2% to 1% is a 50% relative decline — context matters.

### Simple z-score for metric monitoring

```
z = (current_value - mean) / std_dev
```

Where mean and std_dev are calculated from the recent baseline window (last 4-8 weeks, excluding the current period).

Interpretation thresholds:
- |z| < 1.5: within normal variation, no action needed
- |z| 1.5-2.0: borderline, monitor but do not escalate
- |z| > 2.0: investigate — unlikely under normal variation
- |z| > 3.0: probable real signal, treat as significant

Example: baseline checkout conversion over 6 weeks: mean = 4.1%, std_dev = 0.2%
Current week: 3.3%
```
z = (3.3 - 4.1) / 0.2 = -4.0
```
A z-score of -4.0 is far outside normal variation. This is a probable real signal.

### Control chart limits

For a metric with stable baseline, calculate upper and lower control limits:

```
UCL = mean + 3 × std_dev
LCL = mean - 3 × std_dev
```

A point outside these limits is a signal. Points consistently approaching the limits from one direction are also worth noting (trend).

### Rolling average baseline

Use the last 4-8 weeks of data to establish the "normal" baseline.
- 4 weeks: reasonable minimum, faster to react to structural shifts
- 6-8 weeks: more stable baseline, less sensitive to single-week outliers

Exclude the current period from the baseline calculation.

---

## Practical thresholds

Statistical tests are useful but not always available in-session. These heuristics are useful for quick triage:

- Greater than 10% WoW change on a stable metric: warrants investigation
- Greater than 20% WoW change on a stable metric: strong signal, treat as significant regardless of sample size context (pending data quality check)
- Less than 5% WoW change: likely within normal variation for most metrics

"Stable" means the metric has not had large swings in the baseline window. For inherently volatile metrics (small sample, seasonally driven), thresholds should be higher.

---

## Minimum data requirements

**Before flagging a signal:**
- At least 4 weeks of baseline data. Fewer than 4 weeks is insufficient to estimate normal variation.
- At least 200 events per period for conversion-rate metrics. Below 200 events, a 1-2% absolute change in conversion could be 1-3 actual user differences — unreliable.

**For z-score calculation:**
- At least 6 data points in the baseline window to get a meaningful standard deviation estimate.

---

## Data quality check order

Before declaring a signal, check in this order:

1. **Tracking integrity.** Is event count for the metric stable? Did any tracking changes deploy in the window?
2. **Pipeline lag.** Is there a known data pipeline delay that could explain missing events?
3. **Segment composition.** Did traffic source mix change? Is one segment driving the movement while others are stable?
4. **Signal.** If all above are clean, treat the movement as a real signal.

This order matters. Instrumentation and data issues are more common than real product regressions and are systematically underdiagnosed.

---

## Invalid-use conditions

Do not flag or act on a signal if:
- The baseline window is fewer than 4 weeks (insufficient to establish normal variation)
- The metric has fewer than 200 events per period (noise dominates)
- The metric is highly seasonal and no seasonal adjustment has been applied
- The WoW change is less than 5% on a volatile metric
- Tracking changes or deployment events in the same window have not been ruled out

---

## Output structure for a signal investigation

For every signal investigation, the output should address:
1. Signal summary: what moved, magnitude, direction, timing
2. Baseline context: mean, std_dev, z-score or WoW%
3. Data quality check results: tracking, pipeline, composition
4. Candidate causes in ranked order
5. Assessment: noise / investigate / probable signal / confirmed regression
6. Recommended next step
