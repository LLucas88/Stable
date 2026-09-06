## Input
We have a business case for a new premium tier. Base case outcome: $480,000 incremental ARR in year 1.
Key assumptions:
1. Upgrade rate from existing free users: 8% (range: 5%–12%)
2. Eligible free user base: 15,000 (range: 13,000–16,000; this is a confirmed data point, low variance)
3. Average upgrade price: $40/year (range: $35–$45; we're testing pricing)
4. Churn on new premium tier: 18% annual (range: 12%–28%; high uncertainty, no prior data)
5. Gross margin on premium tier: 74% (range: 70%–78%; relatively stable)

Decision threshold: the investment ($120k in development) is only worth making if year-1 incremental ARR exceeds $300,000.

## Expected output
Assumption inventory with ranges:

| Assumption | Pessimistic | Base | Optimistic | Confidence |
|---|---|---|---|---|
| Upgrade rate | 5% | 8% | 12% | Medium (no prior data) |
| Eligible free users | 13,000 | 15,000 | 16,000 | High (confirmed data) |
| Average upgrade price | $35 | $40 | $45 | Medium (testing) |
| Annual churn on premium | 28% | 18% | 12% | Low (no prior data) |
| Gross margin | 70% | 74% | 78% | High (cost structure known) |

Impact on year-1 incremental ARR per assumption (one at a time, others held at base):

Year-1 ARR base: 15,000 × 8% × $40 × (1 − 18% churn) ≈ 15,000 × 0.08 × $40 × 0.82 = $39,360 (note: this is net of churn in year 1; if ARR is measured at acquisition without churn deduction, base ARR = 15,000 × 0.08 × $40 = $48,000)

Using acquisition ARR as the base ($48,000 × 10 months average revenue recognition ≈ simplified; let's use full-year ARR basis for sensitivity):

Full conversion calculation (all converting at start of year):
Base ARR = 15,000 × 0.08 × $40 = $48,000...

This does not match the $480,000 stated in the input. Likely the eligible base is 150,000 users, not 15,000. Recalculating with 150,000 eligible users:
Base ARR = 150,000 × 0.08 × $40 = $480,000. This is consistent.

Corrected assumption: eligible free user base is 150,000.

| Assumption varied | Pessimistic outcome | Base outcome | Optimistic outcome | Swing (pessimistic to optimistic) |
|---|---|---|---|---|
| Upgrade rate (5%→8%→12%) | $300,000 | $480,000 | $720,000 | $420,000 |
| Eligible users (130k→150k→160k) | $416,000 | $480,000 | $512,000 | $96,000 |
| Upgrade price ($35→$40→$45) | $420,000 | $480,000 | $540,000 | $120,000 |
| Churn impact on year-1 revenue | Minor for year 1 (churned customers still paid) | — | — | Low in year 1 |
| Gross margin | Affects profit, not revenue | — | — | $48,000 gross profit swing |

Sensitivity ranking (highest to lowest impact on year-1 ARR):
1. Upgrade rate: largest impact. Moving from 5% to 12% swings ARR by $420,000. This is the assumption with both the highest impact and medium confidence.
2. Upgrade price: $120,000 swing across the price range. Medium confidence (being tested).
3. Eligible user count: $96,000 swing, but high confidence — this is a confirmed data point.
4. Annual churn: minimal year-1 ARR impact (customers who churn still paid for part of the year). Significant for year-2+ projections.
5. Gross margin: affects profit, not revenue. $48,000 gross profit swing at the extremes.

Worst realistic case analysis:
5% upgrade rate, 150,000 users, $35 price = $262,500 ARR. This is below the $300,000 decision threshold.

Decision threshold check:
At base case ($480,000), the investment clearly clears the $300,000 threshold with significant margin.
At worst realistic upgrade rate (5%), year-1 ARR is $262,500 — below threshold. The decision is upgrade-rate-sensitive.

If upgrade rate falls below ~6.25%, year-1 ARR drops below $300,000 (6.25% × 150,000 × $40 = $375,000 — still above threshold; the actual threshold crossover is at 5% × $40 × 150,000 = $300,000 exactly).

Validation priority recommendations:
1. Upgrade rate is the most critical assumption to validate before committing to the investment. Recommended approach: run a soft launch to a 10% sample of free users (15,000 users) with the premium offer. Measure actual upgrade rate over 30-60 days before full rollout.
2. Upgrade price: complete the pricing test — this has a real impact on both conversion rate and ARR per converter.
3. Annual churn on premium tier: critical for year-2+ projections and LTV:CAC. Monitor closely in first 6 months post-launch.
