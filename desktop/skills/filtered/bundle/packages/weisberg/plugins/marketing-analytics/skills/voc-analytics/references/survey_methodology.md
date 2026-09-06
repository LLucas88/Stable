# Survey Methodology Reference

NPS/CSAT/CES formulas, confidence interval methods, and significance testing.

## Net Promoter Score (NPS)

### Formula

```
NPS = (Number of Promoters / Total Respondents) - (Number of Detractors / Total Respondents)
NPS = % Promoters - % Detractors
```

Score ranges (on 0-10 scale):
- **Promoters:** 9-10
- **Passives:** 7-8
- **Detractors:** 0-6

NPS ranges from -100 (all Detractors) to +100 (all Promoters).

### Interpretation Benchmarks

| NPS Range  | Interpretation           |
| :--------- | :----------------------- |
| 70+        | Exceptional              |
| 50-69      | Excellent                |
| 30-49      | Good                     |
| 0-29       | Needs improvement        |
| Below 0    | Critical attention needed|

## Customer Satisfaction Score (CSAT)

### Formula

```
CSAT = (Number of Satisfied Respondents / Total Respondents) * 100
```

"Satisfied" typically means top-box or top-2-box on the response scale:
- **5-point scale:** scores of 4 or 5
- **7-point scale:** scores of 6 or 7
- **10-point scale:** scores of 9 or 10

### Variants

- **Top-box CSAT:** Only the highest score counts as satisfied.
- **Top-2-box CSAT:** The two highest scores count as satisfied.
- **Mean CSAT:** Arithmetic mean of all scores (alternative to percentage).

Always document which variant is being reported.

## Customer Effort Score (CES)

### Formula

```
CES = Sum of All Effort Scores / Number of Respondents
```

Measured on a 1-7 Likert scale where:
- 1 = Strongly Disagree (very high effort)
- 7 = Strongly Agree (very low effort)

The question stem is typically: "The company made it easy for me to handle
my issue."

Higher CES indicates lower customer effort, which is desirable.

## Confidence Interval Methods

### Bootstrap Confidence Intervals for NPS

NPS is bounded [-100, +100] and non-Gaussian, so normal approximation CIs
are inappropriate. Use bootstrap resampling instead.

**Algorithm:**

```
1. From the original N survey responses, draw B bootstrap samples
   (each of size N, sampled with replacement).
2. Compute NPS_b for each bootstrap sample b = 1, ..., B.
3. Sort the B bootstrap NPS values.
4. The 95% CI is [NPS_(alpha/2), NPS_(1-alpha/2)] where alpha = 0.05.
   - Lower bound: 2.5th percentile of bootstrap distribution
   - Upper bound: 97.5th percentile of bootstrap distribution
```

**Parameters:**
- B >= 10,000 bootstrap iterations for stable estimates.
- Use the bias-corrected and accelerated (BCa) method for improved coverage
  when sample sizes are small (n < 100).

### Bootstrap CIs for CSAT

CSAT is a proportion, so the standard Wald interval can be used for large
samples. However, bootstrap is preferred for consistency and when sample
sizes are moderate.

```
Wald interval (large sample fallback):
  SE = sqrt(CSAT * (1 - CSAT) / n)
  CI = CSAT +/- Z_{alpha/2} * SE
```

For small samples (n < 30), use the Wilson score interval instead of Wald.

### Bootstrap CIs for CES

CES is a continuous mean, so bootstrap or standard t-interval may be used.

```
t-interval:
  SE = s / sqrt(n)
  CI = CES_mean +/- t_{alpha/2, n-1} * SE
```

Bootstrap is preferred when the distribution of effort scores is skewed.

## Significance Testing

### Comparing NPS Between Two Periods

Use a two-proportion z-test on the Promoter and Detractor rates, or
bootstrap the difference in NPS.

**Bootstrap difference test:**

```
1. Compute NPS_A from period A responses and NPS_B from period B responses.
2. Observed difference: delta = NPS_B - NPS_A.
3. Pool all responses. Draw B bootstrap samples of size n_A and n_B.
4. Compute the bootstrap difference delta_b for each sample.
5. p-value = proportion of |delta_b| >= |delta| under the null.
```

Alternatively, use the permutation test: shuffle period labels and
recompute NPS difference for each permutation.

### Comparing CSAT Between Groups

Use a chi-squared test or Fisher's exact test (for small samples) on the
contingency table of satisfied vs. not-satisfied across groups.

```
Chi-squared test:
  H0: CSAT_A = CSAT_B
  Test statistic: chi2 = sum((O - E)^2 / E)
  df = (rows - 1) * (cols - 1)
```

### Comparing CES Between Groups

Use a two-sample t-test (or Welch's t-test for unequal variances) on the
raw effort scores.

```
Welch's t-test:
  t = (mean_A - mean_B) / sqrt(s_A^2/n_A + s_B^2/n_B)
  df = Welch-Satterthwaite approximation
```

For non-normal distributions, use the Mann-Whitney U test as a
nonparametric alternative.

### Multiple Comparison Correction

When testing satisfaction differences across multiple segments or time
periods simultaneously, apply Benjamini-Hochberg FDR correction:

```
1. Rank p-values from smallest to largest: p_(1) <= p_(2) <= ... <= p_(m).
2. For each rank i, compute threshold: (i / m) * alpha.
3. Find the largest i where p_(i) <= (i / m) * alpha.
4. Reject all hypotheses with rank <= i.
```

## Sample Size Requirements

### Minimum Sample Sizes by Metric

| Metric | Minimum for Reporting | Minimum for Significance Testing |
| :----- | :-------------------- | :------------------------------- |
| NPS    | 30 responses          | 200+ per group                   |
| CSAT   | 30 responses          | 100+ per group                   |
| CES    | 30 responses          | 100+ per group                   |

### NPS Margin of Error by Sample Size

| Sample Size | Approximate 95% Margin of Error |
| :---------- | :------------------------------ |
| 50          | +/- 14 points                   |
| 100         | +/- 10 points                   |
| 200         | +/- 7 points                    |
| 500         | +/- 4.5 points                  |
| 1,000       | +/- 3 points                    |

These are approximate; actual margins depend on the distribution of scores.

## Response Bias Considerations

- **Non-response bias:** Respondents may differ systematically from
  non-respondents. Track response rates by segment and weight if needed.
- **Recency bias:** Respondents over-weight recent experiences. Consider
  time-since-interaction as a covariate.
- **Extreme response bias:** Some respondents tend toward scale endpoints.
  Monitor for suspicious patterns (all 10s or all 0s).
- **Survey fatigue:** Response quality degrades with survey length. Keep
  surveys under 5 minutes for transactional and under 15 for relational.
