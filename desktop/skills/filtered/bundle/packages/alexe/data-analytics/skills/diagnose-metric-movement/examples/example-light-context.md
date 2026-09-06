## Input
Our signup-to-paid conversion rate dropped from 8% to 5% sometime in the last two weeks. We've been doing some work on the pricing page and the checkout flow. Not sure exactly when the drop started.

## Expected output
Metric change summary:
Signup-to-paid conversion dropped from 8% to 5% — a 37.5% relative decline. Timing is uncertain within a two-week window. Duration unknown.

Data quality check results:
Cannot confirm data quality without more information. The first step before attribution is to verify the conversion tracking is working correctly — did the checkout_started or payment_completed events change alongside the conversion rate, or is this a dashboard calculation issue?

Instrumentation issues found:
Unknown. Pricing page and checkout flow changes often involve funnel steps where tracking can break. Need to confirm all conversion funnel events are still firing as expected.

Timeline of product changes in the window:
- Pricing page changes (timing unclear)
- Checkout flow changes (timing unclear)
Two changes in the same window make isolation harder. Need exact deploy dates for both.

External confound assessment:
No external information provided. Not possible to rule out traffic mix shift or external events without data.

Segment breakdown analysis:
Not available. To start diagnosing: segment by acquisition source (paid vs. organic) to check if the drop is uniform or concentrated in one channel. Also check mobile vs. desktop if the checkout flow change had a platform-specific implementation.

Ranked candidate causes:
1. Checkout flow change introduced friction or a technical issue (high probability given timing and scope of change)
2. Pricing page change reduced perceived value or introduced confusion at the decision point (plausible)
3. Traffic mix shift — more lower-intent users arriving in the same period (possible but requires data to assess)
4. Instrumentation issue from checkout flow rework (must be ruled out first)

Most probable cause with evidence:
Cannot rank confidently without knowing exact deploy dates and whether the drop correlates precisely with a specific change. The checkout flow change is the most likely candidate given it's directly in the conversion path.

Recommended next step to confirm:
1. Pull daily conversion rate for the past 4 weeks to identify the exact start date — correlate with deploy dates
2. Verify checkout funnel events are firing correctly post-deploy
3. Segment by device and acquisition source
4. If deploy dates are pinpointed, compare same-week prior month to separate the product change signal from seasonality
