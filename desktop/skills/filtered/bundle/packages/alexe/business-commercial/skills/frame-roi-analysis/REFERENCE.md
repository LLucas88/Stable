# Reference: Frame ROI Analysis

## Why this reference exists

This skill is calculation-aware.

ROI analysis involves numerical calculations (return, cost, payback period). But the value of ROI framing is not just arithmetic. It's in clearly tracing the benefit to a measurable business outcome and honestly representing the range of uncertainty.

This reference defines:
- required inputs
- core formulas
- benefit quantification logic
- invalid-use conditions
- behavioral rules under weak inputs

---

## Core principle

ROI analysis must be traceable.

A claim that an investment "generates $X in value" is only meaningful if X is derived from a business metric that the investment demonstrably affects.

"Makes users happier" is not an ROI source.
"Increases Day-30 retention from 18% to 22%, generating 80 more retained users per month at $210 LTV each" is an ROI source.

If the benefit cannot be traced to a business metric, the ROI cannot be calculated honestly.

---

## Mandatory inputs

- Investment description and cost (time, money, opportunity cost)
- Expected business outcome (what specific metric will this improve?)
- Baseline value of that metric (what is the current state?)
- Expected improvement (what change does the investment produce?)

Optional but recommended:
- Timeline to value (when does the benefit start accruing?)
- Risk factors that could reduce return
- Opportunity cost (what won't be built instead?)

---

## Core formulas

### Simple ROI

```
ROI = (Return − Cost) / Cost
```

Where:
- Return = total benefit from the investment over the analysis period
- Cost = total investment cost (one-time + ongoing over the same period)

Example: investment costs $50,000. Expected annual benefit = $75,000/year.
Year-1 ROI = ($75,000 − $50,000) / $50,000 = 50%

### Payback period

```
Payback Period = Investment Cost / Benefit per Period
```

Example: investment costs $50,000. Monthly benefit = $6,250/month.
Payback = $50,000 / $6,250 = 8 months

### Benefit quantification for subscription products

The most common benefit source in product investments is retention improvement.

```
Monthly incremental gross profit = Additional retained users × LTV
```

Where:
```
LTV = (ARPU × Gross Margin) / Churn Rate
```

Example:
- Retention improvement: +3pp per month (from 18% to 21% Day-30 retention)
- Monthly new users: 800
- Additional retained users: 800 × 0.03 = 24 per month
- LTV per user: ($12 × 0.72) / 0.05 = $172.80
- Monthly incremental benefit: 24 × $172.80 = $4,147/month
- Annual: $49,766

---

## Benefit types and how to quantify them

### Revenue increase
- Conversion improvement: additional conversions × average revenue per conversion
- Retention improvement: additional retained users × LTV
- Expansion/upsell: additional accounts upgrading × price differential

### Cost reduction
- Support cost: tickets avoided × average handling cost
- Manual process automation: hours saved × fully-loaded labor cost
- Infrastructure efficiency: cost per unit reduction × volume

### Risk avoidance
- Churn risk prevention: at-risk accounts retained × average contract value
- Regulatory fine avoidance: probability × expected fine (if relevant)

### Strategic value
- Sometimes an investment has strategic value that can't be directly quantified (entering a new market, building capability). In these cases, label it explicitly as strategic and separate it from the financial ROI calculation.

---

## Range construction

Always build 3 scenarios: conservative, base, optimistic.

Conservative: the benefit materializes at the low end of the realistic range, and the cost comes in at the high end.
Base: the benefit materializes at the expected level.
Optimistic: the benefit materializes at the high end of the realistic range.

For each scenario, calculate:
- Total benefit over the analysis period
- Total cost
- ROI
- Payback period

---

## Opportunity cost

A complete ROI analysis acknowledges what is not being built.

If the team has limited capacity, choosing to build investment A means not building investment B. The foregone value of investment B is the opportunity cost of A.

This is often omitted but is a real cost.

Minimum treatment: "Investment B is the next-best alternative. If its estimated annual value is $X, that is the opportunity cost of choosing A."

---

## Invalid-use conditions

The ROI analysis is incomplete or misleading if:
- Benefit is not traceable to a specific metric change
- Cost excludes significant inputs (opportunity cost, ongoing costs)
- A range is not provided (single-point estimates for uncertain benefits are false precision)
- Upside scenario is presented as base case
- Zero churn or 100% adoption is used to calculate benefit

---

## Output expectations

A complete ROI analysis includes:
- Investment definition and total cost
- Expected benefit traced to a specific metric improvement
- ROI calculation for conservative / base / optimistic
- Payback period
- Key assumptions explicitly stated
- Top uncertainties and how to reduce them
- Recommendation: invest / conditional / don't invest
- What would need to be true for the recommendation to change

---

## Relationship to adjacent skills

Frame ROI is typically input to:
- build-business-case (ROI is one section of a broader business case)
- prioritize-strategic-bets (comparing ROI across multiple options)

It comes after:
- Problem definition and opportunity sizing
- Baseline metric measurement
