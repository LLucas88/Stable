# Reference: Model LTV:CAC

## Why this reference exists

This skill is calculation-aware.

Its job is not to produce plausible-sounding unit economics numbers.
Its job is to calculate and interpret the LTV:CAC ratio from real inputs, and to flag when inputs are missing, assumptions are weak, or conclusions drawn from the ratio don't follow.

This reference defines:
- required inputs
- calculation methods (cohort-based and simplified)
- interpretation rules
- benchmarks
- invalid-use conditions
- behavioral rules under missing or misused inputs

---

## Core principle

LTV is the cumulative gross profit an average user generates over a defined period after starting to use the product.

LTV must be:
- based on **gross profit**, not revenue
- calculated using **cohort analysis** as the primary method
- measured **over a specific time horizon** (e.g., LTV month 6, LTV month 12) — not as an infinite theoretical lifetime

The formula `LTV = (ARPU × Gross Margin) / Churn Rate` is a simplified estimate for subscription models under strong assumptions. It is not the primary method. See the "Simplified formula" section below for when it can and cannot be used.

---

## Mandatory inputs

For cohort-based LTV (primary method):
- A defined user cohort (by acquisition date, channel, segment, etc.)
- Per-user or per-cohort gross profit data over time (daily, weekly, or monthly)
- Cohort size (number of users at cohort start)

For CAC calculation:
- Total sales and marketing spend in a period
- Number of new customers acquired in the same period

Additional useful inputs:
- CAC by channel (blended CAC hides channel-level economics)
- LTV by customer segment or cohort (blended LTV hides segment variance)
- Revenue and COGS breakdown for gross margin calculation

---

## How to calculate LTV: cohort method (primary)

This is the correct general method. It works for any business model — subscriptions, transactions, marketplaces, games, e-commerce.

### Step by step

1. **Define the cohort.** A cohort is a group of users who started using the product in the same period (e.g., all users who signed up in January 2025).

2. **Calculate gross profit per user per period.** For each user in the cohort, calculate the gross profit they generated in each period (day, week, or month) since they joined. Gross profit = revenue minus variable costs (COGS) for that user.

3. **Calculate gross profit for the entire cohort per period.** Sum the gross profit across all users in the cohort for each period since cohort start. Users who left contribute $0 in subsequent periods — this is automatically captured.

4. **Calculate cumulative gross profit.** For each period N, sum the gross profit from period 0 through period N. This gives you the total gross profit the cohort has generated up to that point.

5. **Divide by cohort size.** Divide the cumulative gross profit by the number of users in the cohort (at cohort start, not at the current period). This gives you the LTV at period N.

### What you get

An LTV curve — LTV by day 0, day 1, day 2, ... or by month 0, month 1, month 2, etc.

```
Example (monthly cohort of 1,000 users):

Month | Cohort gross profit | Cumulative GP | LTV (per user)
  0   |       $8,200        |     $8,200    |    $8.20
  1   |       $5,400        |    $13,600    |   $13.60
  2   |       $4,100        |    $17,700    |   $17.70
  3   |       $3,500        |    $21,200    |   $21.20
  6   |       $2,100        |    $34,800    |   $34.80
 12   |       $1,200        |    $52,600    |   $52.60
```

LTV month 12 = $52.60 per user. This is the actual LTV for this cohort over 12 months.

### Why this works

- Users who churn contribute $0 in later periods — churn is captured automatically without needing a separate churn rate input
- No assumption of constant churn needed
- No "lifetime" calculation needed
- Works for any monetization model, not just subscriptions
- Produces LTV at specific time horizons, which is what business decisions actually need

---

## LTV time horizons

LTV should always be stated with a time horizon. "Our LTV is $217" is incomplete. "Our LTV month 12 is $217" is useful.

The choice of horizon depends on the business question:
- **Marketing ROI**: use the horizon matching the expected payback period (e.g., LTV month 6 if the team expects to recoup CAC in 6 months)
- **Annual planning**: LTV month 12 or LTV year 1
- **Long-term unit economics**: LTV month 24 or LTV month 36, but note that longer horizons require more data and are less reliable as forecasts

---

## Predicting LTV from early data

A marketing team that expects to recoup CAC in 12 months cannot wait 12 months to decide whether an ad campaign is profitable.

### Practical approaches

**Heuristic rules (most common):**
Based on historical cohort data, the team establishes benchmarks for what LTV should be at early time points (day 1, day 3, day 7) for the campaign to be on track for the 12-month target. If a new cohort is below benchmark at day 7, the campaign is cut. If it matches or exceeds, the campaign continues.

**Extrapolation from curves:**
Using historical cohort LTV curves as templates, project a new cohort's LTV by fitting early data points to the known curve shape. This is more precise than single-point heuristics but requires stable cohort behavior.

**Predictive models:**
As budgets grow, teams invest in models that predict LTV based on early user behavior signals — segments, geographies, platforms, early engagement patterns. These models are continuously refined as more data arrives.

### Key principle

All LTV forecasts are estimates. State the method, the data behind it, and the confidence level. Never present a forecast as an actual LTV.

---

## Simplified formula for subscription models

For subscription businesses with stable churn, a simplified formula can provide a rough LTV estimate:

```
LTV ≈ (ARPU × Gross Margin) / Churn Rate
```

Where:
- ARPU = average revenue per customer per period (monthly or annual)
- Gross Margin = (Revenue - COGS) / Revenue, as a decimal
- Churn Rate = fraction of customers lost per period (same time unit as ARPU)

### What this formula actually is

This formula is equivalent to `Gross Profit per Period × (1 / Churn Rate)`, where `1 / Churn Rate` is a theoretical average lifetime under constant churn.

It models a geometric decay: if 5% of remaining customers leave each month, the average customer stays for 1/0.05 = 20 months, and generates 20 × monthly gross profit.

### When this formula is acceptable

- Subscription model with recurring payments
- Churn rate is measured from mature cohort data (not from a mix of new and old users)
- Churn has been reasonably stable for 6+ months
- The result is treated as an estimate, not a precise number
- Time units are consistent (monthly ARPU with monthly churn, or annual with annual)

### When this formula should NOT be used

- **Non-subscription models** (e-commerce, marketplaces, games, ad-supported): there is no clean "churn" event. Use cohort method only.
- **New products without stable churn data**: the churn rate is unreliable. Use cohort method or scenario ranges.
- **Products with high early churn that stabilizes**: the simple average churn overstates lifetime churn. Real products typically have high early churn and lower late churn (surviving cohorts are self-selected). The formula will underestimate LTV for retained users and overestimate it for the full cohort.
- **Growing companies where churn rate is measured as total churned / total customers**: this simple average is distorted by the large share of new customers who churn faster than mature ones.

### Example (monthly, subscription)

- ARPU: $15/month
- Gross margin: 68%
- Monthly churn: 3.5% (measured from 6+ month cohorts)
- LTV ≈ ($15 × 0.68) / 0.035 = $10.20 / 0.035 ≈ $291

This means: under constant 3.5% monthly churn assumption, the average subscriber generates approximately $291 in gross profit. In practice, compare this against actual cohort LTV curves to validate.

### Example (annual, subscription)

- Annual contract value: $480
- Gross margin: 75%
- Annual churn: 18%
- LTV ≈ ($480 × 0.75) / 0.18 = $360 / 0.18 = $2,000

Note: Do not convert annual churn to monthly by dividing by 12. That gives 1.5%, which is wrong (correct monthly churn from 18% annual is `1 - (1 - 0.18)^(1/12) ≈ 1.64%`). When using monthly ARPU, convert using the compound formula. When using annual ARPU, use annual churn directly.

---

## CAC formula

```
CAC = Total Sales and Marketing Spend / New Customers Acquired
```

Do not exclude:
- Salaries for sales, marketing, and customer success (if CS is involved in acquisition)
- Agency fees and contractor costs
- Marketing tooling costs attributable to acquisition

Commonly mis-excluded costs that understate CAC:
- Salesperson base salaries (not just commissions)
- Content or SEO investment
- Trial/demo support costs

---

## LTV:CAC ratio

```
LTV:CAC ratio = LTV / CAC
```

When using the ratio, always specify which LTV is being used:
- "LTV month 12 : CAC = 3.2x" — clear
- "LTV:CAC = 3.2x" without specifying the LTV horizon — incomplete

Benchmark interpretation:
- Below 1x: acquiring customers costs more than their gross profit contribution. Unsustainable.
- 1x–2x: marginal. Business is barely recovering CAC, limited growth capital.
- 3x: commonly cited minimum threshold for sustainable growth investment
- 3x–5x: healthy
- 5x–10x: strong
- Above 10x: strong unit economics but may indicate underinvestment in growth; worth testing higher spend before concluding the model is perfectly efficient

A ratio above 10x combined with slow growth warrants checking whether the team is leaving growth on the table.

---

## Payback period

```
Payback period = CAC / (ARPU × Gross Margin)
```

This is the number of periods (months or years) required to recover the CAC from gross profit.

Alternative (more precise): find the time point on the cohort LTV curve where cumulative LTV equals CAC. This accounts for non-constant churn and variable ARPU.

Benchmark interpretation:
- Under 12 months: strong for B2C subscription
- 12–18 months: acceptable for B2B SaaS with low churn
- 18–24 months: workable if churn is low and NRR > 100%
- Over 24 months: creates significant cash flow risk at scale; growth is cash-intensive

---

## Gross margin considerations

LTV must use gross margin, not revenue.

Gross margin = (Revenue - Cost of Goods Sold) / Revenue

Simple rule for what counts as COGS: if the cost increases linearly with sales and revenue, it must be deducted. If the cost does not increase as sales grow, it is a fixed cost and should not be deducted.

Examples:
- **Deduct** (variable costs / COGS): app store commissions, payment processing fees, cloud infrastructure per customer, shipping costs, support team costs tied to serving customers, third-party API costs per usage
- **Do not deduct** (fixed costs): development team salaries, office rent, R&D investment

Commonly missed costs that reduce gross margin:
- Cloud infrastructure costs per customer
- Payment processing fees (2.5–3% for consumer, higher for international)
- Customer support costs directly tied to serving customers (not just acquisition)
- Third-party API costs per usage

If gross margin is unknown, the LTV calculation is incomplete. Do not substitute 100% margin as a simplification.

---

## Channel-level CAC

Blended CAC hides channel economics.

If CAC by channel is available:
- Calculate LTV:CAC ratio per channel
- Identify channels below 3x (potential budget reallocation)
- Identify channels above 8x (potential underinvestment)

If CAC by channel is not available, flag this as a gap. Blended CAC can mask a situation where paid acquisition is destroying value while organic acquisition inflates the average.

---

## Churn considerations (for the simplified formula)

Churn is the most sensitive input in the simplified LTV formula.

### Monthly vs. annual churn
Always use consistent time units. Monthly and annual churn cannot be mixed without conversion.

Conversion formulas:
```
Annual churn ≈ 1 - (1 - Monthly churn)^12
Monthly churn ≈ 1 - (1 - Annual churn)^(1/12)
```

### Cohort-based churn vs. simple average
Simple average churn (total churned / total customers) is misleading for growing companies with a large share of new customers. New cohorts often churn faster than mature cohorts.

If churn data is available by cohort, use it.
If only a single churn rate is available, state it explicitly and flag that it may overstate or understate LTV depending on cohort behavior.

### Constant churn assumption
The simplified formula assumes constant churn. This is often wrong:
- Real products typically have high early churn and lower late churn (surviving cohorts are self-selected)
- Using a simple average understates LTV for products with improving cohort retention

When this assumption is likely wrong, prefer the cohort method.

---

## Common LTV calculation mistakes

### Mistake 1: Using revenue instead of gross profit
LTV based on revenue overstates the actual value of a customer. For products with significant variable costs (Uber, Dropbox, e-commerce), the difference between revenue-based and gross-profit-based LTV can be 30–70%. Marketing teams using revenue-based LTV will confidently scale campaigns that actually generate losses.

### Mistake 2: Using Lifetime = 1 / Churn as if it were precise
The formula `Lifetime = 1 / Churn` assumes constant churn, which rarely holds. In reality:
- New users churn much faster than established users
- Churn rate depends on the age distribution of users in the cohort
- For non-subscription products, defining "churn" is itself ambiguous — when does an e-commerce customer "leave"?
- Even for subscriptions, users can unsubscribe and return later

This doesn't mean the simplified formula is useless — it's a reasonable back-of-envelope estimate for stable subscription businesses. But it should not be the primary method.

### Mistake 3: Using LTV = ARPU × Lifetime
This doubly wrong version uses revenue (ARPU) instead of gross profit AND relies on the questionable Lifetime metric. Never use this formula.

### Mistake 4: Multiplying average purchases by average order value
`LTV = Avg Purchases × Avg Order Value` ignores gross margin, ignores time value, and hides cohort dynamics. The averages blend new and old users, producing a number that describes no real user.

### Mistake 5: Presenting LTV without a time horizon
"Our LTV is $300" is meaningless without specifying the period. LTV month 6 and LTV month 36 are very different numbers with very different implications for decision-making.

---

## Invalid-use conditions

The calculation is incomplete or misleading if:
- LTV is based on revenue, not gross profit
- LTV is presented without a time horizon
- The simplified formula is used for a non-subscription business
- Churn rate is missing (for the simplified formula)
- Gross margin is missing or assumed to be 100%
- CAC excludes significant non-advertising S&M costs (salaries, tools)
- The simplified formula mixes monthly and annual time units without conversion
- A high LTV:CAC ratio is used to justify unlimited scaling without testing CAC curve behavior at higher spend

---

## Output expectations

A complete output includes:
- LTV with method stated (cohort-based or simplified formula)
- LTV time horizon specified
- All inputs and assumptions stated
- CAC with formula and all inputs stated
- LTV:CAC ratio with benchmark comparison
- Payback period
- Key assumptions identified
- Interpretation: healthy / marginal / unsustainable
- Top improvement levers
- Sensitivity note: which input change would most affect the ratio?

---

## Behavioral rules under missing inputs

If cohort-level gross profit data is available:
- Use the cohort method as primary
- Present LTV curve at key time horizons (month 6, month 12, month 24)

If only aggregate metrics are available (ARPU, churn, margin):
- Use the simplified formula with explicit caveats
- State all assumptions
- Recommend the team build cohort-level tracking

If churn is missing:
- State LTV cannot be calculated with the simplified formula without it
- Offer scenario ranges tied to labeled churn assumptions
- Do not pick a default churn rate and proceed as if it's fact

If gross margin is missing:
- State LTV cannot be calculated without it
- Offer illustrative scenarios at 60%, 70%, 80% margin with explicit labels

If CAC by channel is missing:
- Calculate blended CAC only
- Flag that blended CAC may hide channel-level economics problems
- Recommend the team break it out before making channel investment decisions

---

## Relationship to adjacent skills

LTV:CAC should come before or alongside:
- analyze-unit-economics (LTV:CAC is a key output of unit economics)
- build-business-case (LTV:CAC grounds investment cases)
- strategize-channel-campaigns (CAC by channel feeds channel decisions)
- run-forecasting-scenarios (LTV:CAC assumptions feed growth forecasts)
