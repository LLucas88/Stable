# CLV Methodology Reference

## BG/NBD (Beta-Geometric/Negative Binomial Distribution) Model

### Overview

The BG/NBD model (Fader, Hardie, and Lee, 2005) is a probabilistic model for non-contractual
customer behavior. It models two processes simultaneously:

1. **Transaction process**: while active, a customer makes purchases at rate lambda
2. **Dropout process**: after any transaction, a customer may become inactive with probability p

### Assumptions

1. While active, the number of transactions in time t follows a Poisson process with rate lambda
2. Heterogeneity in transaction rates across customers follows a Gamma distribution:
   `lambda ~ Gamma(r, alpha)`
3. After each transaction, a customer becomes inactive with probability p
4. Heterogeneity in dropout probability follows a Beta distribution:
   `p ~ Beta(a, b)`
5. Transaction rate and dropout probability are independent across customers

### Parameters

| Parameter | Description | Typical Range |
|-----------|-------------|---------------|
| r | Shape of Gamma (transaction rate heterogeneity) | 0.1 - 5.0 |
| alpha | Scale of Gamma (inverse rate) | 1.0 - 100.0 |
| a | Alpha of Beta (dropout probability heterogeneity) | 0.1 - 5.0 |
| b | Beta of Beta (dropout probability heterogeneity) | 0.1 - 20.0 |

### Key Formulas

**Likelihood for individual i with frequency x, recency t_x, and tenure T:**

```
L(r, alpha, a, b | x, t_x, T) =
  [Gamma(r+x) * alpha^r] / [Gamma(r) * (alpha + T)^(r+x)]
  * [a / (b + x - 1)] * [(alpha + T) / (alpha + t_x)]^(r+x)
  + delta(x>0) * [Gamma(r+x) * alpha^r] / [Gamma(r)]
    * [b + x - 1] / [a + b + x - 1]
    * [1 / (alpha + t_x)^(r+x)]
```

**Expected number of transactions in future period (0, t] for a customer:**

```
E[X(t) | x, t_x, T, r, alpha, a, b] =
  (a + b + x - 1) / (a - 1)
  * [1 - ((alpha + T) / (alpha + T + t))^(r + x)
    * hypergeometric_2F1(r+x, b+x; a+b+x-1; t/(alpha+T+t))]
  * P(alive | x, t_x, T)
```

**Probability alive:**

```
P(alive | x, t_x, T, r, alpha, a, b) =
  1 / [1 + (a / (b + x - 1)) * ((alpha + T) / (alpha + t_x))^(r+x)]
  (for x > 0)
```

### Interpretation

- Higher `r`: more concentrated transaction rate distribution
- Higher `alpha`: lower average transaction rate
- Higher `a` relative to `b`: higher average dropout probability
- Probability-alive decreases as recency increases (longer since last purchase)

## Gamma-Gamma Model

### Overview

The Gamma-Gamma model (Fader and Hardie, 2013) estimates the expected average monetary value
per transaction for each customer. It complements the BG/NBD model which handles frequency.

### Assumptions

1. Monetary value of a customer's transactions varies randomly around their average
   transaction value
2. Average transaction values vary across customers following a Gamma distribution
3. The distribution of individual transaction values around the mean is independent
   of the transaction process (frequency)
4. **Critical**: monetary value must be approximately independent of purchase frequency

### Parameters

| Parameter | Description |
|-----------|-------------|
| p | Shape of the Gamma-Gamma (individual transaction value variability) |
| q | Shape of the Gamma prior on mean transaction value across customers |
| v | Scale of the Gamma prior on mean transaction value across customers |

### Key Formulas

**Expected average transaction value for customer i:**

```
E[M | x, m_x, p, q, v] = [q * v + x * m_x] / [q + x - 1]
  (weighted average of population mean and individual observed mean)
```

Where:
- `x` = customer's frequency (repeat purchase count)
- `m_x` = customer's observed average transaction value (repeat purchases only)
- `q * v / (q - 1)` = population-level expected monetary value

**Combined CLV formula:**

```
CLV_i = E[transactions_i(t)] * E[M_i] * margin * discount_factor(t, d)
```

Where:
- `discount_factor(t, d) = sum_{j=1}^{t} 1/(1+d)^j` for discrete periods
- `d` = periodic discount rate (annual rate / periods per year)

### Independence Assumption Validation

Before fitting the Gamma-Gamma model, verify that frequency and monetary value
are approximately independent:

```
correlation(frequency, monetary_value) < 0.3
```

If violated, consider:
- Log-transforming monetary value
- Using a different monetary value model
- Documenting the limitation and potential bias

## Beta-Geometric (BG/BB) Model for Contractual Settings

### Overview

The Beta-Geometric/Beta-Binomial model applies to contractual or subscription settings
where customers have discrete renewal opportunities and can churn at each one.

### Assumptions

1. At each renewal opportunity, a customer churns with probability theta
2. Heterogeneity in churn probability follows a Beta distribution:
   `theta ~ Beta(alpha, beta)`
3. Once churned, a customer does not return

### Key Formulas

**Survival function (probability of being active after n periods):**

```
S(n | alpha, beta) = B(alpha, beta + n) / B(alpha, beta)
```

Where B is the Beta function.

**Expected remaining lifetime for active customer at period n:**

```
E[remaining_lifetime | active at n] =
  sum_{j=1}^{infinity} S(n+j | alpha, beta) / S(n | alpha, beta)
```

**Contractual CLV:**

```
CLV = E[remaining_periods] * period_revenue * discount_factor
```

### Retention Rate Curve

The model produces a retention curve that typically shows:
- High initial churn (weakly committed customers drop early)
- Declining churn rate over time (survivors are increasingly loyal)
- This negative duration dependence is a natural outcome of Beta heterogeneity

### Parameter Interpretation

| Parameter | Interpretation |
|-----------|---------------|
| alpha / (alpha + beta) | Mean churn probability per period |
| alpha + beta | Concentration (higher = less heterogeneity in churn) |

## Model Selection Guide

| Scenario | Recommended Model |
|----------|-------------------|
| Non-contractual, transaction data | BG/NBD + Gamma-Gamma |
| Subscription with renewal periods | Beta-Geometric (BG/BB) |
| Need uncertainty quantification | Bayesian (PyMC-Marketing) versions |
| Large dataset (>100K), quick iteration | MLE via lifetimes library |
| Small dataset, regulatory reporting | Bayesian via PyMC-Marketing |

## References

- Fader, P.S., Hardie, B.G.S., and Lee, K.L. (2005). "Counting Your Customers the Easy Way:
  An Alternative to the Pareto/NBD Model." Marketing Science, 24(2), 275-284.
- Fader, P.S. and Hardie, B.G.S. (2013). "The Gamma-Gamma Model of Monetary Value."
  http://www.brucehardie.com/notes/025/
- Fader, P.S. and Hardie, B.G.S. (2007). "How to Project Customer Retention."
  Journal of Interactive Marketing, 21(1), 76-90.
