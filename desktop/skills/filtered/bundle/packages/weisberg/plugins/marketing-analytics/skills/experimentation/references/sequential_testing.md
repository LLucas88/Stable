# Sequential Testing Reference

mSPRT theory, alpha-spending functions, and valid stopping rules for
continuous monitoring of A/B tests.

## Problem Statement

In fixed-horizon testing, peeking at results before the planned sample size
inflates the Type I error rate. With daily monitoring and a nominal alpha of
5%, the true false positive rate can exceed 30%. Sequential testing methods
provide valid inference at any stopping time.

## Mixture Sequential Probability Ratio Test (mSPRT)

### Theory

The mSPRT constructs a test statistic that is an **always-valid p-value**:
valid at any data-dependent stopping time.

For a stream of observations, the mSPRT statistic at time n is:

```
Lambda_n = integral L_n(theta) dH(theta) / L_n(0)
```

Where:
- `L_n(theta)` = likelihood of data under effect size theta
- `L_n(0)` = likelihood under the null (theta = 0)
- `H(theta)` = mixing distribution over plausible effect sizes

### Normal Mixture (Practical Form)

For normally distributed test statistics with known variance, using a
Gaussian mixing distribution H ~ N(0, tau^2):

```
Lambda_n = sqrt(sigma^2 / (sigma^2 + n*tau^2)) * exp(n^2 * Y_bar^2 * tau^2 / (2 * sigma^2 * (sigma^2 + n*tau^2)))
```

Where:
- `Y_bar` = running mean of the treatment effect estimate
- `sigma^2` = known variance of individual observations
- `tau^2` = mixing variance (tuning parameter)

Reject the null when `Lambda_n >= 1/alpha`.

### Choosing tau^2

- `tau^2` controls the sensitivity of the test. Larger values favor detecting
  large effects early; smaller values favor detecting small effects.
- Rule of thumb: set tau so that `tau = MDE / sqrt(n_planned)`, where
  `n_planned` is the planned total sample size.
- The test is valid for any tau^2 > 0, but power depends on the choice.

## Always-Valid Confidence Intervals

An always-valid (1-alpha) confidence interval at time n is:

```
CI_n = { theta : Lambda_n(theta) < 1/alpha }
```

For the normal mSPRT, this yields:

```
Y_bar_n +/- sqrt((sigma^2 + n*tau^2) / (n^2 * tau^2) * 2 * log(1/alpha * sqrt((sigma^2 + n*tau^2) / sigma^2)))
```

These intervals are wider than fixed-sample CIs early in the experiment but
converge as n grows. They are valid at every point in time, not just at the
planned end.

## Alpha-Spending Functions

### O'Brien-Fleming Spending

```
alpha*(t) = 2 * (1 - Phi(Z_{alpha/2} / sqrt(t)))
```

Where `t = n/N` is the information fraction (current sample / planned sample).

Properties:
- Very conservative early (spends almost no alpha in first 50% of data).
- Most alpha is spent near the planned end of the experiment.
- Good default for most experiments.

### Pocock Spending

```
alpha*(t) = alpha * ln(1 + (e - 1) * t)
```

Properties:
- Spends alpha more evenly across looks.
- Allows earlier stopping than O'Brien-Fleming.
- Slightly less power at the planned end.

### Comparison

| Look at | O'Brien-Fleming boundary (Z) | Pocock boundary (Z) |
| :------ | :--------------------------- | :------------------ |
| 20%     | 4.56                         | 2.41                |
| 40%     | 2.94                         | 2.41                |
| 60%     | 2.40                         | 2.41                |
| 80%     | 2.08                         | 2.41                |
| 100%    | 2.02                         | 2.41                |

(Values for 5 equally spaced looks at overall alpha = 0.05.)

## Valid Stopping Rules

### When to Stop for Efficacy

Stop and declare the treatment effective when:
- **mSPRT:** `Lambda_n >= 1/alpha`
- **Group sequential:** The test statistic exceeds the spending-function
  boundary at a scheduled look.

### When to Stop for Futility

Stop early if the experiment is unlikely to reach significance:
- Conditional power < 10% given current trend.
- Bayesian predictive probability of significance < 5%.
- mSPRT evidence ratio strongly favors the null.

### Minimum Sample Requirements

Even with sequential methods, enforce:
- At least 100 observations per variant (for CLT to apply).
- At least 7 days of data (to capture day-of-week effects).
- At least one full business cycle if relevant.

## Implementation Guidance

1. Pre-specify the mixing distribution (tau^2) or spending function before the
   experiment starts. Changing mid-experiment invalidates the guarantees.
2. Log every interim look with its test statistic and decision.
3. If the experiment is stopped early, report the always-valid CI at the
   stopping time, not a naive fixed-sample CI.
4. For multiple metrics, apply sequential testing to the primary metric only.
   Secondary metrics use fixed-horizon analysis at the stopping time.
5. Combine with CUPED: apply CUPED adjustment first, then run sequential test
   on the adjusted metric. Theta should be estimated from pre-period data and
   held fixed.
