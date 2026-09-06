## Input
We have a B2B analytics SaaS. Pricing: per-seat, 3 tiers — Starter ($49/seat/month, up to 5 seats), Growth ($39/seat/month, 6-20 seats), Enterprise (custom). Most customers are on Starter (68%) with 1-2 seats. Average contract value is $480/year. NRR is 94% — meaning we're contracting in expansion revenue. Annual churn is 19%. We see the data: customers with 4-5 seats use the product significantly more and churn at half the rate (9% vs. 19%). Expansion to additional seats happens for fewer than 12% of accounts. Customers have told us they "share logins" to avoid per-seat costs.

## Expected output
Current model description:
Per-seat pricing with 3 volume tiers. Starter tier starts at $49/seat/month. Most customers are on Starter with 1-2 seats.

Value metric assessment:
The value metric (seats) is misaligned with how customers actually use and benefit from the product. If customers are sharing logins, the product delivers value beyond the number of seats purchased. The current model is capturing only a fraction of the value delivered. Analytics platforms typically deliver value through number of analyses run, data volume, or number of dashboards shared — not simply headcount using the tool. The per-seat model may be pricing on the wrong unit.

Expansion revenue analysis:
NRR of 94% means the business is contracting — customers are churning or downgrading faster than others expand. Only 12% of accounts expand to additional seats. The per-seat model creates seat expansion friction (customers avoid adding seats to reduce cost) which is the root cause of low expansion. The login-sharing behavior directly confirms this friction.

Competitive pricing position:
Not provided — competitive data not supplied. Generally, per-seat pricing for analytics tools is being displaced by usage-based models (queries, dashboards, data volume) which better align cost with value and remove the "team member upgrade" friction.

Structural issues identified:
1. Per-seat model disincentivizes adoption: adding a new team member to the product triggers a cost increase. This creates a conflict between product adoption and budget management.
2. Login sharing is a clear pricing signal: when customers share logins, they are signaling that per-seat pricing is misaligned with their willingness to pay.
3. NRR below 100% in a B2B SaaS is a red flag: it means the existing customer base is shrinking in aggregate, which offsets new customer acquisition.
4. The 4-5 seat customers churning at 9% vs. 19% for 1-2 seat customers is a strong signal: more deeply embedded customers retain better. The pricing model makes it harder to become deeply embedded.

Alternative model options with trade-offs:

| Model | Pros | Cons |
|---|---|---|
| Usage-based (per dashboard / per report) | Removes seat barrier, aligns with value, self-serve expansion | Revenue unpredictability, complex billing |
| Flat fee per workspace + light seat limit | Removes seat friction for small teams, predictable | Harder to monetize large teams, less expansion upside |
| Usage + seats hybrid | Covers both activation and depth of use | Complex, harder to communicate |
| Keep per-seat, lower Starter price | Reduces adoption friction slightly | Doesn't fix the root misalignment |

Recommendation: adjust
The per-seat model needs structural change to fix NRR. The most actionable change is: move to a workspace/account-based flat fee for Starter (removes login-sharing behavior) with per-seat pricing only for Growth and above. This reduces the adoption friction for small teams while maintaining seat-based expansion for larger teams.

Alternatively, pilot a usage-based component (dashboards viewed, reports generated) as an add-on — validate whether usage-based pricing improves NRR before committing to a full model migration.

Validation steps before changing the model:
1. Survey 20-30 Starter customers: what would they be willing to pay for unlimited seats on their current usage? This reveals whether flat-fee Starter is viable.
2. Pilot a "team" plan at $120/month flat for up to 5 users with 5 volunteer accounts — measure whether account expansion and feature usage increase.
3. Before announcing any pricing change: model the impact on existing 68% Starter base. Migration incentive may be needed to avoid churn during the transition.
