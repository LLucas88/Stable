## Input
We want to understand the ROI of investing in improving our onboarding. We know it's bad and retention is suffering.

## Expected output
Status:
ROI cannot be calculated without knowing the investment cost and quantifying the expected benefit.

What can be framed now:
The problem is clear: poor onboarding is hurting retention. The question is whether that's a sufficient basis for investment or whether a business case needs to be built.

For ROI framing, three inputs are needed:
1. Investment cost: how much does improving onboarding cost? (engineering time, design time, research cost)
2. Current baseline: what is the current activation or Day-7 retention rate?
3. Expected benefit: what improvement is expected, and what is that worth in business terms?

Benefit quantification framework (to complete once data is available):
The ROI of onboarding improvement flows through retention → LTV.

If activation improves from X% to Y%:
- Additional activated users per month = (Y − X) × monthly signups
- Each additional activated user has LTV = (ARPU × Gross Margin) / Churn Rate
- Monthly incremental gross profit = additional users × LTV (prorated for lifetime, discounted for payback calculation)

Without knowing: (a) current activation rate, (b) cost of the improvement, and (c) ARPU and churn — the ROI number cannot be calculated.

What would a back-of-envelope look like once data is available:
"If we improve Day-30 retention from 18% to 24% for 1,000 new users per month, at $12 ARPU and 70% margin and 4% monthly churn, each extra retained user adds $210 LTV. The improvement generates 60 extra retained users/month × $210 = $12,600/month in incremental LTV. If the investment costs $40,000, payback is ~3 months."

Recommended next inputs:
- Development and design cost estimate for the onboarding improvement
- Current activation or Day-30 retention rate
- ARPU and churn rate (for LTV calculation)
- Expected improvement target (realistic range)

Confidence level:
Provisional
