# PyMC-Marketing MMM API Reference

## Overview

PyMC-Marketing provides the `MMM` class for Bayesian marketing mix modeling. It wraps
PyMC's probabilistic programming framework with marketing-specific transformations
(adstock, saturation) and convenience methods for fitting, prediction, contribution
decomposition, and budget optimization.

**Installation:**
```bash
pip install pymc-marketing
```

**Key dependencies:** PyMC (>=5.0), ArviZ, NumPy, Pandas, scikit-learn

---

## MMM Class

```python
from pymc_marketing.mmm import MMM
```

### Constructor

```python
mmm = MMM(
    date_column="date",              # Name of the date column
    channel_columns=["tv", "search", "social"],  # Media channel columns
    adstock="geometric",             # "geometric" or "weibull"
    saturation="logistic",           # "logistic" or "hill" (michaelis-menten)
    control_columns=["trend", "seasonality"],  # Optional control variable columns
    yearly_seasonality=6,            # Number of Fourier harmonics for yearly seasonality
    adstock_max_lag=8,               # Maximum lag for adstock transformation (in data grain units)
)
```

### Key Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `date_column` | str | required | Name of date column in the dataframe |
| `channel_columns` | list[str] | required | Names of media spend/impression columns |
| `adstock` | str | "geometric" | Adstock type: "geometric" or "weibull" |
| `saturation` | str | "logistic" | Saturation type: "logistic" or "michaelis_menten" |
| `control_columns` | list[str] | None | Control variable column names |
| `yearly_seasonality` | int | None | Number of Fourier pairs for yearly seasonality |
| `adstock_max_lag` | int | 4 | Maximum adstock lag in time periods |

---

## Fitting the Model

### `mmm.fit(X, y, ...)`

```python
mmm.fit(
    X=df_features,                   # DataFrame with date, channels, controls
    y=df_features["revenue"],        # Target series
    target_accept=0.9,               # NUTS target acceptance rate
    tune=2000,                       # Number of tuning steps
    draws=2000,                      # Number of posterior draws
    chains=4,                        # Number of MCMC chains
    random_seed=42,                  # For reproducibility
)
```

After fitting, the posterior trace is stored in `mmm.fit_result` (an ArviZ InferenceData object).

### Custom Priors

Override default priors by passing a dictionary:

```python
custom_priors = {
    "intercept": {"dist": "Normal", "kwargs": {"mu": 0, "sigma": 2}},
    "beta_channel": {"dist": "HalfNormal", "kwargs": {"sigma": 1}},
    "alpha": {"dist": "Beta", "kwargs": {"alpha": 3, "beta": 3}},       # geometric adstock
    "lam": {"dist": "HalfNormal", "kwargs": {"sigma": 2}},              # logistic saturation
    "likelihood": {"dist": "Normal", "kwargs": {"sigma": {"dist": "HalfNormal", "kwargs": {"sigma": 1}}}},
}

mmm = MMM(
    ...,
    adstock_prior={"dist": "Beta", "kwargs": {"alpha": 3, "beta": 3}},
    saturation_prior={"dist": "Gamma", "kwargs": {"alpha": 2, "beta": 1}},
)
```

---

## Posterior Analysis

### Contribution Decomposition

```python
# Get channel contributions as a DataFrame
contributions = mmm.compute_channel_contribution_original_scale()
# Shape: (n_draws, n_dates, n_channels)

# Mean contributions
mean_contributions = contributions.mean(axis=0)
```

### Posterior Predictive

```python
# In-sample posterior predictive
posterior_pred = mmm.sample_posterior_predictive(
    X=df_features,
    extend_idata=True,
)

# Out-of-sample prediction
new_pred = mmm.sample_posterior_predictive(
    X=df_new_features,
    extend_idata=False,
)
```

---

## Budget Optimization

```python
# Optimize budget allocation across channels
optimal_allocation = mmm.optimize_budget(
    total_budget=100_000,            # Total budget to allocate
    budget_bounds={                   # Per-channel min/max constraints
        "tv": [5_000, 50_000],
        "search": [10_000, 60_000],
        "social": [5_000, 30_000],
    },
    num_samples=1000,                # Number of posterior samples to use
)
```

Returns a dictionary mapping channel names to optimal spend amounts.

### Scenario Analysis

```python
# Predict outcome under a hypothetical spend scenario
scenario_spend = pd.DataFrame({
    "date": future_dates,
    "tv": [20_000] * n_weeks,
    "search": [30_000] * n_weeks,
    "social": [10_000] * n_weeks,
    "trend": trend_values,
    "seasonality": seasonality_values,
})

scenario_pred = mmm.sample_posterior_predictive(
    X=scenario_spend,
    extend_idata=False,
)
# Analyze posterior predictive distribution for the scenario
```

---

## Diagnostics with ArviZ

```python
import arviz as az

# Summary table with R-hat and ESS
summary = az.summary(mmm.fit_result, round_to=3)

# Trace plots
az.plot_trace(mmm.fit_result, var_names=["intercept", "beta_channel", "alpha", "lam"])

# Posterior predictive check
az.plot_ppc(mmm.fit_result, num_pp_samples=100)

# WAIC
waic = az.waic(mmm.fit_result)

# LOO-CV
loo = az.loo(mmm.fit_result)

# Energy plot (diagnose sampling issues)
az.plot_energy(mmm.fit_result)

# Forest plot (compare channel effects)
az.plot_forest(mmm.fit_result, var_names=["beta_channel"])
```

---

## Accessing Transformed Parameters

```python
# Adstock parameters (retention rates for geometric)
adstock_params = mmm.fit_result.posterior["alpha"]

# Saturation parameters
saturation_params = mmm.fit_result.posterior["lam"]

# Channel coefficients
betas = mmm.fit_result.posterior["beta_channel"]

# Get the adstocked and saturated channel data
adstocked = mmm.compute_adstocked_data()
saturated = mmm.compute_saturated_data()
```

---

## Saving and Loading Models

```python
# Save the fitted model
mmm.save("workspace/models/mmm_fitted.nc")

# Load a previously fitted model
mmm_loaded = MMM.load("workspace/models/mmm_fitted.nc")

# Save just the trace
mmm.fit_result.to_netcdf("workspace/models/mmm_trace.nc")
```

---

## Common Usage Pattern

```python
import pandas as pd
from pymc_marketing.mmm import MMM

# 1. Load and prepare data
df = pd.read_csv("workspace/raw/mmm_input.csv", parse_dates=["date"])

# 2. Initialize model
mmm = MMM(
    date_column="date",
    channel_columns=["tv_spend", "search_spend", "social_spend", "display_spend"],
    control_columns=["trend"],
    adstock="geometric",
    saturation="logistic",
    yearly_seasonality=6,
    adstock_max_lag=8,
)

# 3. Fit
mmm.fit(
    X=df[["date"] + mmm.channel_columns + mmm.control_columns],
    y=df["revenue"],
    tune=2000,
    draws=2000,
    chains=4,
    target_accept=0.9,
    random_seed=42,
)

# 4. Validate
import arviz as az
summary = az.summary(mmm.fit_result)
assert (summary["r_hat"] < 1.05).all(), "Convergence failed"
assert (summary["ess_bulk"] > 400).all(), "Insufficient ESS"

# 5. Decompose contributions
contributions = mmm.compute_channel_contribution_original_scale()

# 6. Optimize budget
optimal = mmm.optimize_budget(total_budget=200_000)

# 7. Save
mmm.save("workspace/models/mmm_fitted.nc")
```

---

## Fallback: Ridge Regression (Robyn-style)

When MCMC is impractical (insufficient compute, very large datasets, or user preference),
use a frequentist ridge regression with manually applied adstock/saturation transforms:

```python
from sklearn.linear_model import Ridge
import numpy as np

# Apply geometric adstock manually
def geometric_adstock(x, alpha, max_lag=8):
    result = np.zeros_like(x, dtype=float)
    for t in range(len(x)):
        for l in range(min(t + 1, max_lag)):
            result[t] += x[t - l] * (alpha ** l)
    return result

# Apply Hill saturation manually
def hill_saturation(x, K, S):
    return x**S / (K**S + x**S)

# Fit ridge regression on transformed features
model = Ridge(alpha=1.0)
model.fit(X_transformed, y)
```

Note: This fallback does NOT provide posterior distributions or credible intervals.
Document this limitation clearly when using it.
