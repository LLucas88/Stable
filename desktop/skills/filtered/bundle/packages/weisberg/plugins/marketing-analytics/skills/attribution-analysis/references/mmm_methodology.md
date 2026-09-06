# Bayesian Marketing Mix Modeling Methodology

## Overview

Marketing Mix Modeling (MMM) is a statistical technique that quantifies the incremental
impact of marketing activities on a business outcome (conversions, revenue, signups).
The Bayesian approach treats all model parameters as random variables with prior
distributions, producing full posterior distributions that naturally express uncertainty.

---

## The MMM Equation

The core MMM model decomposes the outcome variable `y(t)` at time `t` as:

```
y(t) = intercept + sum_c[ beta_c * saturation(adstock(x_c(t))) ] + gamma * Z(t) + epsilon(t)
```

Where:
- `x_c(t)` is the raw media spend (or impressions) for channel `c` at time `t`
- `adstock(.)` applies carry-over transformation to capture delayed effects
- `saturation(.)` applies diminishing returns transformation
- `beta_c` is the channel coefficient (effect size)
- `Z(t)` is a matrix of control variables (seasonality, holidays, trend)
- `gamma` is the vector of control coefficients
- `epsilon(t) ~ Normal(0, sigma)` is the noise term

---

## Adstock Transformations

Adstock captures the lagged effect of advertising: exposure today continues to influence
behavior in subsequent periods.

### Geometric Adstock

The simplest and most common form. A single parameter `alpha` (retention rate, 0 < alpha < 1)
controls how quickly the effect decays:

```
adstock(t) = x(t) + alpha * adstock(t-1)
```

Equivalently, the weight at lag `l` is `alpha^l`. The half-life is `log(0.5) / log(alpha)`.

**Prior guidance:**
- `alpha ~ Beta(3, 3)` centers at 0.5 with moderate uncertainty
- For brand awareness channels (TV, OOH): consider `Beta(5, 2)` favoring longer decay
- For performance channels (search, retargeting): consider `Beta(2, 5)` favoring shorter decay

### Weibull Adstock

More flexible two-parameter form that can model delayed peaks (hump-shaped response):

```
w(l) = 1 - CDF_Weibull(l; shape, scale)
```

Where `shape` controls the curve form:
- `shape < 1`: monotonically decreasing (similar to geometric)
- `shape = 1`: exponential decay
- `shape > 1`: delayed peak followed by decay

**Prior guidance:**
- `shape ~ HalfNormal(1)` — allows both immediate and delayed response
- `scale ~ HalfNormal(5)` — controls the time scale of the effect

---

## Saturation (Diminishing Returns)

The Hill function models how channel effectiveness decreases as spend increases:

```
saturation(x) = x^S / (K^S + x^S)
```

Where:
- `S` (slope/shape) controls the steepness of the curve
- `K` (half-saturation, EC50) is the spend level at which effectiveness is 50% of maximum

**Properties:**
- At low spend (`x << K`): approximately linear response
- At `x = K`: 50% of maximum effect is reached
- At high spend (`x >> K`): approaching ceiling (saturation)

**Prior guidance:**
- `K ~ HalfNormal(median_spend)` — center the half-saturation around observed median spend
- `S ~ HalfNormal(2)` — gentle curvature by default; values above 3 create sharp transitions
- Alternatively, use logistic saturation: `saturation(x) = 1 - exp(-lambda * x)`
  with `lambda ~ HalfNormal(1 / mean_spend)`

---

## Control Variables

### Seasonality (Fourier Terms)

Approximate seasonal patterns using Fourier series:

```
seasonality(t) = sum_k[ a_k * sin(2*pi*k*t/P) + b_k * cos(2*pi*k*t/P) ]
```

Where `P` is the period (52 for yearly seasonality with weekly data) and `k` ranges
from 1 to `K` (number of harmonics, typically 3-6 for yearly).

### Holiday Effects

Binary indicators for known holidays with optional windows (pre/post effects).
Financial services: include quarter-end effects, tax deadlines, enrollment periods.

### Trend

Linear trend or piecewise-linear changepoints for structural shifts (e.g., product
launches, market entry).

---

## Prior Specification Strategy

### Levels of Prior Informativeness

1. **Vague (reference) priors**: Wide distributions that let the data dominate.
   Use for initial exploratory fits.
   - `beta_c ~ HalfNormal(10)` (positive channel effects assumed)
   - `sigma ~ HalfNormal(observed_std)`

2. **Weakly informative priors**: Constrain parameters to plausible ranges based on
   domain knowledge.
   - `beta_c ~ HalfNormal(1)` (effects within reasonable magnitude)
   - Adstock `alpha ~ Beta(3, 3)` (centered at 0.5)

3. **Informative priors (calibrated)**: Derived from incrementality lift tests or
   historical MMM results.
   - See `references/incrementality_calibration.md` for the calibration procedure
   - `beta_c ~ LogNormal(mu_lift, sigma_lift)` where parameters come from the lift test

### Prior Sensitivity Analysis

Always compare fits under different prior specifications:

1. Fit Model A with vague priors
2. Fit Model B with informative priors
3. Compare posteriors: if they largely agree, the data is informative; if they
   diverge substantially, flag that results are prior-sensitive and recommend more data
   or targeted experiments

---

## Bayesian Inference via MCMC

### NUTS Sampler

The No-U-Turn Sampler (NUTS) is an adaptive variant of Hamiltonian Monte Carlo (HMC)
that automatically tunes the trajectory length. It is the default sampler in PyMC and
is well-suited to MMM parameter spaces.

**Recommended settings:**
- `tune=2000` warmup iterations (minimum; increase for complex models)
- `draws=2000` posterior samples per chain
- `chains=4` for convergence diagnostics
- `target_accept=0.9` (increase to 0.95-0.99 if divergences occur)
- `random_seed` for reproducibility

### Convergence Diagnostics

| Metric | Threshold | Meaning |
|--------|-----------|---------|
| R-hat | < 1.05 | Chains have mixed well |
| ESS bulk | > 400 | Enough effective samples for mean estimation |
| ESS tail | > 400 | Enough effective samples for tail estimation |
| Divergences | 0 | No numerical issues in sampling |
| Tree depth | < max_treedepth | Sampler not hitting limits |

If diagnostics fail:
1. Increase `target_accept` (reduces step size)
2. Reparameterize the model (non-centered parameterization)
3. Increase `tune` iterations
4. Simplify the model (fewer channels, simpler adstock)
5. Check for multicollinearity in spend data

---

## Model Comparison

### WAIC (Widely Applicable Information Criterion)

Estimates out-of-sample predictive accuracy using the log pointwise predictive density.
Lower WAIC is better. Computed from posterior samples without refitting.

### LOO-CV (Leave-One-Out Cross-Validation via PSIS)

Uses Pareto-Smoothed Importance Sampling to approximate leave-one-out cross-validation.
More robust than WAIC for models with influential observations. The Pareto k diagnostic
flags problematic observations (k > 0.7 indicates unreliable estimates).

### When to Compare Models

- Different adstock specifications (geometric vs. Weibull)
- Different saturation functions (Hill vs. logistic)
- Including/excluding control variables
- Different channel groupings

---

## Financial Services Extensions

When applying MMM to financial services marketing:

1. **Long lag structures**: Use Weibull adstock with `shape > 1` to model the
   12-36 month sales cycles common in institutional finance.
2. **Multi-stage funnels**: Consider separate models for lead generation vs.
   AUM conversion, linked through a shared latent variable.
3. **Regulatory spend**: Compliance-mandated advertising (disclosures, prospectus delivery)
   should be modeled as a control, not a media channel.
4. **Market conditions**: Include market indices (S&P 500, VIX) as control variables;
   financial product demand correlates with market performance.
5. **Net-of-fees**: When attributing revenue, always clarify whether ROAS is
   computed on gross or net-of-fees revenue.
