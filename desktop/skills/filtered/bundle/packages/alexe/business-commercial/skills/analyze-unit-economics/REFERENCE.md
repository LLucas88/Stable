# Reference: Analyze Unit Economics

## Why this reference exists

This skill is calculation-aware.

Unit economics analysis involves formulas that produce specific numbers. Those numbers inform real investment decisions. Producing them from incomplete or biased inputs, without disclosure, can mislead teams, investors, and stakeholders.

This reference defines:
- required inputs
- core formulas
- interpretation benchmarks
- common errors and biases
- invalid-use conditions
- behavioral rules under partial or problematic inputs

---

## Core principle

Unit economics are only as accurate as the inputs.

The most common failure modes are:
1. Churn is underestimated (survivor bias, optimistic assumption)
2. CAC excludes significant costs (salaries, tools)
3. Gross margin is overstated or assumed to be 100%
4. LTV:CAC ratio is applied to decisions it doesn't support

Do not produce unit economics numbers without stating the assumptions behind them.

---

## Mandatory inputs

For LTV calculation:
- Average revenue per customer per period (monthly or annual)
- Gross margin percentage (after COGS)
- Churn rate (same time unit as revenue)

For CAC calculation:
- Total sales and marketing spend in the period
- New customers acquired in the same period

---

## Core formulas

### LTV (subscription / recurring revenue)

```
LTV = (ARPU × Gross Margin) / Churn Rate
```

All values must use the same time unit. Do not mix monthly ARPU with annual churn.

Example:
- Monthly ARPU: $12, Gross Margin: 72%, Monthly churn: 4%
- LTV = ($12 × 0.72) / 0.04 = $8.64 / 0.04 = $216

### CAC

```
CAC = Total S&M Spend / New Customers Acquired
```

S&M spend must include:
- Paid advertising
- Salesperson and marketer salaries (prorated to acquisition, not existing account management)
- Agency fees and contractor costs
- Marketing tooling costs
- Content and SEO investment attributable to acquisition

### LTV:CAC ratio

```
LTV:CAC = LTV / CAC
```

### Payback period

```
Payback Period = CAC / (ARPU × Gross Margin)
```

Units: same as ARPU time unit (months if monthly ARPU)

---

## Interpretation benchmarks

### LTV:CAC ratio
| Ratio | Assessment |
|---|---|
| Below 1x | Unsustainable: acquiring customers at a loss on gross profit |
| 1x–2x | Marginal: barely recovering CAC |
| 2x–3x | Borderline: acceptable only with very short payback |
| 3x+ | Commonly cited threshold for sustainable growth investment |
| 3x–5x | Healthy |
| 5x–10x | Strong |
| Above 10x | May indicate underinvestment in growth |

### Payback period
| Period | Assessment (B2C subscription) | Assessment (B2B SaaS) |
|---|---|---|
| Under 6 months | Strong | Strong |
| 6–12 months | Healthy | Healthy |
| 12–18 months | Acceptable | Acceptable with low churn |
| 18–24 months | Elevated risk | Workable if NRR > 100% |
| Over 24 months | Cash-intensive; requires strong retention | High risk |

---

## Churn sensitivity

LTV is the most churn-sensitive metric. Always show what happens to LTV and LTV:CAC at different churn levels.

Rough rule: a 1 percentage point increase in monthly churn reduces LTV by approximately 15–25% (depending on baseline churn level).

Example:
- Baseline: 4% monthly churn → LTV = $216
- 5% monthly churn → LTV = $173 (−20%)
- 6% monthly churn → LTV = $144 (−33%)

If churn data is uncertain or based on a short observation window, present scenarios.

---

## Gross margin considerations

LTV must use gross margin, not revenue.

Gross margin = (Revenue − COGS) / Revenue

Commonly missed COGS items:
- Cloud hosting and infrastructure per customer
- Payment processing fees (typically 2.5–3%)
- Customer support cost per customer (if support-intensive)
- Third-party API or data costs per usage

If gross margin is unknown, state it explicitly. Do not assume 100%.

---

## Survivorship bias in LTV estimation

Calculating LTV from long-tenured customers produces an overstated estimate.

Long-tenured customers are the survivors of early churn. They represent the best-performing segment of an older cohort, not a representative sample of all customers.

In high-growth businesses: new customer cohorts often churn faster than old ones. Using mature cohort data to estimate LTV for new acquisition cohorts is misleading.

Correct approach: use recent cohort retention curves where available. If recent cohorts are too young for full LTV measurement, project from early retention data with explicit uncertainty.

Always state which cohorts were used for LTV estimation.

---

## CAC by channel

Blended CAC is a starting point, not the full picture.

A blended CAC of $30 may include:
- Paid channels at $60 CAC
- Organic channels at $0 CAC

If only the blended number is reported and paid is cut, the CAC rises. Not because paid got worse, but because the cheap organic channel no longer offsets it.

Recommendation: calculate LTV:CAC by channel wherever data allows.

---

## Invalid-use conditions

The analysis is incomplete or potentially misleading if:
- Churn rate is missing
- Gross margin is assumed to be 100%
- CAC excludes significant S&M costs
- LTV is calculated from survivor cohorts without acknowledging the bias
- LTV:CAC ratio is used to argue for unlimited spend scaling without testing CAC curve behavior
- Monthly and annual time units are mixed without conversion

---

## Output expectations

A complete output includes:
- LTV with formula and all inputs
- CAC with formula and all inputs
- LTV:CAC ratio with benchmark assessment
- Payback period with assessment
- Churn sensitivity (at least two alternative scenarios)
- Health assessment per metric
- Key improvement levers with estimated impact
- Assumptions stated and confidence level noted
- Gaps or data quality flags

---

## Relationship to adjacent skills

This skill feeds into:
- model-ltv-cac (overlapping, but analyze-unit-economics is the broader view including margin and payback)
- build-business-case (unit economics ground investment cases)
- align-revenue-strategy (economics inform strategic decisions)
- run-forecasting-scenarios (economics assumptions feed projections)
