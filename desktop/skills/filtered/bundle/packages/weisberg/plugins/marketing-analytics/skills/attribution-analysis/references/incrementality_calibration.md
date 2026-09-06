# Incrementality Calibration: From Lift Tests to Informative Priors

## Overview

Incrementality lift tests (geo-based holdouts, time-based blackouts, randomized
experiments) provide causal estimates of a channel's true effect. These results can
be translated into informative Bayesian priors for the MMM, anchoring the model to
experimentally validated ground truth.

This creates a virtuous cycle:
1. The MMM identifies channels with uncertain attribution
2. The experimentation skill designs targeted lift tests for those channels
3. Lift test results calibrate the MMM priors
4. The calibrated MMM produces more precise budget recommendations

---

## Input Format

Lift test results are expected in `workspace/analysis/incrementality_results.json`:

```json
[
  {
    "channel": "paid_social",
    "metric": "conversions",
    "lift_pct": 12.5,
    "lift_absolute": 1250,
    "ci_lower": 8.2,
    "ci_upper": 16.8,
    "confidence_level": 0.90,
    "test_type": "geo_holdout",
    "test_period_start": "2025-06-01",
    "test_period_end": "2025-07-31",
    "spend_during_test": 50000,
    "control_group_size": 0.15,
    "notes": "15% of DMAs held out from paid social for 8 weeks"
  }
]
```

---

## Calibration Procedure

### Step 1: Convert Lift to Channel Coefficient Scale

The lift test gives us an estimate of the incremental effect per dollar spent (iROAS)
or per impression. Convert this to the same scale as the MMM's channel coefficient `beta_c`.

```
iROAS = lift_absolute_revenue / spend_during_test
```

For conversion-based outcomes:
```
incremental_CPA = spend_during_test / lift_absolute_conversions
beta_c_estimate = lift_absolute / (mean_weekly_spend * n_weeks_in_test)
```

The exact conversion depends on the MMM's parameterization. The goal is to express
the lift test result in the units of `beta_c * saturation(adstock(x_c))`.

### Step 2: Estimate Uncertainty of the Prior

Use the confidence interval from the lift test to derive the prior's spread:

```python
import numpy as np
from scipy import stats

# Convert percentage CI to coefficient scale
beta_mean = lift_absolute / normalized_spend
beta_lower = ci_lower_absolute / normalized_spend
beta_upper = ci_upper_absolute / normalized_spend

# Fit a log-normal prior (ensures positivity)
# Method of moments from the CI
log_mean = np.log(beta_mean)
log_std = (np.log(beta_upper) - np.log(beta_lower)) / (2 * 1.645)  # for 90% CI

# The informative prior becomes:
# beta_c ~ LogNormal(mu=log_mean, sigma=log_std)
```

### Step 3: Apply Prior in PyMC-Marketing

```python
import pymc as pm

with pm.Model() as calibrated_model:
    # Informative prior for the calibrated channel
    beta_social = pm.LogNormal("beta_social", mu=log_mean, sigma=log_std)

    # Weakly informative priors for uncalibrated channels
    beta_search = pm.HalfNormal("beta_search", sigma=1)
    beta_display = pm.HalfNormal("beta_display", sigma=1)
```

Or via PyMC-Marketing's custom priors interface:

```python
mmm = MMM(
    ...,
    channel_columns=["social", "search", "display"],
)

# Set informative prior for the calibrated channel
custom_priors = {
    "beta_channel": {
        "dist": "LogNormal",
        "kwargs": {"mu": log_mean, "sigma": log_std}
    }
}
```

Note: PyMC-Marketing applies the same prior to all channels by default. To set
per-channel priors, you may need to subclass MMM or use the lower-level PyMC API
directly.

---

## Calibration Quality Checks

### Prior-Posterior Consistency

After fitting the calibrated model, verify that the posterior for the calibrated
channel is consistent with (but not identical to) the lift test result:

1. **Posterior overlaps prior**: The posterior credible interval should overlap
   substantially with the lift test CI. If it does not, investigate data conflicts.
2. **Posterior is narrower**: The posterior should be at least as narrow as the prior,
   since it combines prior information with observational data.
3. **Shrinkage direction**: If the posterior shifts away from the prior, this suggests
   the observational data disagrees with the experiment. Flag this for investigation.

### Multiple Lift Tests

When multiple lift tests are available for the same channel:
1. Use the most recent test as the primary prior
2. Conduct a meta-analysis across tests to estimate a pooled effect and between-test variance
3. Use the pooled estimate as the prior mean and inflate the uncertainty to account for
   heterogeneity across test conditions

### Cross-Validation Against Held-Out Tests

If lift tests are available for multiple channels:
1. Calibrate using tests for channels A and B
2. Compare the uncalibrated posterior for channel C against its lift test result
3. If they agree, the model has good external validity
4. If they disagree, consider calibrating all channels or investigating model misspecification

---

## Common Pitfalls

1. **Scale mismatch**: Ensure the lift test result is converted to the same units and
   scale as the MMM coefficient. A percentage lift is not a coefficient.
2. **Time period mismatch**: If the lift test was run during an atypical period (holiday
   season, product launch), the estimated effect may not generalize. Widen the prior
   uncertainty to account for this.
3. **Overly tight priors**: Do not set the prior too narrow. The lift test has its own
   uncertainty, and conditions may have changed since the test was run. As a rule of
   thumb, inflate the prior standard deviation by 25-50% beyond what the CI implies.
4. **Ignoring interaction effects**: A lift test measures the marginal effect of turning
   off a channel. If channels interact (e.g., social drives search), the lift test
   captures the total effect including interactions, while the MMM coefficient captures
   the direct effect.
5. **Stale calibration**: Lift test results degrade over time as market conditions change.
   Re-run calibration experiments at least annually, or after major strategy shifts.

---

## When No Lift Tests Are Available

If no incrementality data exists, use this hierarchy of prior sources:

1. **Historical MMM results** from prior periods (most informative)
2. **Industry benchmarks** from published studies or vendor reports
3. **Expert elicitation** from the marketing team (structured interviews)
4. **Platform-reported ROAS** discounted by 30-60% for over-attribution bias
5. **Weakly informative defaults** (least informative, let the data speak)

Always document the prior source and conduct sensitivity analysis regardless of the
prior's origin.
