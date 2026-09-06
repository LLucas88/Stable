## Input
We have a churn problem. Can you analyze it?

## Expected output

Status:
Cannot analyze churn without data. Required inputs are missing.

To produce any meaningful churn analysis, the following are needed:

**1. Churn event definition**

What does "churned" mean in this product? The definition determines everything downstream. Common options:
- Subscription cancelled (explicit action)
- Not renewed (contract not renewed at end of term)
- Inactive for X days (no login or action)
- Payment failed and not recovered

Different definitions produce different churn rates from the same user base. Without a clear definition, no calculation is possible and results cannot be compared across time periods.

**2. Churn rate or trend data**

What is the current churn rate? What was it 3, 6, 12 months ago? Even a simple time series of monthly rates is enough to establish whether churn is improving, stable, or worsening.

Minimum useful input: 3-6 months of monthly churn rates with cohort sizes or user counts.

**3. Active user definition and denominator**

Monthly churn = churned users / active users at start of month. What counts as "active at start of month"? If this isn't defined, the denominator is ambiguous and rates calculated at different points in time won't be comparable.

**4. Product type and customer segment**

Churn benchmarks and root causes differ significantly between B2C and B2B, between subscription and usage-based, between SMB and enterprise. Without this context, any benchmark comparison is meaningless.

What analysis would be possible with complete inputs:

With churn rate time series and definitions:
- Trend direction: improving, stable, worsening
- Monthly and annual churn calculation
- Comparison to relevant benchmarks

With a cohort retention table (multiple cohorts over multiple months):
- Survival curve analysis: where does the stable retained core form?
- Cohort-to-cohort comparison: are newer cohorts retaining better or worse?
- Identification of the highest-churn period (M1? M3? after a specific product event?)

With MRR data:
- NRR calculation to determine if expansion offsets churn
- Revenue-weighted churn rate

With segment breakdowns:
- Isolation of which segments are driving churn (acquisition source, plan type, feature usage tier)
- Targeted intervention design per segment

Recommended next inputs:
1. Churn event definition
2. Monthly churn rates for the last 6 months with cohort sizes
3. Product type (B2C/B2B) and customer segment description
4. Any segment data available (churn by acquisition source, plan, tenure)
