# Funnel Methodology Reference

Construction rules, confidence interval formulas, and bottleneck scoring for
the funnel-analysis skill.

## Funnel Construction Rules

### Event Matching

A funnel is an ordered (or unordered) sequence of named events that a user must
trigger to be counted as converted at each stage.

- **Strict mode (default):** Events must occur in the defined order. If a user
  triggers step 3 before step 2, step 3 is not counted until step 2 occurs.
- **Relaxed mode:** All defined events must occur, but order does not matter.
  Useful for funnels where steps can happen in any sequence (e.g., completing
  profile fields).

### Time-Window Constraints

Each step transition may have an optional maximum time window. If the user does
not trigger the next step within the window, they are counted as dropped at the
current stage.

- Default window: no limit (the user has unlimited time to proceed).
- Recommended windows: session-based funnels use 30-minute inactivity timeout;
  multi-day funnels use 7- or 14-day windows.
- Implementation: for each user, iterate through events chronologically. At
  each stage, check if the next qualifying event falls within the time window.

### Aggregation Modes

- **User-based:** Each user is counted once. Their furthest stage reached
  determines their position. Deduplicated by `user_id`.
- **Session-based:** Each session is an independent funnel attempt. Requires a
  `session_id` column or session inference via 30-minute inactivity gap.

### Branching Funnels

For funnels with multiple entry points converging to a single conversion event:

- Define each entry branch as a separate funnel prefix.
- Merge at the convergence point.
- Report entry-branch-level and merged conversion rates.

## Confidence Interval Formulas

### Wilson Score Interval

For conversion rate `p_hat = k / n` where `k` is conversions and `n` is total
users entering a stage:

```
center = (p_hat + z^2 / (2n)) / (1 + z^2 / n)

margin = z / (1 + z^2 / n) * sqrt(p_hat * (1 - p_hat) / n + z^2 / (4n^2))

CI = [center - margin, center + margin]
```

Where `z` is the critical value for the desired confidence level (z = 1.96 for
95% CI).

**Why Wilson over Wald (normal approximation):**

- Wilson intervals have correct coverage probability even at extreme rates
  (near 0% or 100%).
- Wilson intervals are bounded within [0, 1], unlike Wald intervals which can
  extend below 0 or above 1.
- Critical for funnel stages with very high (>95%) or very low (<5%) conversion
  rates.

### Confidence Interval for Drop-Off Rate

Drop-off rate at stage `i` is `d_i = 1 - (n_{i+1} / n_i)`. Compute Wilson
interval on the complement conversion rate and invert:

```
drop_off_CI = [1 - conversion_CI_upper, 1 - conversion_CI_lower]
```

### Comparing Two Conversion Rates (Chi-Squared)

To compare conversion rates between two cohorts at the same funnel stage:

```
chi_squared = sum over cells of (observed - expected)^2 / expected
```

Construct a 2x2 contingency table: [converted_A, not_converted_A;
converted_B, not_converted_B]. Use `scipy.stats.chi2_contingency` with Yates
correction for small samples (any cell < 5).

Degrees of freedom: 1. Reject H0 (equal rates) if p < 0.05.

When comparing more than two segments, apply Bonferroni correction:
adjusted alpha = 0.05 / number_of_pairwise_comparisons.

## Bottleneck Scoring

### Composite Score Formula

```
bottleneck_score = drop_off_rate * sqrt(volume) * revenue_proximity
```

Where:

- **drop_off_rate:** Fraction of users who drop off at this stage (0 to 1).
- **volume:** Number of users entering this stage. Square root is used to
  dampen the impact of very high-traffic stages so that moderate-traffic stages
  with severe drop-off are not overshadowed.
- **revenue_proximity:** A weight reflecting how close this stage is to the
  final conversion event. Defined as `1 / (total_stages - stage_index)` for
  the default linear weighting. Stages closer to revenue receive higher
  priority because fixing them has a more direct revenue impact.

### Adjusting the Formula

The scoring formula is configurable. Alternative weighting schemes:

- **Equal weight:** Set `revenue_proximity = 1` for all stages.
- **Revenue-weighted:** Replace `revenue_proximity` with actual
  revenue-per-converter at each stage when available.
- **Custom exponents:** Allow `drop_off_rate^a * volume^b * revenue_proximity^c`
  with user-configurable exponents `a`, `b`, `c`.

### Interpretation Guidelines

- A high bottleneck score means the stage has a combination of high drop-off,
  significant traffic, and proximity to revenue.
- The top-ranked bottleneck is the highest-leverage optimization opportunity.
- Compare scores relatively, not absolutely. The score units are arbitrary.
- Validate top bottlenecks against qualitative UX review before committing
  engineering resources to optimization.
