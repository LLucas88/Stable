# Reference: Run Forecasting Scenarios

## Why this reference exists

This skill is calculation-aware.

Scenario forecasting involves numerical projections tied to explicit assumptions. The value is not in the specific numbers. It's in understanding which assumptions drive the outcome and what the realistic range looks like.

This reference defines:
- required inputs
- calculation approach
- scenario construction rules
- confidence labeling requirements
- invalid-use conditions

---

## Core principle

Forecasts are wrong. The value is in the assumptions, not the number.

A scenario forecast is useful when it:
- Forces the team to state their assumptions explicitly
- Shows the range of realistic outcomes
- Identifies which assumptions drive the most variance

A scenario forecast is useless or harmful when it:
- Presents a single number as certain
- Uses unrealistic ranges (too tight or too extreme)
- Presents an upside scenario as the plan without labeling it as such

---

## Mandatory inputs

- Metric to forecast: revenue, MRR, ARR, user count, GMV (specify one)
- Current baseline value for that metric
- Time horizon
- Key drivers of the metric (growth levers)
- At least rough current trajectory (growing, stable, declining?)

---

## Calculation approach for subscription/recurring revenue

The most common product forecast is MRR or ARR for a subscription business.

Basic monthly MRR model:

```
MRR_month_N = MRR_month_N-1 + New_MRR - Churned_MRR
New_MRR = New customers acquired × ARPU
Churned_MRR = MRR_month_N-1 × Monthly churn rate
```

Run this month by month to build a 12-month projection.

Key inputs per scenario:
- New customer additions per month (base / upside / downside)
- ARPU (may differ by scenario if pricing changes)
- Monthly churn rate (base / upside / downside)

Apply each scenario independently. Do not blend assumptions across scenarios.

---

## Scenario construction rules

### Three scenarios (minimum)
- Base case: current trajectory continues with no major changes. This is the planning scenario.
- Upside: specific things go right; name them explicitly.
- Downside: specific things go wrong; name them explicitly.

### One assumption changes per scenario variation
When running sensitivity, vary one assumption at a time to isolate its effect. This is different from building full scenarios (which may vary multiple assumptions simultaneously); distinguish between the two uses.

### Realistic ranges
Ranges must reflect what could plausibly happen:
- Upside should not require things that have never happened before
- Downside should not assume catastrophic outcomes unless there is specific evidence they could occur
- If the upside assumption has never been tested, label it explicitly as untested

### Label assumptions explicitly
Every scenario output must name the assumptions behind it. "Upside scenario" without stated assumptions is not a scenario. It's a guess.

---

## Duration and compounding

For forecasts beyond 6 months, compounding effects matter.

In a recurring revenue model, early improvements in churn compound significantly over time. An improvement from 4% to 3% monthly churn may look small in month 1 but produces meaningful ARR difference by month 12.

Always show the cumulative end-of-period value, not just monthly increments.

---

## Common errors to avoid

### Anchoring to a single number
Present ranges. "Our plan is $2.8M ARR" is less useful than "base case is $2.8M ARR, downside is $2.1M ARR, and those outcomes hinge on churn staying below 4.5%."

### Presenting the upside as the plan
This is the most common mistake in business planning. If leadership asks to commit to the upside scenario:
- Explain that the upside is conditioned on specific assumptions
- Recommend planning resources for base case and defining triggers for upside investment

### Using optimistic churn assumptions
Churn tends to be underestimated in forecasts. Where possible, use actual cohort data rather than target churn rates. Label churn assumptions as "actual" or "target."

### Ignoring seasonality
Monthly forecasts for B2C businesses often need seasonal adjustments. If the business has meaningful seasonal patterns, model them or flag the periods where the forecast should be interpreted differently.

---

## Sensitivity within forecasting

A good forecast identifies which assumption drives the most variance.

Rule of thumb: calculate the outcome at pessimistic and optimistic values for each key driver, one at a time, while holding others at base. Rank by the size of the resulting outcome swing.

This is a quick form of sensitivity analysis embedded in the forecasting output.

---

## Invalid-use conditions

The forecast is incomplete or unreliable if:
- Metric or time horizon is not specified
- Current baseline is unknown
- Assumptions are unstated or implicit
- A single number is presented as the plan without acknowledging uncertainty
- Upside scenario is presented as a commitment
- Churn is assumed to be 0%

---

## Confidence labeling

All scenario outputs should carry a confidence label:
- High confidence: based on actual historical data and stable conditions
- Medium confidence: based on limited data or extrapolation from partial information
- Low confidence / directional: key assumptions are guesses or have no historical basis

Directional forecasts are acceptable, but must be labeled as such.

---

## Output expectations

A complete scenario forecast output includes:
- Metric and time horizon
- Current baseline
- Scenario table with base / upside / downside and end-of-period projections
- Assumptions per scenario (explicit)
- Sensitivity note: which assumption drives the most variance
- Confidence level
- Planning recommendation (which scenario to plan resources against)
