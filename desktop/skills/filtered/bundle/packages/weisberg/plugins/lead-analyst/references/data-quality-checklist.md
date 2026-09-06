# Data Quality Checklist

Use this checklist for `/lead-analyst:data-quality-audit` and any analysis plan
that makes claims from data.

## Core Checks

| Check | Question | Common Failure |
|-------|----------|----------------|
| Freshness | Does the data cover the intended decision window? | Last refresh failed or partial day treated as full day. |
| Grain | Is one row the entity the analysis assumes? | Customer-level claim built from session-level rows. |
| Duplicates | Are duplicate rows present at the analysis grain? | Join fanout or repeated extracts inflate counts. |
| Missingness | Are key fields missing by segment/time/source? | Nulls concentrated in one variant, channel, or cohort. |
| Join Loss | How many records drop at each join? | Inner join silently removes the affected population. |
| Units | Are currency, timezone, percentage, and count units consistent? | Dollars mixed with cents, UTC mixed with local time. |
| Definition Drift | Did event names, filters, or source semantics change? | Metric movement is instrumentation, not behavior. |
| Outliers | Are extreme values real, capped, duplicated, or malformed? | One enterprise account dominates "average user" value. |
| Eligibility | Is the denominator the population that could experience the outcome? | Conversion denominator includes users never exposed. |
| Survivorship | Are churned, failed, or inactive entities missing? | Only successful customers remain in the dataset. |

## Severity

- **Critical** - likely invalidates the decision or reverses the answer.
- **Major** - materially weakens confidence or requires caveat/fix before use.
- **Minor** - should be fixed, but unlikely to change the decision.
- **Info** - useful context or instrumentation debt.

## Minimum Evidence

- Row count and date coverage.
- Column list and inferred/declared types.
- Analysis grain and duplicate count at that grain.
- Missingness for key fields.
- Join-loss counts for every join used in the answer.
- Reconciliation to a known dashboard, source total, or prior run when possible.
