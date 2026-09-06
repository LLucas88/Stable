# Bayesian A/B Testing Reference

Conjugate prior selection, loss function interpretation, and decision rules.

## Overview

Bayesian A/B testing models the treatment effect as a probability distribution,
enabling direct statements like "there is a 95% probability that Treatment B
is better than Control." This avoids common misinterpretations of frequentist
p-values and provides actionable decision metrics such as expected loss.

## Conjugate Prior Models

### Beta-Binomial (Conversion Metrics)

**Model:** Conversions ~ Binomial(n, p), with p ~ Beta(alpha, beta).

**Prior:** Beta(alpha_0, beta_0)
- Weakly informative default: Beta(1, 1) (uniform on [0, 1]).
- Empirical Bayes: Set alpha_0 and beta_0 from historical conversion rate and
  effective sample size. E.g., if historical rate is 5% with effective n=100,
  use Beta(5, 95).

**Posterior:** Beta(alpha_0 + successes, beta_0 + failures)

**Example:**
- Prior: Beta(1, 1)
- Data: 150 conversions out of 3,000 visitors
- Posterior: Beta(151, 2851)
- Posterior mean: 151/3002 = 5.03%
- 95% credible interval: [4.26%, 5.88%]

### Normal-Normal (Continuous Metrics with Known Variance)

**Model:** Y_i ~ N(mu, sigma^2), with mu ~ N(mu_0, sigma_0^2).

**Posterior:**
```
mu | data ~ N(mu_n, sigma_n^2)
mu_n = (mu_0/sigma_0^2 + n*Y_bar/sigma^2) / (1/sigma_0^2 + n/sigma^2)
sigma_n^2 = 1 / (1/sigma_0^2 + n/sigma^2)
```

Use when the metric is approximately normal (e.g., average session duration
with large n).

### Normal-Inverse-Gamma (Continuous Metrics, Unknown Variance)

**Model:** Y_i ~ N(mu, sigma^2), with (mu, sigma^2) ~ NIG(mu_0, n_0, a_0, b_0).

**Posterior:** NIG(mu_n, n_n, a_n, b_n) where:
```
n_n = n_0 + n
mu_n = (n_0 * mu_0 + n * Y_bar) / n_n
a_n = a_0 + n/2
b_n = b_0 + 0.5 * sum((Y_i - Y_bar)^2) + (n * n_0 * (Y_bar - mu_0)^2) / (2 * n_n)
```

**Default weakly informative prior:** mu_0 = 0, n_0 = 0.01, a_0 = 0.01,
b_0 = 0.01.

Use for revenue, order value, and other metrics where variance is unknown.

## Decision Metrics

### Probability of Being Best

For K variants, compute:

```
P(variant_k is best) = P(theta_k > theta_j for all j != k)
```

**Computation:**
- For 2 variants with Beta posteriors: use the closed-form integral or Monte
  Carlo simulation (draw 10,000+ samples from each posterior, count wins).
- For K > 2 variants: Monte Carlo simulation is required.

**Interpretation:** "Treatment B has a 94% probability of having a higher
conversion rate than Control."

### Expected Loss

The expected loss of choosing variant k is:

```
E[Loss_k] = E[max(theta_j - theta_k, 0)] for j != k
```

This measures how much you expect to lose (in metric units) by choosing
variant k if it turns out not to be the best.

**Decision rule:** Choose the variant with the lowest expected loss. Ship when
the expected loss drops below an acceptable threshold epsilon.

**Threshold guidance:**
- For conversion rate: epsilon = 0.01% to 0.1% (absolute)
- For revenue per user: epsilon = $0.01 to $0.10
- Set epsilon based on the business impact of being wrong.

### Risk vs. Reward

Report both:
- **Upside:** E[theta_treatment - theta_control | treatment is better]
- **Downside:** E[theta_control - theta_treatment | control is better]

This helps decision-makers weigh the asymmetry of outcomes.

## Decision Rules

### Probability Threshold

Ship the treatment when:
```
P(treatment is best) > 1 - epsilon_prob
```

Common threshold: 95% (analogous to alpha = 0.05).

**Caution:** This rule alone can lead to premature decisions with small
samples. Always combine with expected loss or a minimum sample size.

### Expected Loss Threshold

Ship the treatment when:
```
E[Loss_treatment] < epsilon_loss
```

This is preferred over the probability threshold because it accounts for
effect size, not just direction.

### Credible Interval Exclusion

Ship when the 95% credible interval for (theta_treatment - theta_control)
excludes zero (or excludes a region of practical equivalence, ROPE).

### Recommended Combined Rule

Ship the treatment when ALL of the following hold:
1. P(treatment is best) > 90%
2. E[Loss_treatment] < epsilon_loss (business-relevant threshold)
3. At least 1,000 observations per variant
4. At least 7 days of data collected

## Prior Sensitivity

### Guidelines

- Run the analysis with the chosen prior AND with a weakly informative prior.
  If conclusions differ, note the sensitivity.
- With large samples (n > 1,000 per group), the prior has negligible impact.
- For small samples, use empirical Bayes priors from historical data to
  improve precision.

### Prior Predictive Checks

Before running the experiment, simulate data from the prior and verify that
the implied distribution of metrics is plausible. For example, a Beta(1,1)
prior implies that any conversion rate from 0% to 100% is equally likely,
which may be too diffuse for a mature product with stable baselines.

## Multiple Variants

For experiments with K > 2 variants:

1. Compute pairwise P(variant_i > variant_j) for all pairs.
2. Report the probability of each variant being the overall best.
3. Use expected loss relative to the best variant for the ship decision.
4. Consider Thompson Sampling for adaptive traffic allocation during the
   experiment (multi-armed bandit approach).
