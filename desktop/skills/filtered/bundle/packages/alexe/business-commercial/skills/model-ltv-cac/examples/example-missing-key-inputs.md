## Input
We want to understand our LTV:CAC. We're a SaaS product. Average contract value is $480/year. We spend about $120k/month on sales and marketing and acquire around 200 new customers per month.

## Expected output
Status:
Partial inputs — LTV:CAC ratio cannot be calculated without gross margin and either cohort data or churn rate.

What can be calculated now:
CAC = Total S&M Spend / New Customers Acquired
CAC = $120,000 / 200 = $600

Annual contract value per customer: $480/year

What is missing for LTV:

1. **Gross margin**: required to calculate gross profit per customer. LTV uses gross profit, not revenue. Without margin, LTV is overstated. Revenue-based LTV can lead to scaling campaigns that actually generate losses.

2. **Cohort data or churn rate**: the preferred approach is cohort-level gross profit data over time — this shows the actual LTV curve without assumptions. If cohort data is not available, a churn rate can be used with the simplified formula for a rough estimate, but this assumes constant churn (which rarely holds).

Rough LTV scenarios using the simplified formula (illustrative, not a substitute for real data):

Assuming 70% gross margin and varying annual churn:
- 10% annual churn: LTV ≈ ($480 × 0.70) / 0.10 = $3,360. LTV:CAC = 5.6x
- 15% annual churn: LTV ≈ $336 / 0.15 = $2,240. LTV:CAC = 3.7x
- 25% annual churn: LTV ≈ $336 / 0.25 = $1,344. LTV:CAC = 2.2x (marginal)

These are theoretical infinite-horizon estimates, not time-bounded LTV. The actual LTV at year 1 will be lower — approximately equal to one year of gross profit per user ($336 at 70% margin), minus the value lost to mid-year churn. The simplified formula projects total value over the entire customer relationship.

The 15% annual churn scenario produces a ratio that is borderline (3.7x). At 25% churn, the model is marginal.

Payback period (without churn dependency):
Payback = CAC / (ACV × Gross Margin assumption)
At 70% gross margin: $600 / ($480 × 0.70) = $600 / $336 = 1.8 years (21 months).

This is high for a SaaS business — benchmark is 12-18 months. This payback means the company needs customers to stay for almost 2 years just to recover acquisition costs, before generating any profit. Strong churn control is critical.

What must be provided to complete the analysis:
1. **Gross margin percentage** (revenue minus cost of goods sold / service delivery costs)
2. **Cohort-level data** (preferred): for each acquisition cohort, gross profit generated per month since acquisition. This enables the cohort LTV method.
3. **If cohort data is not available**: annual or monthly customer churn rate (for the simplified formula). Ideally measured from mature cohorts, not a blended average across all customers.

Recommended next step:
If the team has access to billing and cost data by cohort, build a cohort LTV curve — this will give the most accurate picture. If not, start by providing gross margin and churn rate for a simplified estimate, and plan to build cohort tracking.
