## Input
Our March cohort is showing 60% week-4 retention vs. 45% for all other cohorts. This is a major breakthrough. The new onboarding we shipped in March must be working really well. We should immediately roll out the March onboarding to all users.

Cohort sizes:
- March cohort: 38 users
- All other cohorts: 200-350 users each

## Expected output

Observed result:
March cohort week-4 retention: 60%
All other cohorts week-4 retention: 43-47% range

The 60% vs. 45% comparison is not a reliable finding.

Problem: the March cohort has 38 users.

At 38 users, the retention rate is extremely sensitive to individual user behavior. A difference of just 6 users retained changes the rate by ~16 percentage points.

```
At 38 users: 23 retained = 60.5%, 17 retained = 44.7%
That's a 6-user swing producing a 16pp difference.
```

When a cohort is this small, the confidence interval around the retention estimate is very wide. The "60%" number has no statistical reliability. It could reflect:
- A small sample of particularly engaged users who happened to sign up in March
- A traffic source that sent higher-quality users that month
- Random variation

What would be needed to claim a breakthrough:
- The cohort size should be at least 200 users before drawing directional conclusions
- 500+ users for a confident comparison
- Even then, a cohort-level comparison is observational — it does not prove the onboarding caused the difference

What is safe to do now:
Treat the March result as an early directional signal worth watching. Continue accumulating cohort data. Once the next 2-3 cohorts with adequate sizes (200+ users) are available, check whether the retention improvement persists. If it does, design a controlled experiment to confirm causality before rolling out.

Do not roll out the March onboarding based on this data.
