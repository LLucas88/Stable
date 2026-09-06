# RFM Methodology Reference

## Overview

RFM (Recency, Frequency, Monetary) analysis segments customers based on
transactional behavior. Each dimension captures a distinct aspect of customer
value and engagement.

## Metric Definitions

| Dimension | Calculation | Interpretation |
|---|---|---|
| **Recency (R)** | Days since the customer's most recent transaction relative to the analysis date | Lower = better (more recent) |
| **Frequency (F)** | Count of transactions within the analysis window | Higher = better |
| **Monetary (M)** | Sum of transaction amounts within the analysis window (or average per transaction) | Higher = better |

## Quintile Scoring

Each dimension is scored 1-5 using quantile-based binning (quintiles):

- **Score 5** — Top 20% (best performers)
- **Score 4** — 60th-80th percentile
- **Score 3** — 40th-60th percentile
- **Score 2** — 20th-40th percentile
- **Score 1** — Bottom 20% (worst performers)

### Recency Inversion

Because lower recency (fewer days since last purchase) is better, the score
is inverted: customers in the lowest recency quintile (most recent) receive
score 5.

### Quintile Boundary Guidance

- Use `pandas.qcut` with `q=5` for automatic quintile computation.
- Handle duplicate boundaries by falling back to `pandas.cut` with rank-based
  assignment when `qcut` raises a `ValueError` due to non-unique bin edges.
- Recompute boundaries monthly to account for customer base evolution and
  seasonal distribution shifts.
- For small datasets (< 100 customers), consider terciles (3 bins) instead
  of quintiles to ensure meaningful group sizes.
- Document the exact boundary values used in each scoring run for auditability.

### Boundary Persistence

Store computed boundaries in `workspace/processed/rfm_boundaries.json`:

```json
{
  "analysis_date": "2026-03-01",
  "recency_boundaries": [0, 14, 35, 72, 140, 365],
  "frequency_boundaries": [1, 2, 4, 8, 15, 100],
  "monetary_boundaries": [10.0, 50.0, 150.0, 400.0, 1000.0, 50000.0]
}
```

## Composite RFM Score

Two common approaches:

1. **Concatenated string** — e.g., R=5, F=4, M=3 produces "543". Useful for
   granular segment mapping with 125 possible combinations.
2. **Weighted sum** — e.g., `0.4*R + 0.3*F + 0.3*M`. Useful for ranking.
   Default weights emphasize recency, but weights should be tuned per business.

## Segment Label Mapping

Map composite RFM scores to named business segments:

| Segment | R Score | F Score | M Score | Composite Range |
|---|---|---|---|---|
| **Champions** | 4-5 | 4-5 | 4-5 | Top tier across all dimensions |
| **Loyal Customers** | 3-5 | 4-5 | 3-5 | High frequency, solid recency and spend |
| **Potential Loyalists** | 4-5 | 1-3 | 1-3 | Recent but low frequency — nurture opportunity |
| **New Customers** | 5 | 1 | 1-3 | First-time or very recent, single purchase |
| **Promising** | 3-4 | 1-2 | 1-2 | Moderate recency, low engagement — watch list |
| **Needs Attention** | 3 | 3 | 3 | Middle of the road — risk of decline |
| **At-Risk** | 1-2 | 4-5 | 4-5 | Previously high-value, now lapsing |
| **About to Sleep** | 2-3 | 1-2 | 1-2 | Drifting away, low engagement |
| **Hibernating** | 1-2 | 1-3 | 1-3 | Inactive for extended period |
| **Lost** | 1 | 1 | 1-2 | Long-inactive, minimal historical value |

### Mapping Logic

Apply rules in priority order (first match wins):

```
if R >= 4 and F >= 4 and M >= 4 -> Champions
if F >= 4 and M >= 3 and R >= 3 -> Loyal Customers
if R >= 4 and F <= 3 and M <= 3 -> Potential Loyalists
if R == 5 and F == 1            -> New Customers
if R >= 3 and F <= 2 and M <= 2 -> Promising
if R == 3 and F == 3 and M == 3 -> Needs Attention
if R <= 2 and F >= 4 and M >= 4 -> At-Risk
if R <= 3 and F <= 2 and M <= 2 -> About to Sleep
if R <= 2 and F <= 3 and M <= 3 -> Hibernating
else                             -> Lost
```

## Analysis Window

- Default analysis window: 12 months of transaction history.
- For high-frequency businesses (e.g., grocery, SaaS), consider 6 months.
- For low-frequency businesses (e.g., automotive, real estate), consider 24 months.
- Always document the window used and the analysis reference date.

## Validation Rules

- Every customer must be assigned to exactly one segment.
- Quintile scores must be integers in [1, 5].
- No customer should have null values for any RFM dimension after imputation.
- Segment distribution should be reviewed for reasonableness (no single segment
  should contain > 50% of customers unless the business model warrants it).
