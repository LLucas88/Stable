## Input
Metric to forecast: Monthly Recurring Revenue (MRR)
Time horizon: 12 months (through end of 2026)
Current baseline: $180,000 MRR (January 2026)
New customer additions: ~120/month at current pace
Average revenue per new customer: $85/month
Monthly churn: 3.2% of MRR
Key drivers to vary: new customer volume, churn rate
Context: considering a $25k/month marketing investment that the team believes could add 40-60 more customers per month

## Expected output
Metric and time horizon:
MRR forecast through December 2026 (12 months)

Baseline:
$180,000 MRR, January 2026. 120 new customers/month at $85 ARPU. 3.2% monthly MRR churn. Implied current customer base: ~$180,000 / $85 ≈ 2,118 customers.

Key assumptions per scenario:
Base case: 120 new customers/month, 3.2% churn, no change to ARPU
Upside: 175 new customers/month (reflecting +40k marketing investment working well), 2.8% churn (slight improvement from better customer fit)
Downside: 90 new customers/month (acquisition falls), 4.0% churn (market softens)

Scenario projections (simplified compound model):

New MRR added per month = New customers × $85
Churned MRR = Current MRR × churn rate
Net MRR change = New MRR − Churned MRR

Base case trajectory:
- Month 1: MRR $180k + (120 × $85) − ($180k × 3.2%) = $180k + $10.2k − $5.76k = $184.4k
- Month 6: approximately $203k
- Month 12: approximately $222k
End of year estimate: ~$222,000 MRR (+23% from baseline)

Upside trajectory:
- Month 1: $180k + (175 × $85) − ($180k × 2.8%) = $180k + $14.9k − $5.04k = $189.9k
- Month 12: approximately $262,000 MRR (+46% from baseline)

Downside trajectory:
- Month 1: $180k + (90 × $85) − ($180k × 4.0%) = $180k + $7.65k − $7.2k = $180.5k (near flat)
- Month 12: approximately $188,000 MRR (+4% from baseline, essentially flat after churn and growth offset)

Scenario summary table:

| Scenario | Key assumptions | End-of-year MRR | Change |
|---|---|---|---|
| Base | 120 new/month, 3.2% churn | ~$222k | +23% |
| Upside | 175 new/month, 2.8% churn | ~$262k | +46% |
| Downside | 90 new/month, 4.0% churn | ~$188k | +4% |

Sensitivity analysis — which assumptions drive the most variance:
1. Churn rate: the difference between 2.8% and 4.0% churn alone accounts for ~$40k of MRR variance by month 12, even holding new customer volume constant. Churn is the highest-sensitivity input.
2. New customer volume: moving from 120 to 175 new customers/month adds ~$15k MRR/month on top of the churn impact. At 12 months, this compounds to ~$25-30k incremental MRR.

The marketing investment question: the $25k/month investment adds $25k in cost. In the upside scenario, the MRR gain is ~$40k/month by month 12 vs. base case. The incremental gross margin at 70% is $28k/month. Break-even from the investment: approximately month 8-9 under the upside scenario, not reached under the downside scenario.

Planning recommendation:
Plan for base case ($222k end of year). The downside scenario (+4%) is a near-stagnation outcome if churn rises while acquisition slows — worth stress-testing the business plan against it. The marketing investment is justified under base-to-upside assumptions, but requires monitoring churn closely — if churn rises above 3.5% in the first 3 months, revisit the investment.

Confidence level:
Medium. The model is mechanically sound given the inputs. The key uncertainty is whether new customer volume and churn rate assumptions will hold as the business scales. Churn is historically the most volatile input.
