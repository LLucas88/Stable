# Reference: Analyze Churn & Retention

## Why this reference exists

This skill is calculation-aware.

Its job is to compute and interpret churn and retention metrics correctly — including the ones that are commonly misapplied. That means computing rates from the right denominator, calculating NRR, and avoiding invalid comparisons.

This reference defines:
- core churn and retention formulas
- NRR calculation
- cohort survival curve logic
- benchmark ranges
- segment breakdown priority
- mandatory inputs
- invalid-use conditions

---

## Core formulas

### Monthly churn rate

```
monthly_churn = churned_users_in_month / active_users_at_start_of_month
```

The denominator is users at the start of the month, not the end, not an average.

Example: 3,200 active users on Oct 1, 224 churned during October
```
monthly_churn = 224 / 3200 = 7%
```

### Annual churn from monthly (correct method)

```
annual_churn = 1 - (1 - monthly_churn)^12
```

This is the correct formula. Do not use 12 × monthly_churn.

Example: 5% monthly churn
```
annual_churn = 1 - (1 - 0.05)^12 = 1 - (0.95)^12 = 1 - 0.540 = 46%
```

Incorrect method: 5% × 12 = 60%. This overstates annual churn because it ignores that you lose fewer users each month as the base shrinks.

### Revenue churn (MRR churn rate)

```
mrr_churn_rate = churned_MRR_in_month / total_MRR_at_start_of_month
```

Churned MRR = MRR from customers who cancelled during the month.
This is revenue-weighted and will differ from user churn if customers have different plan sizes.

Example: $120,000 MRR on Oct 1, $8,400 churned MRR
```
mrr_churn_rate = 8400 / 120000 = 7%
```

### Net Revenue Retention (NRR)

```
NRR = (starting_MRR + expansion_MRR - contraction_MRR - churned_MRR) / starting_MRR
```

Where:
- Expansion MRR: upgrades, upsells, seat additions from existing customers
- Contraction MRR: downgrades from existing customers
- Churned MRR: MRR from customers who cancelled

NRR > 100% means the existing customer base is growing in revenue despite churn.

Example: starting MRR = $120,000, expansion = $9,600, contraction = $2,400, churn = $8,400
```
NRR = (120,000 + 9,600 - 2,400 - 8,400) / 120,000 = 118,800 / 120,000 = 99%
```

### Cohort retention

```
retention(cohort, month_N) = users_retained_from_cohort / original_cohort_size
```

Where "retained" means still active (not churned) at month N, using the same churn definition throughout.

---

## Survival curve

A survival curve plots each cohort's retention rate across months.

Construction: for each cohort row, plot month_0 = 100%, month_1, month_2... through available data.

Plateau interpretation: if a cohort's retention curve flattens (minimal additional churn after a certain month), the plateau level represents the stable core of retained users. Higher plateau = better long-term retention.

Improving trend: if later cohorts have a higher plateau than earlier cohorts, retention quality is improving over time.

---

## Benchmark ranges

These are directional. Product type and business model matter significantly.

**B2C subscription:**
- Monthly churn: 3-8% is typical, under 3% is strong
- Annual churn: 30-60% typical range

**B2B SaaS:**
- Monthly churn: 1-2.5% is typical, under 1% is strong
- Annual churn: 12-26% typical range

**NRR benchmarks:**
- NRR > 120%: best-in-class (expansion more than offsets churn)
- NRR 100-120%: healthy, revenue-positive from existing customers
- NRR 80-100%: churning more than expanding, requires volume growth to compensate
- NRR < 80%: significant retention problem

Never compare B2C churn to B2B churn directly. The business models, contract structures, and customer behaviors are different. A 6% monthly churn that is normal for a B2C subscription app would be catastrophic for a B2B SaaS product.

---

## Segment breakdown priority

When diagnosing churn, analyze in this order:

1. Acquisition source (organic vs. paid, channel)
2. Plan type or price tier
3. Cohort (signup month — are newer cohorts churning faster?)
4. Feature usage tier (heavy users vs. low engagement)
5. Geography or customer segment

Aggregate churn rates hide variation. A product with 5% overall monthly churn might have 2% churn from organic signups and 9% churn from a specific paid channel — pointing to an acquisition quality problem, not a product problem.

---

## Mandatory inputs

To produce a defensible analysis:
- Churn event definition: what does "churned" mean? (subscription cancelled, not renewed, inactive for X days, explicitly cancelled)
- Time period with start and end dates
- Active user definition and denominator methodology (users at start of period? average? unique users?)
- At minimum: a churn rate or churn trend over several periods

For richer analysis:
- Cohort retention table (multiple cohorts over multiple months)
- MRR and expansion data for NRR calculation
- Segment breakdown of churn

---

## Invalid-use conditions

Do not draw conclusions from this analysis if:
- The churn definition is inconsistent across the comparison period (e.g., changed from "inactive 30 days" to "subscription cancelled")
- You are comparing monthly churn rates across cohorts of different ages without controlling for cohort maturity (older cohorts naturally have lower churn among surviving users)
- The denominator includes users who were never at risk of churning (e.g., including new users acquired in the same month in the "start of month" count)
- Annual churn is calculated as 12 × monthly_churn (this overstates actual annual loss)
- Comparing B2C churn rates to B2B churn rates without explicit context adjustment
