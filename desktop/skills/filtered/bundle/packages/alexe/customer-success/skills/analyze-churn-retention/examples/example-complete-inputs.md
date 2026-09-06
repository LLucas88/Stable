## Input
B2B SaaS, project management tool, SMB segment (5-50 seats). Monthly subscription, no annual contracts.

Cohort retention table (% of original cohort still active, by months since signup):

| Cohort | Size | M0 | M1 | M2 | M3 | M4 | M5 |
|--------|------|----|----|----|----|----|----|
| Jan | 180 | 100% | 87% | 76% | 69% | 64% | 61% |
| Feb | 195 | 100% | 86% | 75% | 68% | 63% | 60% |
| Mar | 210 | 100% | 85% | 74% | 67% | 62% | - |
| Apr | 225 | 100% | 84% | 72% | 65% | - | - |
| May | 240 | 100% | 82% | 69% | - | - | - |
| Jun | 260 | 100% | 79% | - | - | - | - |

Current MRR data (June 30):
- Starting MRR (June 1): $142,000
- Expansion MRR (upgrades/seat additions): $8,520
- Contraction MRR (downgrades): $2,840
- Churned MRR: $9,940
- Ending MRR (June 30): $137,740

Churn definition: subscription cancelled by customer.
Active user definition: has at least one user login in the month.

## Expected output

Churn baseline and trend:

Monthly churn by cohort at M1 (first-month churn):
```
Jan: 1 - 87% = 13%
Feb: 1 - 86% = 14%
Mar: 1 - 85% = 15%
Apr: 1 - 84% = 16%
May: 1 - 82% = 18%
Jun: 1 - 79% = 21%
```

First-month churn is worsening across cohorts: from 13% in January to 21% in June. This is a consistent trend, not a single-month anomaly.

Cohort survival curve analysis:

Jan and Feb cohorts are approaching plateau at M5: 61% and 60% retention. The decay has slowed from M3 onward, suggesting a stable retained core forms around month 3.

The M1 retention step is the largest single drop in all cohorts (13-21% of users churn in month 1). This is the highest-leverage drop-off point.

Later cohorts are underperforming earlier cohorts at comparable months:
```
At M2: Jan = 76%, May = 69% (-7pp), Jun (projected) likely worse
At M3: Jan = 69%, Apr = 65% (-4pp), May = not yet available
```

The worsening trend is consistent and accelerating.

NRR calculation (June):

```
NRR = (142,000 + 8,520 - 2,840 - 9,940) / 142,000
NRR = 137,740 / 142,000 = 97%
```

NRR at 97% means the existing customer base is slightly contracting in revenue. For B2B SaaS, the typical healthy range is 100-120%. At 97%, the product is net-churning revenue from existing customers, which means growth requires new customer acquisition to compensate.

Segment breakdown request:

To diagnose why first-month churn is worsening across cohorts, the following segments should be broken out:
- Acquisition source (did the Jun-Jul cohort come from a different paid channel?)
- Company size (are 5-seat accounts churning faster than 20+ seat accounts?)
- Feature adoption in first 14 days (do users who complete key actions in week 1 retain better?)

Actionable findings:

1. First-month churn is the primary problem and it's getting worse. Six consecutive cohorts show increasing M1 churn. This is not noise. Either acquisition quality is declining (lower-fit customers entering the funnel) or the first-month product experience is degrading.

2. The survival plateau (~60-61% at M5) suggests a healthy retained core exists. The product works for users who stay past month 3. The problem is getting users there.

3. NRR at 97% is below the healthy threshold. Expansion is real ($8,520) but insufficient to offset churn ($9,940). Improving retention by 2-3 percentage points per month would flip NRR positive.

Root cause categorization:

Without segment data:
- Acquisition quality change (most likely given consistent worsening across cohorts): if later cohorts contain more low-fit customers, M1 churn increases automatically
- First-month product experience issue: a change in onboarding, initial feature experience, or support availability affecting newer signups
- Pricing or expectation mismatch surfacing early: customers not finding the value they expected in the first 30 days

Recommended next steps:
1. Break Jun cohort churn by acquisition source — compare organic vs. paid, by channel
2. Analyze feature adoption in first 14 days for churned vs. retained users in May/Jun cohorts
3. Pull exit survey data (if available) for M1 churns in Apr-Jun
4. Run user interviews with customers who churned in their first 30 days from a recent cohort
