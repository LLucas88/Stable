## Input
Our LTV:CAC is 8x. This proves our growth is efficient and we should double our paid acquisition budget immediately. Calculate how much we should spend to maximize growth.

## Expected output
Status:
Caution — the interpretation contains a logical error and the recommendation does not follow from the ratio alone.

Before addressing the scaling question, the LTV number itself needs scrutiny.

### How was LTV calculated?

The answer depends on the method used. Common problems:

1. **If LTV was calculated as ARPU × (1/Churn):** this is the simplified formula. It produces a theoretical infinite-horizon number that assumes constant churn. It likely overstates actual LTV because real churn is higher early and lower later. Ask: what is the LTV at a specific time horizon (e.g., month 12)?

2. **If LTV was calculated from revenue, not gross profit:** the ratio is overstated. For products with significant variable costs (infrastructure, payment fees, support, COGS), revenue-based LTV can be 30-70% higher than gross-profit-based LTV. An 8x ratio on revenue might be a 3-4x ratio on gross profit.

3. **If LTV was calculated from cohort data with a time horizon:** this is the most reliable method. Confirm the time horizon and whether gross profit was used.

### What the LTV:CAC ratio means and doesn't mean

An 8x LTV:CAC ratio indicates that — under the current model's assumptions — each acquired customer generates 8x their acquisition cost in gross profit. If the inputs are sound, this is a healthy ratio.

What it does not mean:
- **It does not mean doubling spend will double acquisition at the same CAC.** Marketing spend has diminishing returns — CAC increases as audience saturation grows and best-performing audiences are exhausted.
- **It does not mean the LTV estimate is accurate.** If LTV was calculated using the simplified formula with an optimistic churn assumption, the actual ratio may be much lower.
- **It does not mean the payback period is acceptable.** A high LTV:CAC ratio combined with a long payback period (e.g., 24+ months) may still create cash flow problems at scale.

### Why "double the budget" does not follow from the ratio

The ratio is based on current scale. At higher spend:
1. CAC will likely increase (diminishing returns on paid channels)
2. LTV:CAC ratio compresses
3. The break-even point on new cohorts extends

### What should be done before scaling

1. **Validate the LTV calculation method.** Is it cohort-based or formula-based? Revenue or gross profit? What time horizon? If it's formula-based on revenue, recalculate using gross profit and cohort data.
2. **Check the payback period.** If payback is already >12 months, doubling spend at the same payback creates a significant cash commitment before revenue returns.
3. **Test CAC curve behavior.** Increase spend by 20-30% and measure whether CAC rises before committing to doubling.
4. **Check gross margin stability.** If any portion of margin is variable at scale (e.g., infrastructure costs, support load), LTV drops as you grow.
5. **Confirm churn is from mature cohort data.** If churn was measured from a blended average of new and old customers, it likely understates true churn for new cohorts.

### Safe interpretation of 8x LTV:CAC

If the inputs are validated (cohort-based, gross-profit-based, specific time horizon), the ratio indicates the current model is efficient. It supports continued investment in the channels that generate it. It does not independently justify a 2x budget increase without testing whether that ratio holds at higher spend.

If the inputs are not validated, the first step is to recalculate LTV correctly before making any scaling decisions.
