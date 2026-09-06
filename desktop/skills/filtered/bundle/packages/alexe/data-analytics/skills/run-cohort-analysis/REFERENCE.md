# Reference: Run Cohort Analysis

## Why this reference exists

This skill is calculation-aware.

Its job is to structure, compute, and interpret cohort tables. That means building the table correctly, calculating retention per cell, comparing cohort curves, and extracting insights that are grounded in the data.

This reference defines:
- cohort table structure
- retention rate formula per cell
- cohort comparison logic
- curve shape interpretation
- annotation approach
- mandatory inputs
- invalid-use conditions

---

## Cohort table structure

Rows represent cohorts, typically grouped by signup week or month.
Columns represent time periods elapsed since cohort entry (week 0, week 1, week 2...).

```
         | Week 0 | Week 1 | Week 2 | Week 3 | Week 4
---------|--------|--------|--------|--------|--------
Jan wk1  | 100%   | 48%    | 38%    | 32%    | 29%
Jan wk2  | 100%   | 51%    | 41%    | 35%    | 31%
Jan wk3  | 100%   | 53%    | 43%    | 37%    | 33%
Feb wk1  | 100%   | 58%    | 47%    | 41%    | -
Feb wk2  | 100%   | 61%    | 49%    | -      | -
```

Week 0 is always 100% (the definition of the cohort). Cells with "-" are not yet observable.

---

## Retention rate per cell

```
retention(cohort_C, period_P) = users_from_cohort_C_active_at_period_P / total_users_in_cohort_C
```

Example: cohort of 240 users signed up in Jan wk1, 115 were active in week 1
```
retention(Jan wk1, week 1) = 115 / 240 = 0.479 = 47.9%
```

This formula applies regardless of metric (sessions, purchases, feature actions) as long as "active" is consistently defined.

---

## Cohort comparison: absolute change

```
absolute_diff = retention(cohort_B, period_P) - retention(cohort_A, period_P)
```

Positive value means cohort B retains better at that period.

Example: Jan wk1 week-2 retention = 38%, Feb wk1 week-2 retention = 47%
```
absolute_diff = 47% - 38% = +9 percentage points
```

---

## Curve shapes and what they mean

**Fast decay:** retention drops steeply in the first 1-2 periods, then continues declining. No plateau.
- Interpretation: users try the product and leave. Likely an activation or value delivery problem.

**Stable plateau:** retention drops initially, then flattens. Later cohorts show similar plateau levels.
- Interpretation: there is a retained core. The product has a stable user base; the challenge is increasing plateau height.

**Improving trend:** later cohorts (newer) show higher retention at comparable periods than earlier cohorts.
- Interpretation: product improvements are translating into better retention. Positive trend.

**Worsening trend:** later cohorts show lower retention at comparable periods than earlier cohorts.
- Interpretation: product quality is degrading, acquisition quality is declining, or market mix is shifting.

---

## Annotating cohort boundaries

When a product change was shipped on a specific date, mark which cohort boundary it falls on.

Example: new onboarding flow shipped Feb 3. The first cohort fully exposed to it is Feb wk1.

Compare retention curves for cohorts before and after that boundary to assess whether the change had an effect. This is observational, not causal — but it narrows hypotheses.

---

## Mandatory inputs

To produce a meaningful cohort analysis:
- Cohort definition event (what groups users: signup date, first purchase, first login)
- Metric or action that defines "active" at each period
- Time range with enough data to see at least 3-4 periods per cohort
- Cohort sizes (number of users in each row)

Without cohort sizes, you cannot distinguish a 10-point difference in a cohort of 2,000 from a 10-point difference in a cohort of 38.

---

## Small cohort thresholds

Cohort sample sizes affect reliability:
- Fewer than 50 users in a cohort: noise dominates, do not draw conclusions
- 50-200 users: treat findings with caution, report directional only
- 200+ users: sufficient for basic comparison
- 500+ users: sufficient for confident comparison

When a cohort is below 200, state the limitation explicitly and avoid strong claims about that cohort's performance.

---

## Invalid-use conditions

Do not interpret cohort data as reliable if:
- Any cohort being compared has fewer than 50 users
- Cohort types are mixed without labeling (time-based cohorts mixed with behavior-based cohorts)
- Cohort attribution is ambiguous (users could belong to multiple cohorts due to re-signup or re-activation)
- "Active" definition changed across the time window (you'd be measuring different things in different cohorts)
- Only one cohort is available (no comparison baseline)
