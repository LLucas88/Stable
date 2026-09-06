# Experiment Design Reference

Power analysis formulas, MDE tables, and duration estimation methodology.

## Power Analysis Formulas

### Two-Sample Proportion Test

For comparing conversion rates between control (p_c) and treatment (p_t):

```
n = (Z_{alpha/2} * sqrt(2 * p_bar * (1 - p_bar)) + Z_beta * sqrt(p_c*(1-p_c) + p_t*(1-p_t)))^2 / (p_t - p_c)^2
```

Where:
- `p_bar = (p_c + p_t) / 2` (pooled proportion)
- `Z_{alpha/2}` = critical value for significance level (1.96 for alpha=0.05)
- `Z_beta` = critical value for power (0.84 for 80% power)
- `n` = sample size per group

### Two-Sample t-Test (Continuous Metrics)

For comparing means with common variance sigma^2:

```
n = (Z_{alpha/2} + Z_beta)^2 * 2 * sigma^2 / delta^2
```

Where:
- `delta` = minimum detectable effect (absolute difference in means)
- `sigma` = pooled standard deviation

### Welch's t-Test (Unequal Variances)

```
n_c = (Z_{alpha/2} + Z_beta)^2 * (sigma_c^2 + sigma_t^2 * (n_c/n_t)) / delta^2
```

Use when treatment is expected to change variance (e.g., revenue metrics).

## Minimum Detectable Effect (MDE) Tables

### Conversion Rate Baselines

| Baseline Rate | n=1,000/group | n=5,000/group | n=10,000/group | n=50,000/group |
| :------------ | :------------ | :------------ | :------------- | :------------- |
| 1%            | 1.24%         | 0.55%         | 0.39%          | 0.17%          |
| 5%            | 2.70%         | 1.21%         | 0.85%          | 0.38%          |
| 10%           | 3.72%         | 1.66%         | 1.18%          | 0.53%          |
| 20%           | 4.96%         | 2.22%         | 1.57%          | 0.70%          |
| 50%           | 6.20%         | 2.77%         | 1.96%          | 0.88%          |

All values assume alpha=0.05, power=80%, two-sided test. MDE expressed as
absolute percentage point difference.

### Relative MDE by Sample Size

For a 10% baseline conversion rate, the relative MDE (as % of baseline):

| Sample per Group | Relative MDE |
| :--------------- | :----------- |
| 1,000            | 37.2%        |
| 5,000            | 16.6%        |
| 10,000           | 11.8%        |
| 50,000           | 5.3%         |
| 100,000          | 3.7%         |
| 500,000          | 1.7%         |

## Duration Estimation

### Formula

```
duration_days = ceil(n_total / daily_eligible_traffic)
```

Where:
- `n_total = n_per_group * num_groups`
- `daily_eligible_traffic` = average daily users meeting experiment eligibility

### Adjustments

- **Day-of-week effects:** Round up to complete weeks to avoid bias from
  weekday/weekend traffic patterns.
- **Seasonality:** Avoid launching during known anomalous periods (holidays,
  major campaigns). If unavoidable, extend duration to capture at least one
  full cycle.
- **Minimum duration:** Always run for at least 7 days regardless of sample
  size to capture weekly patterns.
- **Maximum duration:** Cap at 4-6 weeks. If MDE cannot be detected within
  this window, consider whether the effect is practically meaningful.

### Traffic Ramp-Up

For experiments with risk (e.g., new checkout flow):

1. Day 1-2: 5% traffic allocation. Run SRM check. Verify guardrails.
2. Day 3-7: Ramp to 50% if diagnostics pass.
3. Day 8+: Full traffic allocation.

Adjust power calculations to account for reduced exposure during ramp.

## Stratified Randomization

For low-traffic segments or when pre-experiment covariate balance is critical:

1. Define strata based on key covariates (e.g., tenure bucket, device type).
2. Within each stratum, assign variants using blocked randomization.
3. Verify balance post-assignment with a balance table (standardized mean
   differences should be < 0.05 for all covariates).

## Experiment Specification Template

Every experiment should document:

1. **Hypothesis:** Testable statement of expected causal effect.
2. **Primary metric:** Single metric for the go/no-go decision.
3. **Secondary metrics:** Additional metrics of interest (exploratory).
4. **Guardrail metrics:** Metrics that must not degrade (e.g., page load time,
   error rate, unsubscribe rate).
5. **MDE and rationale:** Why this effect size matters for the business.
6. **Sample size and duration:** Output from power analysis.
7. **Decision criteria:** What constitutes a "ship" vs. "no-ship" outcome.
