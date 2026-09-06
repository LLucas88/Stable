## Input
We want to understand our unit economics. We're a B2B SaaS. Revenue is about $2M ARR and growing. We spend around $80k/month on sales and marketing. We brought on 40 new customers last month.

## Expected output
Status:
Partial inputs — LTV cannot be calculated. CAC can be calculated. Full unit economics analysis requires churn and gross margin.

What can be calculated now:
CAC = $80,000 / 40 = $2,000 per new customer
Average contract value = $2,000,000 ARR / customer count (unknown) — cannot calculate without customer count

What is missing for LTV:
- Gross margin: required to calculate gross profit per customer. At 70% margin, ACV × 0.70 is the gross profit. At 50%, it's substantially lower.
- Annual churn rate: required to estimate customer lifetime. This is the most critical missing input.
- Customer count: required to calculate average contract value per customer.

What can be estimated with scenarios:
Assuming 70% gross margin and unknown ACV:

If average customer count is 400 (implies $5,000 ACV):
- Annual gross profit per customer: $5,000 × 0.70 = $3,500
- At 10% annual churn: LTV = $3,500 / 0.10 = $35,000. LTV:CAC = 17.5x
- At 20% annual churn: LTV = $3,500 / 0.20 = $17,500. LTV:CAC = 8.75x
- At 30% annual churn: LTV = $3,500 / 0.30 = $11,667. LTV:CAC = 5.8x

If average customer count is 200 (implies $10,000 ACV):
- Annual gross profit per customer: $10,000 × 0.70 = $7,000
- At 10% annual churn: LTV = $70,000. LTV:CAC = 35x
- At 20% annual churn: LTV = $35,000. LTV:CAC = 17.5x

These are scenarios, not the actual ratio. The range is very wide ($2,000 CAC produces ratios from 5x to 35x depending on ACV and churn). This makes the missing inputs critical — not optional.

Payback period (can estimate per scenario):
At ACV $5,000, 70% margin: payback = $2,000 / ($5,000 × 0.70 / 12) = $2,000 / $292 = 6.9 months
At ACV $10,000, 70% margin: payback = $2,000 / ($10,000 × 0.70 / 12) = $2,000 / $583 = 3.4 months

Recommended next inputs:
- Current customer count (to calculate average ACV)
- Annual customer churn rate
- Gross margin percentage (after infrastructure, support, and third-party costs)
