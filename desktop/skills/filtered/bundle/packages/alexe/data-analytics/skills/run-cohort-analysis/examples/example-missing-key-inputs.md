## Input
We want to run a cohort analysis on our users to understand retention.

## Expected output

Status:
Cannot start cohort analysis. Required inputs are missing.

To build a cohort table and produce any interpretation, three things must be defined before touching the data:

**1. Cohort definition event**

What event assigns a user to a cohort? Options include:
- First signup date (most common)
- First purchase date
- First feature activation
- Acquisition channel and signup date combined

Without a cohort definition, users cannot be grouped into rows. Every cohort means something different.

**2. Metric or action that defines "active"**

What does a user have to do to count as retained in period N? Options include:
- Log in at least once
- Complete a core action (post, purchase, check-in, etc.)
- Generate revenue
- Use a specific feature

The retention rate for the same users can differ dramatically depending on this definition. A user who logs in counts as retained under a login metric but may not count under a "completed core action" metric.

**3. Time range and granularity**

How far back should cohorts go? Weekly or monthly grouping? How many periods to show?

For a first cohort analysis: 6-12 cohorts (enough to see trend direction) with 4-6 periods per cohort (enough to see decay shape) is a reasonable starting point.

What the analysis can produce once these are defined:

With cohort definition, metric, and time range:
- A complete cohort retention table with calculated rates per cell
- Curve shape analysis (fast decay, plateau, improving trend)
- Cohort-to-cohort comparison identifying improvement or regression
- Event annotations if product changes occurred in the window
- 2-3 specific insights

Recommended next inputs:
1. What event defines when a user "joins" a cohort?
2. What action must they take to count as retained?
3. What time range should the analysis cover, and should cohorts be weekly or monthly?
