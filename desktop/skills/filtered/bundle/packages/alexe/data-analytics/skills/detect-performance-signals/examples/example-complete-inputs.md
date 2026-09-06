## Input
E-commerce product, checkout completion rate.

Baseline over last 6 weeks: 4.1%, 4.0%, 4.2%, 4.3%, 4.0%, 4.1%
This week: 3.3%

Traffic volume is consistent (~12,000 checkout initiations per week this week vs. ~11,800-12,200 in prior weeks). No campaigns or promotions running. One deploy went out Tuesday: a UI refactor of the checkout summary page.

## Expected output

Signal summary:
Checkout completion rate dropped from a 6-week average of 4.1% to 3.3% this week. That is a -0.8 percentage point absolute drop and a -19.5% relative decline.

```
WoW% = (3.3 - 4.1) / 4.1 × 100 = -19.5%
```

Baseline context:
6-week values: 4.1, 4.0, 4.2, 4.3, 4.0, 4.1
```
mean = (4.1 + 4.0 + 4.2 + 4.3 + 4.0 + 4.1) / 6 = 4.117%
variance = average of squared deviations = 0.0122
std_dev = sqrt(0.0122) ≈ 0.11

Actually: deviations from mean: -0.017, -0.117, 0.083, 0.183, -0.117, -0.017
squared: 0.000289, 0.013689, 0.006889, 0.033489, 0.013689, 0.000289
mean squared: 0.011472
std_dev ≈ 0.107%

z = (3.3 - 4.117) / 0.107 = -7.6
```

A z-score of -7.6 is far outside any normal variation threshold. This is not noise.

Data quality assessment:
- Traffic volume: 12,000 this week vs. 11,800-12,200 prior weeks. Stable. No volume anomaly.
- Tracking: checkout initiation event count is consistent, so the drop is not an instrumentation artifact (if tracking broke, initiation counts would also change).
- Segment composition: needs verification, but volume stability suggests no major traffic source shift.

Potential causes (ordered by likelihood):

1. Checkout summary page UI refactor (deployed Tuesday): highest likelihood. The deploy timing aligns with the drop start. A UI change that broke a CTA, payment method display, or order confirmation element could directly suppress completions. This is the primary suspect.

2. Mobile-specific rendering issue: if the refactor broke on mobile but not desktop, a segment split would show mobile completion dropping while desktop is stable. Worth checking before broader rollout assumptions.

3. Third-party payment provider issue: if the payment processor had degraded performance during the week, checkout completions would drop even if initiation is normal.

4. Data issue: if the completion event fires differently after the deploy (e.g., renamed event, new tracking setup), the apparent drop could be instrumentation. However, traffic volume stability makes this less likely — check event schema.

Assessment: probable real signal.

The z-score of -7.6 and the coincident Tuesday deploy make this a strong signal requiring immediate investigation. The magnitude (-19.5% relative) is large enough to affect revenue materially at 12,000 weekly checkout initiations.

Recommended next steps:
1. Check the Tuesday deploy diff: specifically the checkout summary page changes, CTAs, and any payment integration touches
2. Split checkout completion by device type (mobile vs. desktop) — if mobile dropped and desktop held, the UI refactor has a mobile-specific issue
3. Check payment provider status page or error logs for Tuesday onward
4. If a tracking change was part of the deploy, validate the completion event schema is firing correctly
