## Input
B2C subscription app, monthly plan.

We have cohort data for users acquired in January (10,000 users):

| Month | Active users | Cohort gross profit | Cumulative GP | LTV (per user) |
|-------|-------------|-------------------|---------------|----------------|
| 0     | 10,000      | $93,500           | $93,500       | $9.35          |
| 1     | 7,800       | $72,900           | $166,400      | $16.64         |
| 2     | 6,400       | $59,800           | $226,200      | $22.62         |
| 3     | 5,600       | $52,300           | $278,500      | $27.85         |
| 6     | 4,100       | $38,300           | $475,800      | $47.58         |
| 12    | 2,900       | $27,100           | $786,200      | $78.62         |

Average revenue per user per month (for active users): $12.99
Gross margin: 72%
CAC (blended): $38
CAC breakdown: Meta Ads $52, organic/referral $14

## Expected output

### LTV calculation (cohort method)

Using cohort data for January acquisition cohort (10,000 users):

LTV month 6 = $47.58 per user
LTV month 12 = $78.62 per user

The LTV curve is still growing at month 12 — retained users continue to generate gross profit. The rate of growth is slowing as expected (fewer active users each month).

Note: early churn is high (22% in month 1), then stabilizes. By month 6, monthly churn among remaining users is around 5-6%. This non-constant churn pattern is why the cohort method is more accurate than the simplified formula for this product.

### Simplified formula cross-check

For comparison, using the simplified formula with average monthly churn of 4.3% (blended across the cohort):
- LTV ≈ ($12.99 × 0.72) / 0.043 ≈ $217

This number represents theoretical infinite-horizon LTV under constant churn. It is not directly comparable to the cohort LTV month 12 of $78.62, which is a 12-month figure. The formula estimate suggests the cohort will eventually generate ~$217 per user if the current churn rate holds indefinitely — but the constant churn assumption is approximate, and the "eventually" time horizon is not specified. The cohort method gives the concrete answer: $78.62 by month 12.

### CAC
Blended CAC: $38
By channel: Meta Ads $52, organic/referral $14

### LTV:CAC ratio (using LTV month 12)
Blended: $78.62 / $38 = 2.1x
Meta Ads: $78.62 / $52 = 1.5x
Organic/referral: $78.62 / $14 = 5.6x

### Payback period
From the cohort LTV curve, cumulative LTV crosses $38 (blended CAC) between month 3 and month 6. Interpolating: payback is approximately 4 months.

For Meta Ads ($52 CAC): payback is approximately 5-6 months.
For organic/referral ($14 CAC): payback is approximately 1-2 months.

### Benchmark comparison
2.1x blended LTV:CAC at month 12 is below the 3x threshold. However, the LTV curve is still growing — users retained past month 12 will continue to generate value.

Projected LTV month 24 (if month 6-12 churn rates hold): approximately $110-120, which would put blended ratio at ~3x.

4-month payback is strong (benchmark: <12 months is healthy for B2C subscription). The business recoups CAC quickly, which is positive even though the 12-month ratio is below 3x.

Meta Ads at 1.5x month-12 ratio is concerning — this channel needs longer retention to justify the spend.

### Ratio interpretation
Mixed. Payback period is healthy (4 months), but 12-month LTV:CAC is below the 3x benchmark. The business is not in immediate danger — it recovers CAC quickly — but the Meta Ads channel is marginal. The key question is whether users retained at month 12 continue generating value long enough to reach a sustainable ratio.

### Top improvement levers with estimated impact
1. **Reduce early churn (month 0-1).** 22% of users leave in the first month. If onboarding improvements reduce month-1 churn from 22% to 15%, more users survive to generate long-term value. This is typically the highest-leverage intervention.
2. **Grow organic/referral as share of new users.** Organic CAC ($14) is 3.7x lower than Meta ($52). Increasing organic share directly improves blended CAC without affecting LTV.
3. **Reduce Meta CAC from $52 to $42** through creative optimization or audience refinement. This would improve the Meta channel ratio from 1.5x to 1.9x at month 12.
4. **Increase ARPU** through pricing or upsell. A $1 ARPU increase improves monthly gross profit per active user by $0.72, compounding across the LTV curve.

### Sensitivity
Churn is the most impactful lever. A 1-point improvement in monthly churn rate among retained users (e.g., month 3+ churn from 6% to 5%) compounds across all future months, materially increasing LTV month 12 and beyond.

### Inputs used
- Cohort: January, 10,000 users
- Per-user ARPU: $12.99/month (for active users)
- Gross margin: 72%
- Blended CAC: $38

### Assumptions
- Gross margin is stable across cohorts and over time
- No expansion revenue included (single plan, no upsell)
- CAC is measured for the same period as the cohort
