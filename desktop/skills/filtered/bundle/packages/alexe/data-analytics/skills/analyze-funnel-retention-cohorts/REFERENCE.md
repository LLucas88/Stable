# Reference: Analyze Funnel, Retention & Cohorts

## Why this reference exists

This skill is calculation-aware.

Its job is to turn funnel and retention data into product insights. That means computing actual drop-off rates, comparing cohorts, and interpreting what the numbers mean for product decisions.

This reference defines:
- formulas for funnel and retention calculations
- cohort comparison logic
- benchmark ranges
- mandatory inputs for meaningful analysis
- invalid-use conditions

---

## Core formulas

### Funnel drop-off rate

```
drop_off_rate(step_N) = 1 - (users_at_step_N / users_at_step_N-1)
```

This is step-to-step drop-off. It tells you what fraction of users who reached step N-1 did not proceed to step N.

Example: 10,000 at step 1, 3,200 at step 2
```
drop_off_rate(step_2) = 1 - (3200 / 10000) = 1 - 0.32 = 0.68 = 68%
```

### Funnel step conversion (relative to entry)

```
conversion_rate(step_N) = users_at_step_N / users_at_step_1
```

This is the end-to-end conversion from funnel entry to step N.

Example: 920 reached first value action out of 10,000 who entered
```
conversion_rate = 920 / 10000 = 9.2%
```

### Retention rate

```
retention(day_N) = users_active_at_day_N / users_in_cohort
```

Where "active" is defined by the product (completed session, took an action, etc.).

Example: cohort of 1,000, 420 active on day 7
```
D7 retention = 420 / 1000 = 42%
```

### Cohort comparison: absolute difference

```
absolute_diff = retention_cohort_B - retention_cohort_A
```

### Cohort comparison: relative change

```
relative_change = (retention_cohort_B - retention_cohort_A) / retention_cohort_A × 100
```

Example: cohort A D7 = 34%, cohort B D7 = 40%
```
absolute_diff = 40% - 34% = +6 percentage points
relative_change = (40 - 34) / 34 × 100 = +17.6%
```

---

## Benchmark ranges

These are directional, not universal. Context matters.

**SaaS / app retention (general)**
- D1 retention: 60-70% (good), below 40% (poor)
- D7 retention: 40-55% (good), below 25% (poor)
- D30 retention: 25-40% (good), below 15% (poor)

**E-commerce funnel (checkout completion)**
- Product page to cart: 20-40%
- Cart to checkout initiation: 60-80%
- Checkout initiation to completion: 50-70%
- Overall product page to purchase: 1-5% (browse), 10-30% (intent-driven)

**Activation funnels**
- Landing to signup: 15-35% (consumer), 5-15% (B2B)
- Signup to first value action: 25-50% (consumer), 20-40% (B2B)
- First value action to D7 retained: varies widely by product type

These are starting points. The right benchmark for your product depends on channel mix, traffic intent, and product type.

---

## Mandatory inputs for meaningful analysis

To produce a defensible analysis:
- Funnel data: user counts at each step, or retention values by cohort
- Cohort definition: what event groups users (signup date, first purchase, etc.)
- Metric definition: what "active" or "converted" means
- Time periods: which weeks or months are being analyzed
- Cohort sizes: number of users in each cohort

Without cohort sizes, you cannot assess whether differences are meaningful or noise.

---

## Invalid-use conditions

Do not draw conclusions from this analysis if:
- Any cohort has fewer than 100 users (results are dominated by noise)
- Cohort windows overlap (users appear in multiple cohorts)
- Intermediate funnel steps are missing (gaps in the funnel hide drop-off location)
- "Active" definition changed between cohorts (you'd be comparing different metrics)
- Data is from different time periods with known seasonality differences

---

## When output must be downgraded

The skill should produce descriptive output only (not causal conclusions) when:
- Cohort sizes are small
- Funnel steps are incomplete
- No segment breakdown is available to test alternative explanations

Correlation in funnel and cohort data is not causation. Funnel insights generate hypotheses. Confirming causes requires controlled experiments or qualitative research.
