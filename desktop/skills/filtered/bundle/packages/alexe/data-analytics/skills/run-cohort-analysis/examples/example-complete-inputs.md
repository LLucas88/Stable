## Input
B2C mobile app, habit-tracking product. Metric: users active in any given week (completed at least one habit check-in). Cohort definition: signup week.

Cohort table (weekly retention, % of original cohort):

| Cohort | Size | Week 0 | Week 1 | Week 2 | Week 3 | Week 4 |
|--------|------|--------|--------|--------|--------|--------|
| Sep wk3 | 680 | 100% | 44% | 31% | 24% | 20% |
| Sep wk4 | 710 | 100% | 46% | 33% | 26% | 22% |
| Oct wk1 | 720 | 100% | 48% | 35% | 28% | 24% |
| Oct wk2 | 690 | 100% | 52% | 40% | 33% | 28% |
| Oct wk3 | 740 | 100% | 57% | 44% | 36% | - |
| Oct wk4 | 760 | 100% | 61% | 48% | - | - |

Note: a new streak-based engagement feature was shipped on Oct 14 (between Oct wk1 and Oct wk2).

## Expected output

Cohort definition and metric:
- Cohort: signup week (time-based)
- Metric: weekly active (completed at least one habit check-in)
- Measurement window: 5 periods (week 0 through week 4)

Cohort table calculations:

Sample cell verification:
```
retention(Sep wk3, week 1) = users_active / cohort_size = 299 / 680 = 44%
retention(Oct wk4, week 1) = 464 / 760 = 61%
```

Retention curve analysis:

Shape: all cohorts show the classic decay curve, but the plateau level is improving across cohorts. Sep cohorts decay to ~20-22% by week 4. Oct wk2 onward is tracking to 28%+ at week 4, a material improvement.

The decay pattern is consistent (steep drop in week 1, slower decline after), which suggests users who survive the first week have higher stickiness. This is typical of habit products.

Cohort-to-cohort comparison:

| Cohort | Week 1 | Week 4 | Week 1 improvement vs. Sep wk3 |
|--------|--------|--------|-------------------------------|
| Sep wk3 | 44% | 20% | baseline |
| Sep wk4 | 46% | 22% | +2pp |
| Oct wk1 | 48% | 24% | +4pp |
| Oct wk2 | 52% | 28% | +8pp |
| Oct wk3 | 57% | - | +13pp |
| Oct wk4 | 61% | - | +17pp |

The jump between Oct wk1 and Oct wk2 is the largest single-cohort improvement: +4pp at week 1 for Oct wk1 vs. +8pp for Oct wk2 at week 1. This aligns with the Oct 14 streak feature ship date.

Event annotation:
Oct 14 streak feature ship falls between Oct wk1 and Oct wk2 cohorts. The Oct wk2 cohort is the first fully exposed to the streak feature from day 1. The step-change in retention starting with Oct wk2 is consistent with the feature having an effect.

Key insights:
1. Week-1 retention has improved ~17pp over 6 weeks (44% to 61%). The largest step-change coincides with the Oct 14 feature ship. This is a strong directional signal that the streak feature is increasing early retention.

2. The plateau is also improving. Sep cohorts stabilize around 20-22%. Oct wk2+ cohorts are tracking to 28%+. If this holds, it suggests the improvement is not just in initial engagement but in longer-term habituation.

3. Week-0 to week-1 is still the steepest drop across all cohorts (losing ~40-50% of users). The streak feature improved this, but there is still meaningful drop-off in the first week. This remains the highest-leverage drop-off point to address.

Recommended next steps:
1. Let Oct wk3 and Oct wk4 reach week 4 to confirm if the plateau improvement holds
2. Run an A/B experiment with the streak feature as treatment to confirm causality (the cohort data is directional, not controlled)
3. Investigate what's different about users who survive week 1: are they setting up more habits, using reminders, or coming from a specific acquisition source?
