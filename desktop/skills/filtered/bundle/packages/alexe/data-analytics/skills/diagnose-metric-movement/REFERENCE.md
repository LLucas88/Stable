# Reference: Diagnose Metric Movement

## Why this reference exists

This skill is calculation-aware.

Its job is to systematically determine why a metric moved — ruling out instrumentation errors, mix shifts, and confounds before attributing the change to a product decision. The output is a ranked set of candidate causes with evidence, not a single confident conclusion.

This reference defines:
- calculation logic for week-over-week change and segment decomposition
- data quality check checklist
- timeline correlation rules
- cause ranking heuristic
- output format expectations

---

## Week-over-week change

```
WoW_change = (current - prior) / prior × 100
```

Always compute both absolute change (percentage points for rate metrics) and relative change (%).

Example: checkout conversion 4.2% last week, 3.6% this week
```
WoW_change = (3.6 - 4.2) / 4.2 × 100 = -14.3%
absolute_change = 3.6% - 4.2% = -0.6pp
```

---

## Segment decomposition

A metric change can have two types of drivers:

**Rate change:** the conversion rate (or retention rate, etc.) changed within a segment.

**Mix shift:** the composition of the population changed. More users from a low-converting segment and fewer from a high-converting segment will lower the overall rate even if neither segment's rate changed.

To distinguish between these, decompose the metric by dimension:

```
overall_metric = sum_i ( segment_share_i × segment_rate_i )
```

If overall metric drops but each segment's rate is stable, the driver is mix shift. If one segment's rate dropped while its share is stable, the driver is a rate change in that segment.

Example:
- Last week: mobile 60% of traffic at 3.0% conversion, desktop 40% at 5.5%. Overall = 0.6×3.0 + 0.4×5.5 = 4.0%
- This week: mobile 70% of traffic at 3.0% conversion, desktop 30% at 5.5%. Overall = 0.7×3.0 + 0.3×5.5 = 3.75%
- Neither segment rate changed. The drop is entirely from a mix shift (more mobile traffic).

This is critical. Acting on a mix shift as if it were a product problem wastes investigation time and leads to wrong conclusions.

---

## Data quality checklist

Check in this order before declaring a signal real:

1. **Event volume stable?** If the number of events underlying the metric dropped abnormally, suspect a tracking or pipeline issue before a product issue.

2. **Pipeline lag?** Some data pipelines have delayed processing. A metric that appears to have dropped may have simply not finished ingesting.

3. **Deploy timestamp matches anomaly start?** Check the event log for deployments in the 3 days before the metric change began. If the drop started on Tuesday and a deploy went out Tuesday morning, that correlation is the primary suspect.

4. **Tracking change in the same window?** If event schema, naming, or attribution logic changed in the same deploy window, the apparent metric change may be a measurement artifact.

A general rule: instrumentation and data issues are more common than real product regressions. Always clear the data quality checklist before investigating product causes.

---

## Timeline correlation

Product deploys within ±3 days of a metric change are primary suspects.

Check the deploy log and identify:
- What changed
- Which surfaces or user paths were affected
- Whether the change was mobile-only, desktop-only, or both
- Whether a rollback is feasible and what the expected recovery timeline is

A deploy that affected mobile only should produce a mobile-specific metric drop. If the drop is also present on desktop, the deploy is a weaker candidate.

---

## External event calendar

Check for:
- Public holidays (can shift traffic volume and user intent)
- Competitor news or outages (can drive traffic spikes or drops)
- Broad market events (payment processor outages, platform updates)
- Seasonal patterns for the product type (if August historically has lower engagement, a WoW drop in August needs seasonal context)

External events are systematically underestimated as explanations. Check them explicitly rather than dismissing them by default.

---

## Cause ranking heuristic

Rank candidate causes in this order when evidence is ambiguous:

1. Instrumentation or data issue (most common, check first)
2. Product change or deploy (especially if timing aligns)
3. Mix shift in traffic composition
4. External event (seasonality, competitor, market event)
5. Genuine organic product regression (rarest, requires ruling out all above)

This order reflects empirical frequency, not certainty. If evidence clearly points to a lower-ranked cause, follow the evidence.

---

## Output format

For each investigation, provide:

- Metric change summary (magnitude, direction, timing)
- Data quality check results (each item in the checklist, clean or flagged)
- Timeline of relevant product changes
- External confound assessment
- Segment breakdown analysis (which segments moved, which were stable)
- Ranked candidate causes with evidence weight for each
- Most probable cause
- Recommended next step to confirm
