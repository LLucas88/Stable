# PyMC-Marketing CLV Class Reference

## Overview

PyMC-Marketing provides Bayesian implementations of standard CLV models, producing full
posterior distributions over model parameters and customer-level predictions. This enables
principled uncertainty quantification via credible intervals rather than point estimates.

## Installation

```bash
pip install pymc-marketing
```

Requires: PyMC (>=5.0), ArviZ, pandas, numpy, xarray.

## BetaGeoModel (Bayesian BG/NBD)

### Class Reference

```python
from pymc_marketing.clv import BetaGeoModel

model = BetaGeoModel(
    data=rfm_df,                    # DataFrame with customer_id, frequency, recency, T
    model_config=None,              # Optional: prior overrides
    sampler_config=None,            # Optional: sampler settings
)
```

### Required DataFrame Columns

| Column | Type | Description |
|--------|------|-------------|
| `customer_id` | str/int | Unique customer identifier |
| `frequency` | int | Number of repeat purchases |
| `recency` | float | Time between first and last purchase |
| `T` | float | Time between first purchase and end of observation |

### Fitting

```python
model.fit(
    tune=1000,          # Number of tuning steps
    draws=1000,         # Number of posterior draws
    chains=4,           # Number of MCMC chains
    target_accept=0.9,  # Target acceptance rate
)
```

### Convergence Diagnostics

```python
import arviz as az

# Summary with R-hat and ESS
summary = az.summary(model.idata, var_names=["alpha", "r", "a_", "b_"])

# Check convergence criteria
assert (summary["r_hat"] < 1.01).all(), "R-hat convergence check failed"
assert (summary["ess_bulk"] > 400).all(), "Effective sample size too low"

# Trace plots
az.plot_trace(model.idata)

# Posterior predictive checks
az.plot_ppc(model.idata)
```

### Predictions

```python
# Expected purchases in future period
expected_purchases = model.expected_purchases(
    customer_id=rfm_df["customer_id"],
    frequency=rfm_df["frequency"],
    recency=rfm_df["recency"],
    T=rfm_df["T"],
    t=30,  # prediction horizon in time units
)

# Probability alive
prob_alive = model.expected_probability_alive(
    customer_id=rfm_df["customer_id"],
    frequency=rfm_df["frequency"],
    recency=rfm_df["recency"],
    T=rfm_df["T"],
)
```

### Posterior Predictive Sampling

```python
# Full posterior predictive distribution per customer
model.fit(fit_method="mcmc")
posterior_pred = model.posterior_predictive(
    customer_id=rfm_df["customer_id"],
    frequency=rfm_df["frequency"],
    recency=rfm_df["recency"],
    T=rfm_df["T"],
    t=365,
)

# Extract credible intervals
import numpy as np
predictions = posterior_pred["expected_purchases"]
median_pred = np.median(predictions, axis=0)
ci_lower = np.percentile(predictions, 10, axis=0)  # 80% CI
ci_upper = np.percentile(predictions, 90, axis=0)
```

## GammaGammaModel (Bayesian Gamma-Gamma)

### Class Reference

```python
from pymc_marketing.clv import GammaGammaModel

gg_model = GammaGammaModel(
    data=rfm_repeat_df,   # Only customers with frequency > 0
    model_config=None,
    sampler_config=None,
)
```

### Required DataFrame Columns

| Column | Type | Description |
|--------|------|-------------|
| `customer_id` | str/int | Unique customer identifier |
| `frequency` | int | Number of repeat purchases (must be > 0) |
| `monetary_value` | float | Mean transaction value of repeat purchases |

### Fitting and Prediction

```python
gg_model.fit(tune=1000, draws=1000, chains=4)

# Expected average monetary value per transaction
expected_monetary = gg_model.expected_customer_monetary_value(
    customer_id=rfm_repeat_df["customer_id"],
    frequency=rfm_repeat_df["frequency"],
    monetary_value=rfm_repeat_df["monetary_value"],
)
```

## Combined CLV Computation

### Pattern: Posterior CLV Distribution

```python
import numpy as np

def compute_posterior_clv(
    bg_model,
    gg_model,
    rfm_df,
    horizon_months=12,
    discount_rate=0.10,
    margin=1.0,
    n_samples=1000,
):
    """
    Combine BG/NBD and Gamma-Gamma posteriors for full CLV distribution.

    Steps:
    1. Sample expected transactions from BG/NBD posterior
    2. Sample expected monetary value from Gamma-Gamma posterior
    3. Multiply element-wise for CLV samples
    4. Apply margin and discount factor
    5. Summarize with median and credible intervals
    """
    # Monthly discount factor
    monthly_rate = discount_rate / 12
    discount_factor = sum(1 / (1 + monthly_rate) ** m for m in range(1, horizon_months + 1))

    # Posterior samples for expected transactions
    tx_samples = bg_model.expected_purchases(
        customer_id=rfm_df["customer_id"],
        frequency=rfm_df["frequency"],
        recency=rfm_df["recency"],
        T=rfm_df["T"],
        t=horizon_months * 30,
    )

    # Posterior samples for expected monetary value
    mv_samples = gg_model.expected_customer_monetary_value(
        customer_id=rfm_df["customer_id"],
        frequency=rfm_df["frequency"],
        monetary_value=rfm_df["monetary_value"],
    )

    # Combined CLV posterior
    clv_samples = tx_samples * mv_samples * margin

    # Summarize
    results = {
        "customer_id": rfm_df["customer_id"].values,
        "clv_median": np.median(clv_samples, axis=0),
        "clv_mean": np.mean(clv_samples, axis=0),
        "clv_ci_80_lower": np.percentile(clv_samples, 10, axis=0),
        "clv_ci_80_upper": np.percentile(clv_samples, 90, axis=0),
        "clv_ci_95_lower": np.percentile(clv_samples, 2.5, axis=0),
        "clv_ci_95_upper": np.percentile(clv_samples, 97.5, axis=0),
    }
    return results
```

## Custom Priors

### Overriding Default Priors

```python
model_config = {
    "r_prior": {"dist": "HalfNormal", "kwargs": {"sigma": 2.0}},
    "alpha_prior": {"dist": "HalfNormal", "kwargs": {"sigma": 10.0}},
    "a_prior": {"dist": "HalfNormal", "kwargs": {"sigma": 2.0}},
    "b_prior": {"dist": "HalfNormal", "kwargs": {"sigma": 5.0}},
}

model = BetaGeoModel(data=rfm_df, model_config=model_config)
```

### Informative Priors from Previous Fits

When refitting on updated data, use posteriors from prior fit as informative priors:

```python
import arviz as az

# Extract posterior summaries from previous fit
prev_summary = az.summary(prev_model.idata)

model_config = {
    "r_prior": {
        "dist": "LogNormal",
        "kwargs": {
            "mu": np.log(prev_summary.loc["r", "mean"]),
            "sigma": 0.5,
        },
    },
    # ... repeat for other parameters
}
```

## Sampler Configuration

```python
sampler_config = {
    "tune": 2000,           # More tuning for complex posteriors
    "draws": 2000,
    "chains": 4,
    "target_accept": 0.95,  # Higher for difficult geometries
    "cores": 4,
    "random_seed": 42,
}

model = BetaGeoModel(data=rfm_df, sampler_config=sampler_config)
```

## Model Comparison

### Comparing MLE vs. Bayesian

```python
from lifetimes import BetaGeoFitter

# MLE fit
bgf = BetaGeoFitter(penalizer_coef=0.0)
bgf.fit(rfm_df["frequency"], rfm_df["recency"], rfm_df["T"])

# Bayesian fit
bg_model = BetaGeoModel(data=rfm_df)
bg_model.fit()

# Compare predictions on holdout
mle_pred = bgf.conditional_expected_number_of_purchases_up_to_time(
    t=holdout_days, frequency=test["frequency"],
    recency=test["recency"], T=test["T"]
)

bayes_pred = bg_model.expected_purchases(
    customer_id=test["customer_id"],
    frequency=test["frequency"],
    recency=test["recency"],
    T=test["T"],
    t=holdout_days,
)
```

### WAIC / LOO Comparison

```python
import arviz as az

# Compare two Bayesian model variants
comparison = az.compare(
    {"model_a": model_a.idata, "model_b": model_b.idata},
    ic="loo",
)
print(comparison)
```

## Common Patterns

### Handling Large Datasets

For datasets with >100K customers, consider:

```python
# Use ADVI for approximate inference instead of MCMC
model.fit(fit_method="advi", n_iterations=30000)
```

### Serialization

```python
import pickle

# Save fitted model
with open("workspace/models/bg_model.pkl", "wb") as f:
    pickle.dump(bg_model, f)

# Save inference data separately (ArviZ NetCDF)
bg_model.idata.to_netcdf("workspace/models/bg_trace.nc")
```
