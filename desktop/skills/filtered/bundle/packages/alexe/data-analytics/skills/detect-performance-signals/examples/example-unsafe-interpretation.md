## Input
Our onboarding completion rate went from 62% to 67% this week, that's 8% up. We shipped a new progress bar feature on Monday. We should rollback — wait, no, it went up. We should ship this everywhere now. Can you confirm this is a positive signal?

Additional info: the metric is based on 45 completed onboardings this week vs. 40 last week.

## Expected output

Observed change:
Onboarding completion rate: 62% to 67%, a +5 percentage point absolute increase.
```
WoW% = (67 - 62) / 62 × 100 = +8.1%
```

The problem: 45 events this week, 40 events last week.

At this volume, the signal is not reliable.

The rate is calculated from very small counts. A difference of 5 completed onboardings (45 vs. 40) at a roughly stable denominator is producing the 5pp difference.

```
If we assume ~72 onboarding starts this week:
  62% × 72 = ~45 completions

If just 3 fewer users happened to drop off this week due to random variation:
  48 / 72 = 66.7% ≈ 67%
```

At 40-45 events per week, a 3-user difference moves the rate by ~4 percentage points. The "signal" is smaller than the noise at this volume.

Why acting on this is unsafe:

The 200-event minimum exists for conversion metrics because below that threshold, week-to-week variance from random fluctuation is larger than the effect being measured. At 45 events, the 95% confidence interval around a 67% rate is approximately ±11 percentage points. That means the true rate could plausibly be anywhere from 56% to 78%.

The prior week's 40 events at 62% has a similarly wide interval. These intervals overlap substantially. There is no statistical basis for claiming the rate improved.

What this data can tell you:

The direction is positive, which is worth noting. But at this volume, it could just as easily reverse next week with no product change.

Recommended path:
- Continue collecting data. At current volume of ~45 events per week, you need approximately 4-5 weeks before drawing any conclusions.
- If this metric is important and the volume is genuinely this low, consider whether the scope of the feature test can expand to increase event volume.
- Once you have 200+ events per period, use the z-score approach to assess whether the improvement is real.

Do not ship based on this week's reading.
