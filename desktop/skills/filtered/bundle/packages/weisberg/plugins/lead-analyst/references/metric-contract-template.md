# Metric Contract Template

Use this template for `/lead-analyst:metric-contract`.

```markdown
# Metric Contract: <metric name>

Status: Draft / Approved / Deprecated
Owner: <team/person>
Last updated: YYYY-MM-DD

## Decision Use
What decision does this metric inform? Who relies on it?

## Plain-English Definition
One sentence a non-analyst can repeat accurately.

## Formal Definition
- Numerator:
- Denominator:
- Grain:
- Population / eligibility:
- Exclusions:
- Time window:
- Time zone:
- Attribution window:
- Refresh cadence:
- Source of truth:

## Calculation Logic
SQL, pseudocode, semantic-layer definition, or implementation notes.

## Required Dimensions
Segments, filters, or cuts that must be supported.

## Quality Checks
- Freshness:
- Duplicate grain:
- Missingness:
- Denominator drift:
- Event/schema drift:
- Reconciliation target:

## Known Caveats
What this metric does not measure, where it is biased, and what it should not be
used to decide.

## Related Metrics
Upstream, downstream, guardrail, and deprecated variants.

## Change Control
Who can change this metric, how changes are announced, and how history is
backfilled or versioned.
```
