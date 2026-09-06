# CUPED Methodology Reference

Controlled-experiment Using Pre-Experiment Data (CUPED) for variance reduction
in A/B tests.

## Overview

CUPED uses pre-experiment covariate data to reduce the variance of treatment
effect estimates, allowing experiments to reach statistical significance faster
with the same sample size. Typical variance reduction is 30-40% when using
well-correlated pre-experiment metrics.

**Original paper:** Deng, A., Xu, Y., Kohavi, R., & Walker, T. (2013).
"Improving the Sensitivity of Online Controlled Experiments by Utilizing
Pre-Experiment Data." WSDM 2013.

## Mathematical Foundation

### Core Idea

Given a post-experiment metric Y and a pre-experiment covariate X, construct
an adjusted metric:

```
Y_adj = Y - theta * (X - E[X])
```

The variance of Y_adj is minimized when:

```
theta* = Cov(Y, X) / Var(X)
```

This is the OLS coefficient from regressing Y on X.

### Variance Reduction

The variance of the adjusted metric is:

```
Var(Y_adj) = Var(Y) * (1 - rho^2)
```

Where `rho = Corr(Y, X)` is the Pearson correlation between the post-metric
and the pre-experiment covariate.

| Correlation (rho) | Variance Reduction |
| :----------------- | :----------------- |
| 0.3                | 9%                 |
| 0.4                | 16%                |
| 0.5                | 25%                |
| 0.6                | 36%                |
| 0.7                | 51%                |
| 0.8                | 64%                |

### Unbiasedness

The adjustment is unbiased because `E[X]` is the same across treatment and
control groups (by random assignment). Therefore:

```
E[Y_adj_treatment] - E[Y_adj_control]
  = E[Y_treatment] - E[Y_control] - theta * (E[X_treatment] - E[X_control])
  = E[Y_treatment] - E[Y_control]    (since E[X_t] = E[X_c])
```

## Theta Derivation

### Single Covariate

1. Pool all users (treatment and control).
2. Compute `theta = Cov(Y, X) / Var(X)` across the pooled sample.
3. Compute `Y_adj_i = Y_i - theta * (X_i - X_bar)` for each user i.
4. Run the standard hypothesis test on Y_adj instead of Y.

**Important:** Theta must be estimated from the pooled sample (not per-group)
to maintain unbiasedness.

### Multiple Covariates

With covariates X_1, ..., X_k, use multivariate regression:

```
theta = (X'X)^{-1} X'Y
```

The adjusted metric becomes:

```
Y_adj = Y - X * theta + mean(X * theta)
```

In practice, 1-3 covariates capture most of the variance reduction. Adding
more covariates risks overfitting on small samples.

### Robust Theta Estimation

For metrics with heavy tails (e.g., revenue):
- Winsorize Y and X at the 1st and 99th percentiles before computing theta.
- Use Huber regression as an alternative to OLS for outlier robustness.

## Covariate Selection Guidance

### Best Covariates

1. **Same metric, pre-period:** The single best covariate is the same metric
   measured during the pre-experiment period (e.g., 7-day pre-experiment
   conversion rate to predict experiment-period conversion rate).
2. **Closely related metrics:** Pageviews to predict engagement, prior
   purchase count to predict revenue.
3. **User tenure or activity level:** Captures baseline behavioral intensity.

### Covariate Requirements

- **Strictly pre-treatment:** The covariate must be measured entirely before
  treatment assignment. Any post-assignment measurement introduces bias.
- **Available for all users:** Users missing the covariate must be handled
  (impute with population mean, or exclude and document).
- **Non-degenerate:** The covariate must have non-zero variance.

### Validation Checks

1. Confirm covariate measurement window ends before experiment start date.
2. Verify covariate balance across groups (should be balanced by randomization;
   large imbalances suggest an SRM issue).
3. Check correlation between covariate and post-metric (rho < 0.2 means
   negligible benefit; consider skipping CUPED).

## Implementation Notes

- Compute theta once on the full dataset. Do not recompute per-group.
- For sequential/monitoring use cases, theta can be estimated from a held-out
  pre-period sample and held fixed throughout the experiment.
- When combining CUPED with stratified analysis, apply CUPED within each
  stratum and then combine using stratum weights.
- Always report both raw and CUPED-adjusted results for transparency.
